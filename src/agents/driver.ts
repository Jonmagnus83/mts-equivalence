import { squiggleFor } from '../abstract-symbols';
import { feedbackWords, instructionText, wrongWord } from '../config';
import { allStimulusIds } from '../relations';
import { mulberry32 } from '../rng';
import { Session } from '../session';
import type { ExperimentConfig, TrialRecord } from '../types';
import { CORNERS } from '../types';
import type { AgentExportData, AgentTraceExport } from './meta';
import {
  PROTOCOL,
  agentVisibleRequest,
  capMeta,
  makeRunId,
  protocolReason,
  type AgentPlugin,
  type LabEndReason,
  type PreviousOutcome,
  type SessionEnd,
  type SessionStart,
  type TrialResponse,
  type VisibleTrialRequest,
} from './protocol';
import { comparisonsInReadingOrder, resolveChoice, type ReadingSlot } from './reading-order';
import { buildSnapshot, type LiveTrial, type ObserverSnapshot } from './stats';

export interface DriverOptions {
  config: ExperimentConfig;
  participantNumber: number;
  seed: number;
  agent: AgentPlugin;
  limits: { maxBlocks: number; maxTrials: number };
  pace: 'rask' | 'sanntid';
  revealCorrection: boolean;
  runId?: string;
  now?: () => number;
  mono?: () => number;
  sleep?: (ms: number) => Promise<void>;
  getPace?: () => 'rask' | 'sanntid';
  beforeTrial?: () => Promise<void>;
  beforeChoice?: (session: Session) => void;
  shouldStop?: () => boolean;
  onChange?: () => void;
  onView?: (view: ObserverSnapshot) => void;
  yieldFrame?: () => Promise<void>;
}

export interface AgentRunResult {
  reason: LabEndReason;
  session: Session;
  exportMeta: AgentExportData;
  sessionEnd: SessionEnd;
  message: string;
}

