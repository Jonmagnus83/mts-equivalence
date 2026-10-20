import type { Pair, RelationKind, TrainingStructure } from './types';

const LETTERS = 'ABCDEFGH';

export function memberLetter(member: number): string {
  const letter = LETTERS[member];
  if (!letter) throw new Error(`Medlemsindeks ${member} er utenfor A–H.`);
  return letter;
}

export function stimulusId(member: number, classIndex: number): string {
  return `${memberLetter(member)}${classIndex + 1}`;
}

export function allStimulusIds(classes: number, members: number): string[] {
  const ids: string[] = [];
  for (let m = 0; m < members; m++) {
    for (let c = 0; c < classes; c++) ids.push(stimulusId(m, c));
  }
  return ids;
}

export function relationToken(sample: string, comparison: string): string {
  return `${sample}-${comparison}`;
}

export function pairLabel(pair: Pair): string {
  return `${memberLetter(pair.sampleMember)}${memberLetter(pair.comparisonMember)}`;
}

/**
 * Trained (baseline) relations.
 * LS chains adjacent members (AB, BC, …).
 * OTM trains from A to every other member.
 * MTO trains every other member to the last member (the node; C when there are three).
 */
export function baselinePairs(structure: TrainingStructure, members: number): Pair[] {
  if (members < 2) throw new Error('Det må være minst to medlemmer.');
  const pairs: Pair[] = [];
  if (structure === 'LS') {
    for (let i = 0; i < members - 1; i++) {
      pairs.push({ sampleMember: i, comparisonMember: i + 1 });
    }
  } else if (structure === 'OTM') {
    for (let i = 1; i < members; i++) {
      pairs.push({ sampleMember: 0, comparisonMember: i });
    }
  } else {
    const node = members - 1;
    for (let i = 0; i < node; i++) {
      pairs.push({ sampleMember: i, comparisonMember: node });
    }
  }
  return pairs;
}

export function classifyPair(
  structure: TrainingStructure,
  members: number,
  sampleMember: number,
  comparisonMember: number,
): RelationKind {
  if (sampleMember === comparisonMember) return 'refleksivitet';
  const key = `${sampleMember}-${comparisonMember}`;
  const trained = new Set(baselinePairs(structure, members).map((p) => `${p.sampleMember}-${p.comparisonMember}`));
  if (trained.has(key)) return 'baseline';
  if (structure === 'LS') {
    const distance = comparisonMember - sampleMember;
    if (distance === -1) return 'symmetri';
    if (distance > 1) return 'transitivitet';
    return 'ekvivalens';
  }
  if (structure === 'OTM') {
    if (comparisonMember === 0) return 'symmetri';
    return 'ekvivalens';
  }
  const node = members - 1;
  if (sampleMember === node) return 'symmetri';
  return 'ekvivalens';
}

export function pairsOfKind(
  structure: TrainingStructure,
  members: number,
  kind: RelationKind,
): Pair[] {
  if (kind === 'refleksivitet') {
    const pairs: Pair[] = [];
    for (let m = 0; m < members; m++) pairs.push({ sampleMember: m, comparisonMember: m });
    return pairs;
  }
  const pairs: Pair[] = [];
  for (let s = 0; s < members; s++) {
    for (let c = 0; c < members; c++) {
      if (s === c) continue;
      if (classifyPair(structure, members, s, c) === kind) {
        pairs.push({ sampleMember: s, comparisonMember: c });
      }
    }
  }
  return pairs;
}

export function comparisonSet(comparisonMember: number, classes: number): string[] {
  return Array.from({ length: classes }, (_, classIndex) => stimulusId(comparisonMember, classIndex));
}
