import { feedbackWords, wrongWord } from './config';
import { meetsMastery } from './criteria';
import { placementsToCell } from './export';
import { assignPositions } from './positions';
import {
  generatePretestBlock,
  generateTestBlock,
  generateTrainingBlock,
  introLabels,
} from './trials';
import type {
  Corner,
  EventRecord,
  ExperimentConfig,
  Phase,
  PlannedTrial,
  RelationKind,
  SessionEventName,
  TrialRecord,
} from './types';

/** The programmed trial on screen. The agent adapter logs this; the agent does not receive it. */
export interface ProgrammedView {
  sample: string;
  correct: string;
  relation: string;
  relationType: RelationKind;
  phase: Phase;
  placements: { stimulus: string; corner: Corner }[];
  emptyCorner: Corner | null;
  sPlusCorner: Corner;
  isCorrection: boolean;
  thinningPercent: number;
  block: number;
  attempt: number;
  feedbackScheduled: boolean;
  programmedIndex: number;
}

export type Screen =
  | { type: 'instruction' }
  | { type: 'sample'; stimulus: string }
  | { type: 'delay' }
  | { type: 'choice'; sample: string | null; options: { stimulus: string; corner: Corner }[] }
  | { type: 'feedback'; text: string }
  | { type: 'iti' }
  | { type: 'pause'; reason: 'hidden' | 'blur' | 'fullscreen' | 'inactivity' }
  | { type: 'done' };

interface QueueItem extends PlannedTrial {
  isCorrection: boolean;
  programmedIndex: number;
}

interface StagePlan {
  kind: 'pretest' | 'intro' | 'train' | 'test';
  percent: number;
  label: string | null;
}

type NextAction =
  | { type: 'continue' }
  | { type: 'correction'; source: QueueItem }
  | { type: 'repeat-block' }
  | { type: 'next-stage' }
  | { type: 'done' };

interface PendingWait {
  kind: 'delay' | 'feedback' | 'iti';
  remaining: number;
  started: number;
}

export interface PersistedSession {
  version: 1;
  participantNumber: number;
  startedAtUtc: string;
  config: ExperimentConfig;
  trials: TrialRecord[];
  events: EventRecord[];
  finished: boolean;
  stageIndex: number;
  blockNumber: number;
  currentAttempt: number;
  currentBlock: number;
  currentPhase: Phase | '';
  currentThinning: number;
  cursor: number;
  queue: QueueItem[];
  tabSwitches: number;
  originElapsed: number;
}

function stagesFor(config: ExperimentConfig): StagePlan[] {
  const stages: StagePlan[] = [];
  if (config.testReflexivity && config.reflexivityAsPretest) {
    stages.push({ kind: 'pretest', percent: 0, label: null });
  }
  for (const label of introLabels(config)) {
    stages.push({ kind: 'intro', percent: 100, label });
  }
  for (const percent of config.thinning) {
    stages.push({ kind: 'train', percent, label: null });
  }
  stages.push({ kind: 'test', percent: 0, label: null });
  return stages;
}

/**
 * Runs one participant from the first observing response to the last test trial.
 * The UI supplies time and draws `screen`. Closing the tab cannot be blocked here;
 * call `attemptClose` from `beforeunload` so the attempt is stored.
 */
export class Session {
  readonly startedAtUtc: string;
  trials: TrialRecord[] = [];
  events: EventRecord[] = [];
  screen: Screen = { type: 'instruction' };
  finished = false;
  private started = false;
  private readonly origin: number;
  private tabSwitches = 0;
  private stages: StagePlan[];
  private stageIndex = 0;
  private queue: QueueItem[] = [];
  private cursor = 0;
  private correctionRepeats = 0;
  private blockNumber = 0;
  private currentBlock = 0;
  private currentAttempt = 1;
  private currentPhase: Phase | '' = '';
  private currentThinning = 0;
  private trialOnset = 0;
  private choiceOnset = 0;
  private sampleClicks = 0;
  private pausedMs = 0;
  private pauseStarted: number | null = null;
  private rtSample: number | '' = '';
  private pending: PendingWait | null = null;
  private nextAction: NextAction | null = null;
  private heldScreen: Screen | null = null;
  private away: Partial<Record<'blur' | 'hidden' | 'fullskjerm_av', number>> = {};
  private globalTrial = 0;
  private inactivityStarted: number | null = null;
  private inactivityEventIndex: number | null = null;

