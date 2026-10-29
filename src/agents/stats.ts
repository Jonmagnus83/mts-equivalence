import { meetsMastery, requiredCorrect } from '../criteria';
import type { ExperimentConfig, RelationKind, TrialRecord } from '../types';
import { CORNERS } from '../types';
import type { AgentTraceExport } from './meta';

export interface CurvePoint {
  block: number;
  correct: number;
  n: number;
  thinning: number;
  passed: boolean;
}

export interface MasteryRow {
  percent: number;
  attempts: number;
  bestCorrect: number;
  bestN: number;
  currentCorrect: number;
  currentN: number;
  passed: boolean;
}

export interface ProbeRow {
  kind: RelationKind;
  label: string;
  correct: number;
  n: number;
  p: number | null;
}

export interface LiveSlot {
  position: number;
  corner: string;
  id: string;
  glyph: string;
  chosen: boolean;
  isCorrect: boolean;
}

export interface LiveTrial {
  trialNr: number;
  sampleId: string;
  sampleGlyph: string;
  phase: string;
  block: number;
  attempt: number;
  thinning: number;
  relation: string;
  relationType: string;
  correction: boolean;
  feedbackWord: string;
  feedbackGiven: boolean;
  correct: boolean | null;
  latencyMs: number | null;
  route: string;
  slots: LiveSlot[];
  emptyCorners: string[];
}

export interface LogRow {
  nr: number;
  relation: string;
  relationType: string;
  sample: string;
  chosen: string;
  position: number | null;
  correct: 0 | 1;
  feedback: string;
  correction: boolean;
  latencyMs: number | null;
  invalid: boolean;
}

export interface ObserverSnapshot {
  runId: string;
  agentId: string;
  agentType: string;
  finished: boolean;
  endReason: string | null;
  message: string;
  block: number;
  maxBlocks: number;
  trialNr: number;
  maxTrials: number;
  phase: string;
  thinning: number;
  masteryLabel: string;
  masteryLine: number;
  curve: CurvePoint[];
  rolling: number | null;
  mastery: MasteryRow[];
  probes: ProbeRow[];
  positions: { position: number; n: number }[];
  sPlus: { corner: string; correct: number; n: number }[];
  current: LiveTrial | null;
  log: LogRow[];
}

const PROBE_ORDER: { kind: RelationKind; label: string }[] = [
  { kind: 'refleksivitet', label: 'R' },
  { kind: 'symmetri', label: 'S' },
  { kind: 'transitivitet', label: 'T' },
  { kind: 'ekvivalens', label: 'EQ' },
  { kind: 'baseline', label: 'BL' },
];

export function binomialUpperTail(successes: number, n: number, p: number): number {
  if (n <= 0) return Number.NaN;
  if (p <= 0) return successes <= 0 ? 1 : 0;
  if (p >= 1) return successes <= n ? 1 : 0;
  let total = 0;
  for (let k = successes; k <= n; k++) total += combinations(n, k) * p ** k * (1 - p) ** (n - k);
  return Math.min(1, total);
}

function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return result;
}

export function trainingCurve(trials: TrialRecord[], numerator: number, denominator: number): CurvePoint[] {
  const groups = new Map<number, TrialRecord[]>();
  for (const trial of trials) {
    if (trial.fase !== 'trening' || trial.korreksjonsforsøk !== 0) continue;
    const list = groups.get(trial.blokk) ?? [];
    list.push(trial);
    groups.set(trial.blokk, list);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([block, rows]) => {
      const correct = rows.filter((trial) => trial.riktig === 1).length;
      return {
        block,
        correct,
        n: rows.length,
        thinning: rows[0]?.nedtrapping_prosent ?? 0,
        passed: meetsMastery(correct, rows.length, numerator, denominator),
      };
    });
}

export function rollingAccuracy(trials: TrialRecord[], window = 18): number | null {
  const programmed = trials.filter((trial) => trial.korreksjonsforsøk === 0);
  const slice = programmed.slice(-window);
  if (slice.length === 0) return null;
  return slice.filter((trial) => trial.riktig === 1).length / slice.length;
}

export function masteryRows(trials: TrialRecord[], config: ExperimentConfig): MasteryRow[] {
  return config.thinning.map((percent) => {
    const blocks = new Map<number, TrialRecord[]>();
    for (const trial of trials) {
      if (trial.fase !== 'trening' || trial.korreksjonsforsøk !== 0 || trial.nedtrapping_prosent !== percent) continue;
      const list = blocks.get(trial.blokk) ?? [];
      list.push(trial);
      blocks.set(trial.blokk, list);
    }
    const scored = [...blocks.values()].map((rows) => ({
      correct: rows.filter((trial) => trial.riktig === 1).length,
      n: rows.length,
    }));
    const best = scored.reduce((top, row) => (row.correct > top.correct ? row : top), { correct: 0, n: 0 });
    const current = scored[scored.length - 1] ?? { correct: 0, n: 0 };
    return {
      percent,
      attempts: scored.length,
      bestCorrect: best.correct,
      bestN: best.n,
      currentCorrect: current.correct,
      currentN: current.n,
      passed: scored.some((row) => meetsMastery(row.correct, row.n, config.masteryNumerator, config.masteryDenominator)),
    };
  });
}

