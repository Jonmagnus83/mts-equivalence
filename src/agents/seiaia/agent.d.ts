export interface SeiaiaTrial {
  sample?: string | { id: string };
  comparisons?: (string | { id: string; corner?: string })[];
  sample_id?: string;
  choice_ids?: string[];
  training?: boolean;
}

export interface SeiaiaAgent {
  choose(trial: SeiaiaTrial): number;
  feedback(correct: boolean | null): void;
  reset(): void;
  lastProbs: number[] | null;
  lastRoute: string | null;
  seed: number;
}

export interface SeiaiaSessionLog {
  agent_choice_position: number;
  correct: boolean;
  route: string;
  trial_index: number;
}

export interface SeiaiaSessionMeta {
  status: string;
  n_trials: number;
  logs: SeiaiaSessionLog[];
  seed: number;
}

export const DEFAULT_AGENT: {
  test_in_history: boolean;
  memory_mode: string;
  memory_n: number;
  gamma: number;
};

export function createAgent(config: Record<string, unknown> | undefined, seed?: number): SeiaiaAgent;
export function runSession(config: Record<string, unknown> | undefined, seed?: number, runId?: string): SeiaiaSessionMeta;