  constructor(
    readonly config: ExperimentConfig,
    readonly participantNumber: number,
    private rng: () => number,
    private now: () => number,
    private onChange: () => void = () => undefined,
    startedAtUtc?: string,
  ) {
    this.startedAtUtc = startedAtUtc ?? new Date(now()).toISOString();
    this.origin = now();
    this.stages = stagesFor(config);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.beginBlock(1);
    this.beginPresentation();
    this.onChange();
  }

  /** Milliseconds until the UI should call `completeWait`, or null while paused or idle. */
  pendingWaitMs(): number | null {
    if (!this.pending || this.screen.type === 'pause') return null;
    return this.pending.remaining;
  }

  completeWait(): void {
    if (!this.pending || this.screen.type === 'pause') return;
    const kind = this.pending.kind;
    this.pending = null;
    if (kind === 'delay') this.showChoice();
    else if (kind === 'feedback') this.leaveTrial();
    else this.beginPresentation();
    this.onChange();
  }

  clickSample(): void {
    if (this.screen.type !== 'sample' || this.finished) return;
    this.sampleClicks += 1;
    if (this.sampleClicks < this.observingClicks()) {
      this.onChange();
      return;
    }
    this.rtSample = Math.max(0, Math.round(this.now() - this.trialOnset - this.pausedMs));
    this.pausedMs = 0;
    if (this.config.mtsType === 'delayed' && this.config.delaySeconds > 0) {
      this.screen = { type: 'delay' };
      this.pending = { kind: 'delay', remaining: this.config.delaySeconds * 1000, started: this.now() };
    } else {
      this.showChoice();
    }
    this.onChange();
  }

  clickComparison(stimulus: string, corner: Corner): void {
    if (this.screen.type !== 'choice' || this.finished) return;
    const trial = this.queue[this.cursor];
    if (!trial) return;
    const correct: 0 | 1 = stimulus === trial.correct ? 1 : 0;
    this.recordChoice(stimulus, corner, correct);
  }

  /** A trial with no usable agent answer. Counted as incorrect. Human sessions never call this. */
  recordInvalidChoice(): void {
    if (this.screen.type !== 'choice' || this.finished) return;
    if (!this.queue[this.cursor]) return;
    this.recordChoice('', '', 0);
  }

  /** Blocks started so far, including the one on screen. Human UI does not read this. */
  startedBlocks(): number {
    return this.blockNumber;
  }

  /** Stops the session. Used when an agent hits a safety limit. Human sessions never call this. */
  halt(): void {
    if (this.finished) return;
    this.finished = true;
    this.pending = null;
    this.nextAction = null;
    this.screen = { type: 'done' };
    this.onChange();
  }

  currentProgrammed(): ProgrammedView | null {
    if (this.finished) return null;
    const trial = this.queue[this.cursor];
    if (!trial) return null;
    return {
      sample: trial.sample,
      correct: trial.correct,
      relation: trial.relation,
      relationType: trial.relationType,
      phase: trial.phase,
      placements: trial.placements.map((item) => ({ ...item })),
      emptyCorner: trial.emptyCorner,
      sPlusCorner: trial.sPlusCorner,
      isCorrection: trial.isCorrection,
      thinningPercent: trial.thinningPercent,
      block: this.currentBlock,
      attempt: this.currentAttempt,
      feedbackScheduled: trial.feedbackScheduled,
      programmedIndex: trial.programmedIndex,
    };
  }