export async function runAgentSession(options: DriverOptions): Promise<AgentRunResult> {
  const paceOf = options.getPace ?? (() => options.pace);
  const stop = options.shouldStop ?? (() => false);
  const now = options.now ?? (() => Date.now());
  const mono = options.mono ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const limits = {
    maxBlocks: Math.max(1, Math.floor(options.limits.maxBlocks)),
    maxTrials: Math.max(1, Math.floor(options.limits.maxTrials)),
  };
  const runId = options.runId ?? makeRunId(new Date(now()), options.participantNumber);
  const session = new Session(
    options.config,
    options.participantNumber,
    mulberry32(options.seed >>> 0),
    now,
    options.onChange ?? (() => undefined),
  );
  const traces: AgentTraceExport[] = [];
  let reason: LabEndReason = 'ferdig';
  let message = '';
  let previous: PreviousOutcome | null = null;
  let invalidStreak = 0;
  let live: LiveTrial | null = null;
  let sampleClicks = 0;
  const startedUtc = new Date(now()).toISOString();
  const clock = options.pace === 'sanntid' ? 'sanntid' : 'virtuell';

  const emit = (finished: boolean) => {
    options.onView?.(
      buildSnapshot({
        config: options.config,
        trials: session.trials,
        traces,
        runId,
        agentId: options.agent.agentId,
        agentType: options.agent.agentType,
        maxBlocks: limits.maxBlocks,
        maxTrials: limits.maxTrials,
        finished,
        endReason: finished ? reason : null,
        message,
        current: live,
      }),
    );
  };

  try {
    await options.agent.init(sessionStart(options, runId, limits));
  } catch (error) {
    reason = 'agent_feil';
    message = error instanceof Error ? error.message : 'Agenten svarte ikke på session_start.';
    session.halt();
  }

  if (!session.finished) session.start();
  let steps = 0;
  while (!session.finished) {
    if (stop()) {
      reason = 'avbrutt';
      session.halt();
      break;
    }
    if (++steps > 20000) {
      reason = 'agent_feil';
      message = 'Økten ble stoppet av en intern grense.';
      session.halt();
      break;
    }
    await options.beforeTrial?.();
    if (stop()) {
      reason = 'avbrutt';
      session.halt();
      break;
    }
    const screen = session.screen;
    if (screen.type === 'sample') {
      sampleClicks += 1;
      if (sampleClicks > 12) {
        reason = 'agent_feil';
        message = 'Utvalgsklikket kom ikke videre.';
        session.halt();
        break;
      }
      session.clickSample();
      continue;
    }
    if (screen.type === 'delay' || screen.type === 'feedback' || screen.type === 'iti') {
      const wait = session.pendingWaitMs() ?? 0;
      if (paceOf() === 'sanntid' && wait > 0) await sleep(wait);
      session.completeWait();
      continue;
    }
    if (screen.type === 'pause') {
      session.resume();
      continue;
    }
    if (screen.type !== 'choice') break;
    sampleClicks = 0;
    if (session.startedBlocks() > limits.maxBlocks || session.trials.length >= limits.maxTrials) {
      reason = 'ikke_mestret';
      session.halt();
      break;
    }
    options.beforeChoice?.(session);
    const programmed = session.currentProgrammed();
    if (!programmed) {
      reason = 'agent_feil';
      message = 'Mangler programmert forsøk.';
      session.halt();
      break;
    }
    await options.agent.noteStage?.({ training: programmed.phase === 'trening' });
    const slots = comparisonsInReadingOrder(screen.options);
    const visible = agentVisibleRequest(
      trialRequest(options, runId, programmed, slots, previous, session.trials.length + 1),
    );
    const started = mono();
    let accepted: { response: TrialResponse; slot: ReadingSlot } | null = null;
    let attempts = 0;
    let lastError = '';
    while (attempts < 3 && !accepted) {
      attempts += 1;
      try {
        const raw = await options.agent.decide(structuredClone(visible));
        const parsed = asResponse(raw, visible);
        if (!parsed) {
          lastError = 'Svaret mangler position.';
          continue;
        }
        const resolved = resolveChoice(slots, parsed.position, parsed.corner);
        if (!resolved.ok) {
          lastError = resolved.message;
          continue;
        }
        accepted = { response: parsed, slot: resolved.slot };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'decide feilet';
      }
    }
    const measured = Math.max(0, Math.round(mono() - started));
    if (!accepted) {
      invalidStreak += 1;
      session.recordInvalidChoice();
      const trial = session.trials[session.trials.length - 1];
      if (trial) trial.rt_sammenligning_ms = measured;
      traces.push({
        forsøk_nr: trial?.forsøk_nr ?? traces.length + 1,
        position: null,
        latencyMs: measured,
        invalid: 1,
        attempts,
        request: visible,
        response: null,
      });
      previous = previousFrom(trial, null);
      live = liveFrom(programmed, slots, trial, null, measured, '');
      message = lastError;
      emit(false);
      await options.yieldFrame?.();
      if (invalidStreak >= 3) {
        reason = 'agent_feil';
        session.halt();
        break;
      }
      continue;
    }
    invalidStreak = 0;
    const latency =
      typeof accepted.response.latency_ms === 'number' && accepted.response.latency_ms >= 0
        ? Math.round(accepted.response.latency_ms)
        : measured;
    session.clickComparison(accepted.slot.stimulus, accepted.slot.corner);
    const trial = session.trials[session.trials.length - 1];
    if (trial) trial.rt_sammenligning_ms = latency;
    const route = typeof accepted.response.meta?.route === 'string' ? accepted.response.meta.route : '';
    traces.push({
      forsøk_nr: trial?.forsøk_nr ?? traces.length + 1,
      position: accepted.response.position,
      latencyMs: latency,
      invalid: 0,
      attempts,
      request: visible,
      response: accepted.response,
    });
    previous = previousFrom(trial, accepted.response.position);
    live = liveFrom(programmed, slots, trial, accepted.response.position, latency, route);
    message = '';
    emit(false);
    await options.yieldFrame?.();
  }

  const endedUtc = new Date(now()).toISOString();
  const programmedCount = session.trials.filter((trial) => trial.korreksjonsforsøk === 0).length;
  const blocks = new Set(session.trials.map((trial) => trial.blokk)).size;
  const sessionEnd: SessionEnd = {
    type: 'session_end',
    protocol: PROTOCOL,
    run_id: runId,
    reason: protocolReason(reason),
    previous,
    summary: {
      trials: session.trials.length,
      programmed: programmedCount,
      blocks,
      mastery: `${options.config.masteryNumerator}/${options.config.masteryDenominator}`,
      stopped_by: reason === 'ferdig' ? null : reason,
    },
  };
  try {
    await options.agent.onEnd?.(sessionEnd);
  } catch (error) {
    if (reason === 'ferdig') {
      reason = 'agent_feil';
      message = error instanceof Error ? error.message : 'session_end feilet';
    }
  }
  const exportMeta: AgentExportData = {
    runId,
    participantNumber: options.participantNumber,
    studyId: options.config.studyId,
    agentId: options.agent.agentId,
    agentType: options.agent.agentType,
    agentVersion: options.agent.agentVersion,
    seed: options.seed >>> 0,
    memoryMode: options.agent.memoryMode,
    memoryN: options.agent.memoryN,
    model: options.agent.model,
    revealCorrection: options.revealCorrection,
    historyInRequest: 'none',
    maxBlocks: limits.maxBlocks,
    maxTrials: limits.maxTrials,
    clock,
    endReason: reason,
    protocolReason: protocolReason(reason),
    folder: 'Boter-AI',
    parameters: options.agent.parameters,
    startedUtc,
    endedUtc,
    message,
    traces,
  };
  emit(true);
  return { reason, session, exportMeta, sessionEnd, message };
}

