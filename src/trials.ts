import { feedbackCount } from './criteria';
import { assignPositions } from './positions';
import {
  baselinePairs,
  comparisonSet,
  pairLabel,
  pairsOfKind,
  relationToken,
  stimulusId,
} from './relations';
import { shuffle } from './rng';
import type { ExperimentConfig, Phase, PlannedTrial, RelationKind } from './types';

export interface TrialDraft {
  phase: Phase;
  relation: string;
  relationLabel: string;
  relationType: RelationKind;
  sample: string;
  correct: string;
  comparisonStimuli: string[];
  thinningPercent: number;
  introLabel: string | null;
}

function expandPair(
  config: ExperimentConfig,
  phase: Phase,
  sampleMember: number,
  comparisonMember: number,
  relationType: RelationKind,
  thinningPercent: number,
  introLabel: string | null,
): TrialDraft[] {
  const label =
    sampleMember === comparisonMember
      ? `${pairLabel({ sampleMember, comparisonMember: sampleMember }).slice(0, 1)}=${pairLabel({ sampleMember, comparisonMember }).slice(0, 1)}`
      : pairLabel({ sampleMember, comparisonMember });
  const drafts: TrialDraft[] = [];
  for (let classIndex = 0; classIndex < config.classes; classIndex++) {
    const sample = stimulusId(sampleMember, classIndex);
    const correct = stimulusId(comparisonMember, classIndex);
    drafts.push({
      phase,
      relation: relationToken(sample, correct),
      relationLabel: label,
      relationType,
      sample,
      correct,
      comparisonStimuli: comparisonSet(comparisonMember, config.classes),
      thinningPercent,
      introLabel,
    });
  }
  return drafts;
}

export function baselineDrafts(config: ExperimentConfig, thinningPercent: number, onlyLabel: string | null): TrialDraft[] {
  const pairs = baselinePairs(config.structure, config.members).filter((pair) => {
    if (!onlyLabel) return true;
    return pairLabel(pair) === onlyLabel;
  });
  const once: TrialDraft[] = [];
  for (const pair of pairs) {
    once.push(
      ...expandPair(config, 'trening', pair.sampleMember, pair.comparisonMember, 'baseline', thinningPercent, onlyLabel),
    );
  }
  const drafts: TrialDraft[] = [];
  for (let i = 0; i < config.trialMultiplier; i++) drafts.push(...once.map((d) => ({ ...d })));
  return drafts;
}

export function testDrafts(config: ExperimentConfig): TrialDraft[] {
  const kinds: RelationKind[] = [];
  if (config.testBaseline) kinds.push('baseline');
  if (config.testSymmetry) kinds.push('symmetri');
  if (config.testTransitivity) kinds.push('transitivitet');
  if (config.testEquivalence) kinds.push('ekvivalens');
  if (config.testReflexivity && !config.reflexivityAsPretest) kinds.push('refleksivitet');
  return draftsForKinds(config, 'test', kinds, config.testMultiplier);
}

export function reflexivityDrafts(config: ExperimentConfig): TrialDraft[] {
  return draftsForKinds(config, 'forhåndstest', ['refleksivitet'], config.testMultiplier);
}

function draftsForKinds(
  config: ExperimentConfig,
  phase: Phase,
  kinds: RelationKind[],
  multiplier: number,
): TrialDraft[] {
  const once: TrialDraft[] = [];
  for (const kind of kinds) {
    for (const pair of pairsOfKind(config.structure, config.members, kind)) {
      once.push(...expandPair(config, phase, pair.sampleMember, pair.comparisonMember, kind, 0, null));
    }
  }
  const drafts: TrialDraft[] = [];
  for (let i = 0; i < multiplier; i++) drafts.push(...once.map((d) => ({ ...d })));
  return drafts;
}

export function scheduleFeedback(count: number, percent: number, rng: () => number): boolean[] {
  const flags = Array.from({ length: count }, () => false);
  const n = feedbackCount(count, percent);
  const order = shuffle(Array.from({ length: count }, (_, i) => i), rng);
  for (let i = 0; i < n; i++) {
    const index = order[i];
    if (index !== undefined) flags[index] = true;
  }
  return flags;
}

function avoidLongRelationRuns(drafts: TrialDraft[], rng: () => number): TrialDraft[] {
  let current = shuffle(drafts, rng);
  for (let attempt = 0; attempt < 40; attempt++) {
    let longest = 1;
    let run = 1;
    for (let i = 1; i < current.length; i++) {
      if (current[i]?.relation === current[i - 1]?.relation) {
        run += 1;
        if (run > longest) longest = run;
      } else run = 1;
    }
    if (longest <= 2 || current.length < 3) return current;
    current = shuffle(drafts, rng);
  }
  return current;
}

export function materialise(
  drafts: TrialDraft[],
  config: ExperimentConfig,
  rng: () => number,
  blockAttempt: number,
): PlannedTrial[] {
  const ordered = avoidLongRelationRuns(drafts, rng);
  const feedback = scheduleFeedback(ordered.length, ordered[0]?.thinningPercent ?? 0, rng);
  const positions = assignPositions(
    ordered.map((d) => ({ correct: d.correct, comparisonStimuli: d.comparisonStimuli })),
    config.positionBalance,
    config.maxConsecutiveSPlus,
    rng,
  );
  return ordered.map((draft, index) => {
    const position = positions[index];
    if (!position) throw new Error('Mangler posisjon for et forsøk.');
    return {
      ...draft,
      feedbackScheduled: feedback[index] ?? false,
      emptyCorner: position.emptyCorner,
      sPlusCorner: position.sPlusCorner,
      placements: position.placements,
      blockAttempt,
    };
  });
}

export function generateTrainingBlock(
  config: ExperimentConfig,
  thinningPercent: number,
  rng: () => number,
  blockAttempt = 1,
  onlyLabel: string | null = null,
): PlannedTrial[] {
  return materialise(baselineDrafts(config, thinningPercent, onlyLabel), config, rng, blockAttempt);
}

export function generateTestBlock(config: ExperimentConfig, rng: () => number): PlannedTrial[] {
  return materialise(testDrafts(config), config, rng, 1);
}

export function generatePretestBlock(config: ExperimentConfig, rng: () => number): PlannedTrial[] {
  return materialise(reflexivityDrafts(config), config, rng, 1);
}

export function introLabels(config: ExperimentConfig): string[] {
  if (!config.serialIntroduction) return [];
  return baselinePairs(config.structure, config.members).map((pair) => pairLabel(pair));
}

export interface BlockPlan {
  trainingRelations: number;
  trialsPerTrainingBlock: number;
  testCounts: Record<RelationKind, number>;
  testTotal: number;
}

export function planSizes(config: ExperimentConfig): BlockPlan {
  const trainingRelations = baselinePairs(config.structure, config.members).length * config.classes;
  const trialsPerTrainingBlock = trainingRelations * config.trialMultiplier;
  const testCounts: Record<RelationKind, number> = {
    baseline: 0,
    symmetri: 0,
    transitivitet: 0,
    ekvivalens: 0,
    refleksivitet: 0,
  };
  for (const draft of testDrafts(config)) testCounts[draft.relationType] += 1;
  if (config.testReflexivity && config.reflexivityAsPretest) {
    testCounts.refleksivitet = reflexivityDrafts(config).length;
  }
  const testTotal = testDrafts(config).length;
  return { trainingRelations, trialsPerTrainingBlock, testCounts, testTotal };
}