  private recordChoice(stimulus: string, corner: string, correct: 0 | 1): void {
    const trial = this.queue[this.cursor];
    if (!trial) return;
    const rtChoice = Math.max(0, Math.round(this.now() - this.choiceOnset - this.pausedMs));
    const word = this.feedbackWord(correct === 1, trial);
    this.globalTrial += 1;
    this.trials.push({
      deltakernr: this.participantNumber,
      studie_id: this.config.studyId,
      oppsett_versjon: this.config.version,
      økt_start_utc: this.startedAtUtc,
      fase: trial.phase,
      blokk: this.currentBlock,
      blokk_gjentakelse: this.currentAttempt,
      nedtrapping_prosent: trial.phase === 'trening' ? this.currentThinning : 0,
      blokkforsøk_nr: trial.programmedIndex,
      forsøk_nr: this.globalTrial,
      relasjon: trial.relation,
      relasjonstype: trial.relationType,
      utvalg: trial.sample,
      sammenligninger_og_posisjoner: placementsToCell(trial.placements, trial.emptyCorner),
      riktig_stimulus: trial.correct,
      valgt_stimulus: stimulus,
      valgt_posisjon: corner,
      riktig: correct,
      tilbakemelding_gitt: word ? 1 : 0,
      tilbakemeldingsord: word,
      klikk_på_utvalg: this.sampleClicks,
      rt_utvalg_ms: this.rtSample,
      rt_sammenligning_ms: rtChoice,
      iti_ms: Math.round(this.config.itiSeconds * 1000),
      forsinkelse_ms: this.config.mtsType === 'delayed' ? Math.round(this.config.delaySeconds * 1000) : 0,
      tomt_hjørne: trial.emptyCorner ?? '',
      s_pluss_hjørne: trial.sPlusCorner,
      korreksjonsforsøk: trial.isCorrection ? 1 : 0,
      fanebytter_hittil: this.tabSwitches,
    });
    this.nextAction = this.decideNext(correct === 1, trial);
    const duration = this.feedbackDuration(word, correct === 1);
    if (word && duration > 0) {
      this.screen = { type: 'feedback', text: word };
      this.pending = { kind: 'feedback', remaining: duration, started: this.now() };
    } else {
      this.leaveTrial();
    }
    this.onChange();
  }

  noteAway(kind: 'blur' | 'hidden' | 'fullskjerm_av', shouldPause = true): void {
    if (!this.started || this.finished) return;
    if (this.away[kind] !== undefined) return;
    this.away[kind] = this.now();
    this.events.push(this.eventRow(kind, 0));
    if (kind === 'hidden') this.tabSwitches += 1;
    if (shouldPause) this.pause(kind === 'blur' ? 'blur' : kind === 'hidden' ? 'hidden' : 'fullscreen');
    this.onChange();
  }

  noteBack(kind: 'focus' | 'visible' | 'fullskjerm_på'): void {
    if (!this.started || this.finished) return;
    const startKind = kind === 'focus' ? 'blur' : kind === 'visible' ? 'hidden' : 'fullskjerm_av';
    const started = this.away[startKind];
    if (started === undefined) return;
    delete this.away[startKind];
    this.events.push(this.eventRow(kind, Math.max(0, Math.round(this.now() - started))));
    this.onChange();
  }

  attemptClose(): void {
    if (!this.started || this.finished) return;
    this.events.push(this.eventRow('forsøk_på_lukking', 0));
    this.onChange();
  }

  /** Shown when the participant has not responded within the configured limit. */
  noteInactivity(): void {
    if (!this.started || this.finished) return;
    if (this.screen.type !== 'sample' && this.screen.type !== 'choice') return;
    this.inactivityStarted = this.now();
    this.events.push(this.eventRow('inaktivitet', 0));
    this.inactivityEventIndex = this.events.length - 1;
    this.pause('inactivity');
    this.onChange();
  }

  resume(): void {
    if (this.screen.type !== 'pause') return;
    if (this.screen.reason === 'inactivity' && this.inactivityEventIndex !== null && this.inactivityStarted !== null) {
      const event = this.events[this.inactivityEventIndex];
      if (event) event.varighet_ms = Math.max(0, Math.round(this.now() - this.inactivityStarted));
      this.inactivityStarted = null;
      this.inactivityEventIndex = null;
    }
    if (this.pauseStarted !== null) {
      this.pausedMs += this.now() - this.pauseStarted;
      this.pauseStarted = null;
    }
    this.screen = this.heldScreen ?? { type: 'sample', stimulus: '' };
    this.heldScreen = null;
    if (this.pending) this.pending.started = this.now();
    this.onChange();
  }