function sessionStart(options: DriverOptions, runId: string, limits: { maxBlocks: number; maxTrials: number }): SessionStart {
  const stimuli: SessionStart['stimuli'] = {};
  for (const id of allStimulusIds(options.config.classes, options.config.members)) {
    const squiggle = options.config.stimulusSet === 'abstrakte' ? squiggleFor(id) : null;
    stimuli[id] = {
      glyph: '',
      symbol_id: squiggle?.id ?? options.config.symbolAssignment[id] ?? '',
    };
  }
  return {
    type: 'session_start',
    protocol: PROTOCOL,
    run_id: runId,
    agent_id: options.agent.agentId,
    seed: options.seed >>> 0,
    stimuli,
    layout: {
      positions: options.config.classes,
      corners: CORNERS,
      order: 'leserekkefølge, tomt hjørne hoppes over',
    },
    procedure: {
      mts_type: options.config.mtsType,
      sample_clicks: options.config.sampleClicks,
      feedback_words: feedbackWords(options.config),
      wrong_word: wrongWord(options.config),
      mastery: `${options.config.masteryNumerator}/${options.config.masteryDenominator}`,
    },
    instruction: instructionText(options.config),
    limits: { max_response_s: null, max_blocks: limits.maxBlocks, max_trials: limits.maxTrials },
    memory: { mode: options.agent.memoryMode, n: options.agent.memoryN, test_in_history: true },
    history_in_request: 'none',
    reveal_correction: options.revealCorrection,
  };
}

function trialRequest(
  options: DriverOptions,
  runId: string,
  programmed: NonNullable<ReturnType<Session['currentProgrammed']>>,
  slots: ReadingSlot[],
  previous: PreviousOutcome | null,
  trialNr: number,
): VisibleTrialRequest {
  const request: VisibleTrialRequest = {
    type: 'trial_request',
    protocol: PROTOCOL,
    run_id: runId,
    trial_nr: trialNr,
    sample: { id: programmed.sample, glyph: '' },
    comparisons: slots.map((slot) => ({
      position: slot.position,
      corner: slot.corner,
      id: slot.stimulus,
      glyph: '',
    })),
    notice: null,
    previous,
    deadline_ms: null,
  };
  if (options.revealCorrection && programmed.isCorrection) request.correction = true;
  return request;
}

function asResponse(value: unknown, request: VisibleTrialRequest): TrialResponse | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<TrialResponse>;
  if (typeof raw.position !== 'number' || !Number.isFinite(raw.position)) return null;
  return {
    type: 'trial_response',
    protocol: PROTOCOL,
    run_id: request.run_id,
    trial_nr: request.trial_nr,
    position: raw.position,
    corner: typeof raw.corner === 'string' ? raw.corner : undefined,
    latency_ms: typeof raw.latency_ms === 'number' ? raw.latency_ms : undefined,
    meta: capMeta(raw.meta),
  };
}

function previousFrom(trial: TrialRecord | undefined, position: number | null): PreviousOutcome | null {
  if (!trial) return null;
  const given = trial.tilbakemelding_gitt === 1;
  return {
    trial_nr: trial.forsøk_nr,
    chosen_position: position,
    feedback_given: given,
    feedback_word: given ? trial.tilbakemeldingsord : '',
    correct: given ? trial.riktig === 1 : null,
  };
}

function liveFrom(
  programmed: NonNullable<ReturnType<Session['currentProgrammed']>>,
  slots: ReadingSlot[],
  trial: TrialRecord | undefined,
  position: number | null,
  latencyMs: number,
  route: string,
): LiveTrial {
  const given = trial?.tilbakemelding_gitt === 1;
  return {
    trialNr: trial?.forsøk_nr ?? 0,
    sampleId: programmed.sample,
    sampleGlyph: '',
    phase: programmed.phase,
    block: programmed.block,
    attempt: programmed.attempt,
    thinning: programmed.phase === 'trening' ? programmed.thinningPercent : 0,
    relation: programmed.relation,
    relationType: programmed.relationType,
    correction: programmed.isCorrection,
    feedbackWord: given ? (trial?.tilbakemeldingsord ?? '') : '',
    feedbackGiven: Boolean(given),
    correct: given ? trial?.riktig === 1 : null,
    latencyMs,
    route,
    slots: slots.map((slot) => ({
      position: slot.position,
      corner: slot.corner,
      id: slot.stimulus,
      glyph: '',
      chosen: position === slot.position,
      isCorrect: slot.stimulus === programmed.correct,
    })),
    emptyCorners: CORNERS.filter((corner) => !slots.some((slot) => slot.corner === corner)),
  };
}
