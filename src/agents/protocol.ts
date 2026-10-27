import type { Corner } from '../types';

/** Shared JSON protocol for in-browser agents and a later local HTTP agent. */
export const PROTOCOL = 'mts-agent/1' as const;

export type ProtocolReason = 'finished' | 'not_mastered' | 'aborted' | 'agent_error';
export type LabEndReason = 'ferdig' | 'ikke_mestret' | 'avbrutt' | 'agent_feil';

export function protocolReason(reason: LabEndReason): ProtocolReason {
  if (reason === 'ferdig') return 'finished';
  if (reason === 'ikke_mestret') return 'not_mastered';
  if (reason === 'avbrutt') return 'aborted';
  return 'agent_error';
}

export interface SessionStart {
  type: 'session_start';
  protocol: typeof PROTOCOL;
  run_id: string;
  agent_id: string;
  seed: number;
  stimuli: Record<string, { glyph: string; symbol_id: string }>;
  layout: { positions: number; corners: readonly string[]; order: string };
  procedure: {
    mts_type: string;
    sample_clicks: number;
    feedback_words: string[];
    wrong_word: string;
    mastery: string;
  };
  instruction: string;
  limits: { max_response_s: number | null; max_blocks: number; max_trials: number };
  memory: { mode: string; n: number | null; test_in_history: boolean };
  history_in_request: 'none';
  reveal_correction: boolean;
}

export interface ReadyMessage {
  type: 'ready';
  agent_type: string;
  agent_version: string;
  protocol: typeof PROTOCOL;
  capabilities: string[];
}

export interface PreviousOutcome {
  trial_nr: number;
  chosen_position: number | null;
  feedback_given: boolean;
  feedback_word: string;
  correct: boolean | null;
}

export interface ComparisonView {
  position: number;
  corner: Corner;
  id: string;
  glyph: string;
}

/**
 * What the agent is allowed to see. No phase, relation, correct answer, or
 * block status. `correction` is present only when the experimenter opted in.
 */
export interface VisibleTrialRequest {
  type: 'trial_request';
  protocol: typeof PROTOCOL;
  run_id: string;
  trial_nr: number;
  sample: { id: string; glyph: string };
  comparisons: ComparisonView[];
  notice: null;
  previous: PreviousOutcome | null;
  deadline_ms: number | null;
  correction?: true;
}

export interface ObserverFields {
  fase: string;
  blokk: number;
  blokk_gjentakelse: number;
  nedtrapping_prosent: number;
  relasjon: string;
  relasjonstype: string;
  riktig_posisjon: number | null;
  korreksjonsforsøk: 0 | 1;
}

export interface TrialResponse {
  type: 'trial_response';
  protocol: typeof PROTOCOL;
  run_id: string;
  trial_nr: number;
  position: number;
  corner?: string;
  latency_ms?: number;
  meta?: Record<string, unknown>;
}

export interface SessionEnd {
  type: 'session_end';
  protocol: typeof PROTOCOL;
  run_id: string;
  reason: ProtocolReason;
  previous: PreviousOutcome | null;
  summary: {
    trials: number;
    programmed: number;
    blocks: number;
    mastery: string;
    stopped_by: string | null;
  };
}

export interface ResetMessage {
  type: 'reset';
  protocol: typeof PROTOCOL;
  run_id: string;
  seed: number;
}

export interface AgentPlugin {
  agentType: string;
  agentVersion: string;
  agentId: string;
  /** Logged on the Parametere sheet. Not sent back to the agent as feedback. */
  parameters: Record<string, string | number | boolean | null>;
  model: string | null;
  memoryMode: string;
  memoryN: number | null;
  init(start: SessionStart): ReadyMessage | Promise<ReadyMessage>;
  /** Stage hint for models that need it. Omitted from `decide` and from LLM prompts. */
  noteStage?(stage: { training: boolean }): void;
  decide(request: VisibleTrialRequest): TrialResponse | Promise<TrialResponse>;
  onEnd?(end: SessionEnd): void | Promise<void>;
  reset?(message: ResetMessage): ReadyMessage | Promise<ReadyMessage>;
}

export function readyMessage(agentType: string, agentVersion: string, capabilities: string[] = []): ReadyMessage {
  return { type: 'ready', agent_type: agentType, agent_version: agentVersion, protocol: PROTOCOL, capabilities };
}

/** Drops observer fields so a later HTTP transport can send the same object. */
export function agentVisibleRequest(
  request: VisibleTrialRequest & { observer?: unknown; training?: unknown },
): VisibleTrialRequest {
  const { observer: _observer, training: _training, ...rest } = request;
  return rest;
}

export function capMeta(meta: unknown): Record<string, unknown> | undefined {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined;
  const text = JSON.stringify(meta);
  if (text.length <= 4096) return meta as Record<string, unknown>;
  return { truncated: true, bytes: text.length };
}

export function makeRunId(when: Date, participantNumber: number): string {
  const y = when.getUTCFullYear();
  const m = String(when.getUTCMonth() + 1).padStart(2, '0');
  const d = String(when.getUTCDate()).padStart(2, '0');
  return `MTSA-${y}${m}${d}-${participantNumber}`;
}