  serialize(elapsedAtSave: number): PersistedSession {
    return {
      version: 1,
      participantNumber: this.participantNumber,
      startedAtUtc: this.startedAtUtc,
      config: this.config,
      trials: this.trials,
      events: this.events,
      finished: this.finished,
      stageIndex: this.stageIndex,
      blockNumber: this.blockNumber,
      currentAttempt: this.currentAttempt,
      currentBlock: this.currentBlock,
      currentPhase: this.currentPhase,
      currentThinning: this.currentThinning,
      cursor: this.cursor,
      queue: this.queue,
      tabSwitches: this.tabSwitches,
      originElapsed: elapsedAtSave,
    };
  }

  static restore(
    data: PersistedSession,
    rng: () => number,
    now: () => number,
    onChange: () => void = () => undefined,
  ): Session {
    const session = new Session(data.config, data.participantNumber, rng, now, onChange, data.startedAtUtc);
    session.started = true;
    session.trials = data.trials;
    session.events = data.events;
    session.finished = data.finished;
    session.stageIndex = data.stageIndex;
    session.blockNumber = data.blockNumber;
    session.currentAttempt = data.currentAttempt;
    session.currentBlock = data.currentBlock;
    session.currentPhase = data.currentPhase;
    session.currentThinning = data.currentThinning;
    session.cursor = data.cursor;
    session.queue = data.queue;
    session.tabSwitches = data.tabSwitches;
    session.globalTrial = data.trials.length;
    if (!data.finished) session.beginPresentation();
    else session.screen = { type: 'done' };
    return session;
  }

  private observingClicks(): number {
    if (this.config.mtsType === 'delayed') return Math.max(1, this.config.sampleClicks);
    return this.config.sampleClicks;
  }

  private beginBlock(attempt: number): void {
    const stage = this.stages[this.stageIndex];
    if (!stage) {
      this.finish();
      return;
    }
    this.blockNumber += 1;
    this.currentBlock = this.blockNumber;
    this.currentAttempt = attempt;
    this.currentThinning = stage.percent;
    let planned: PlannedTrial[] = [];
    if (stage.kind === 'pretest') {
      this.currentPhase = 'forhåndstest';
      planned = generatePretestBlock(this.config, this.rng);
    } else if (stage.kind === 'test') {
      this.currentPhase = 'test';
      planned = generateTestBlock(this.config, this.rng);
    } else {
      this.currentPhase = 'trening';
      planned = generateTrainingBlock(this.config, stage.percent, this.rng, attempt, stage.label);
    }
    this.queue = planned.map((trial, index) => ({
      ...trial,
      isCorrection: false,
      programmedIndex: index + 1,
    }));
    this.cursor = 0;
    this.correctionRepeats = 0;
    if (this.queue.length === 0) this.finishBlock();
  }

  private beginPresentation(): void {
    const trial = this.queue[this.cursor];
    if (!trial) {
      this.finishBlock();
      return;
    }
    this.sampleClicks = 0;
    this.pausedMs = 0;
    this.rtSample = '';
    this.trialOnset = this.now();
    if (this.observingClicks() <= 0 && this.config.mtsType === 'simultaneous') {
      this.rtSample = 0;
      this.showChoice();
      return;
    }
    this.screen = { type: 'sample', stimulus: trial.sample };
  }

  private showChoice(): void {
    const trial = this.queue[this.cursor];
    if (!trial) return;
    this.choiceOnset = this.now();
    this.pausedMs = 0;
    const showSample = this.config.mtsType === 'simultaneous';
    this.screen = {
      type: 'choice',
      sample: showSample ? trial.sample : null,
      options: trial.placements,
    };
  }

  private feedbackWord(correct: boolean, trial: QueueItem): string {
    if (trial.phase !== 'trening') return '';
    if (correct && trial.feedbackScheduled) {
      const words = feedbackWords(this.config);
      const index = Math.floor(this.rng() * words.length);
      return words[index] ?? words[0] ?? '';
    }
    if (!correct && trial.feedbackScheduled && this.config.wrongFeedback !== 'none') return wrongWord(this.config);
    return '';
  }