export function probeRows(trials: TrialRecord[], classes: number): ProbeRow[] {
  const p = 1 / Math.max(2, classes);
  return PROBE_ORDER.map(({ kind, label }) => {
    const rows = trials.filter(
      (trial) =>
        trial.korreksjonsforsøk === 0 &&
        (trial.fase === 'test' || trial.fase === 'forhåndstest') &&
        trial.relasjonstype === kind,
    );
    const correct = rows.filter((trial) => trial.riktig === 1).length;
    return {
      kind,
      label,
      correct,
      n: rows.length,
      p: rows.length === 0 ? null : binomialUpperTail(correct, rows.length, p),
    };
  });
}

export function positionCounts(traces: AgentTraceExport[]): { position: number; n: number }[] {
  const counts = new Map<number, number>();
  for (const trace of traces) {
    if (trace.invalid || trace.position === null) continue;
    counts.set(trace.position, (counts.get(trace.position) ?? 0) + 1);
  }
  const positions = [...counts.keys()].sort((a, b) => a - b);
  if (positions.length === 0) return [1, 2, 3].map((position) => ({ position, n: 0 }));
  return positions.map((position) => ({ position, n: counts.get(position) ?? 0 }));
}

export function sPlusAccuracy(trials: TrialRecord[]): { corner: string; correct: number; n: number }[] {
  const programmed = trials.filter((trial) => trial.korreksjonsforsøk === 0);
  return CORNERS.map((corner) => {
    const rows = programmed.filter((trial) => trial.s_pluss_hjørne === corner);
    return { corner, correct: rows.filter((trial) => trial.riktig === 1).length, n: rows.length };
  });
}

export function logRows(trials: TrialRecord[], traces: AgentTraceExport[]): LogRow[] {
  const byNr = new Map(traces.map((trace) => [trace.forsøk_nr, trace]));
  return trials.map((trial) => {
    const trace = byNr.get(trial.forsøk_nr);
    return {
      nr: trial.forsøk_nr,
      relation: trial.relasjon,
      relationType: trial.relasjonstype,
      sample: trial.utvalg,
      chosen: trial.valgt_stimulus,
      position: trace?.position ?? null,
      correct: trial.riktig,
      feedback: trial.tilbakemelding_gitt ? trial.tilbakemeldingsord : '',
      correction: trial.korreksjonsforsøk === 1,
      latencyMs: trace?.latencyMs ?? null,
      invalid: trace?.invalid === 1,
    };
  });
}

export function buildSnapshot(input: {
  config: ExperimentConfig;
  trials: TrialRecord[];
  traces: AgentTraceExport[];
  runId: string;
  agentId: string;
  agentType: string;
  maxBlocks: number;
  maxTrials: number;
  finished: boolean;
  endReason: string | null;
  message: string;
  current: LiveTrial | null;
}): ObserverSnapshot {
  const blockSize = trainingCurve(input.trials, input.config.masteryNumerator, input.config.masteryDenominator)[0]?.n ?? 18;
  const last = input.trials[input.trials.length - 1];
  return {
    runId: input.runId,
    agentId: input.agentId,
    agentType: input.agentType,
    finished: input.finished,
    endReason: input.endReason,
    message: input.message,
    block: last?.blokk ?? 0,
    maxBlocks: input.maxBlocks,
    trialNr: input.trials.length,
    maxTrials: input.maxTrials,
    phase: last?.fase ?? '',
    thinning: last?.fase === 'trening' ? (last?.nedtrapping_prosent ?? 0) : 0,
    masteryLabel: `${input.config.masteryNumerator}/${input.config.masteryDenominator}`,
    masteryLine: requiredCorrect(blockSize, input.config.masteryNumerator, input.config.masteryDenominator),
    curve: trainingCurve(input.trials, input.config.masteryNumerator, input.config.masteryDenominator),
    rolling: rollingAccuracy(input.trials),
    mastery: masteryRows(input.trials, input.config),
    probes: probeRows(input.trials, input.config.classes),
    positions: positionCounts(input.traces),
    sPlus: sPlusAccuracy(input.trials),
    current: input.current,
    log: logRows(input.trials, input.traces).slice(-30),
  };
}