  private feedbackDuration(word: string, correct: boolean): number {
    if (!word) return 0;
    if (!correct && this.config.wrongFeedback === 'literature') return 2000;
    return this.config.feedbackDurationMs;
  }

  private decideNext(correct: boolean, trial: QueueItem): NextAction {
    const canCorrect =
      !correct &&
      this.config.correction &&
      trial.phase === 'trening' &&
      this.correctionRepeats < this.config.correctionMaxRepeats;
    if (canCorrect) return { type: 'correction', source: trial };
    if (this.cursor + 1 < this.queue.length) return { type: 'continue' };
    return this.decideBlockEnd();
  }

  private decideBlockEnd(): NextAction {
    const stage = this.stages[this.stageIndex];
    if (!stage || stage.kind === 'test' || stage.kind === 'pretest') {
      if (this.stageIndex + 1 >= this.stages.length) return { type: 'done' };
      return { type: 'next-stage' };
    }
    const programmed = this.trials.filter(
      (trial) => trial.blokk === this.currentBlock && trial.korreksjonsforsøk === 0,
    );
    const correct = programmed.filter((trial) => trial.riktig === 1).length;
    const passed = meetsMastery(
      correct,
      programmed.length,
      this.config.masteryNumerator,
      this.config.masteryDenominator,
    );
    if (!passed) return { type: 'repeat-block' };
    if (this.stageIndex + 1 >= this.stages.length) return { type: 'done' };
    return { type: 'next-stage' };
  }

  private leaveTrial(): void {
    const action = this.nextAction;
    this.nextAction = null;
    if (!action || action.type === 'done') {
      this.finish();
      return;
    }
    if (action.type === 'correction') {
      this.correctionRepeats += 1;
      const copy = this.replan(action.source);
      this.queue.splice(this.cursor + 1, 0, copy);
      this.cursor += 1;
    } else if (action.type === 'continue') {
      this.correctionRepeats = 0;
      this.cursor += 1;
    } else if (action.type === 'repeat-block') {
      this.beginBlock(this.currentAttempt + 1);
    } else {
      this.stageIndex += 1;
      if (this.stageIndex >= this.stages.length) {
        this.finish();
        return;
      }
      this.beginBlock(1);
    }
    const iti = Math.round(this.config.itiSeconds * 1000);
    if (iti > 0) {
      this.screen = { type: 'iti' };
      this.pending = { kind: 'iti', remaining: iti, started: this.now() };
    } else {
      this.beginPresentation();
    }
  }

  private replan(source: QueueItem): QueueItem {
    const [position] = assignPositions(
      [{ correct: source.correct, comparisonStimuli: source.comparisonStimuli }],
      'free',
      this.config.maxConsecutiveSPlus,
      this.rng,
    );
    if (!position) return { ...source, isCorrection: true };
    return {
      ...source,
      isCorrection: true,
      emptyCorner: position.emptyCorner,
      sPlusCorner: position.sPlusCorner,
      placements: position.placements,
    };
  }

  private finishBlock(): void {
    const action = this.decideBlockEnd();
    this.nextAction = action;
    this.leaveTrial();
  }

  private finish(): void {
    this.finished = true;
    this.pending = null;
    this.screen = { type: 'done' };
  }

  private pause(reason: 'hidden' | 'blur' | 'fullscreen' | 'inactivity'): void {
    if (this.screen.type === 'pause' || this.screen.type === 'done') return;
    this.pauseStarted = this.now();
    if (this.pending) {
      const elapsed = this.now() - this.pending.started;
      this.pending.remaining = Math.max(0, this.pending.remaining - elapsed);
    }
    this.heldScreen = this.screen;
    this.screen = { type: 'pause', reason };
  }

  private eventRow(hendelse: SessionEventName, varighet: number): EventRecord {
    return {
      tidspunkt_ms: Math.max(0, Math.round(this.now() - this.origin)),
      hendelse,
      varighet_ms: varighet,
      fase: this.currentPhase || 'trening',
      blokk: this.currentBlock || '',
      forsøk_nr: this.globalTrial || '',
    };
  }
}
