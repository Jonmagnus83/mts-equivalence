import type { Corner } from './types';
import { CORNERS } from './types';
import { shuffle } from './rng';

export interface PositionAssignment {
  emptyCorner: Corner | null;
  sPlusCorner: Corner;
  placements: { stimulus: string; corner: Corner }[];
}

interface TrialLike {
  correct: string;
  comparisonStimuli: string[];
}

function counts(seq: number[], k: number): number[] {
  const c = Array.from({ length: k }, () => 0);
  for (const v of seq) c[v] = (c[v] ?? 0) + 1;
  return c;
}

export function isBalanced(seq: number[], k: number): boolean {
  if (seq.length === 0) return true;
  const c = counts(seq, k);
  const min = Math.min(...c);
  const max = Math.max(...c);
  return max - min <= 1;
}

export function maxRun(seq: number[]): number {
  let best = 0;
  let run = 0;
  let prev = Number.NaN;
  for (const v of seq) {
    if (v === prev) run += 1;
    else {
      prev = v;
      run = 1;
    }
    if (run > best) best = run;
  }
  return best;
}

function targetBag(n: number, k: number, rng: () => number): number[] {
  const base = Math.floor(n / k);
  const extra = n % k;
  const extras = new Set(shuffle(Array.from({ length: k }, (_, i) => i), rng).slice(0, extra));
  const bag: number[] = [];
  for (let v = 0; v < k; v++) {
    const count = base + (extras.has(v) ? 1 : 0);
    for (let i = 0; i < count; i++) bag.push(v);
  }
  return bag;
}

/** Balanced sequence. Runs longer than maxRun are broken by swaps when a swap exists. */
export function balancedSequence(n: number, k: number, maxConsecutive: number, rng: () => number): number[] {
  const seq = shuffle(targetBag(n, k, rng), rng);
  if (maxConsecutive < 1 || n === 0) return seq;
  for (let pass = 0; pass < n * 4; pass++) {
    let changed = false;
    let runStart = 0;
    for (let i = 1; i <= seq.length; i++) {
      const ended = i === seq.length || seq[i] !== seq[runStart];
      if (!ended) continue;
      const runLen = i - runStart;
      if (runLen > maxConsecutive) {
        const value = seq[runStart] as number;
        let swapped = false;
        for (let cut = runStart + maxConsecutive; cut < i; cut++) {
          for (let j = 0; j < seq.length; j++) {
            if (seq[j] === value) continue;
            const candidate = seq[j] as number;
            seq[cut] = candidate;
            seq[j] = value;
            if (maxRun(seq) < runLen) {
              swapped = true;
              changed = true;
              break;
            }
            seq[cut] = value;
            seq[j] = candidate;
          }
          if (swapped) break;
        }
      }
      runStart = i;
    }
    if (!changed) break;
  }
  return seq;
}

function emptySequence(n: number, sPlus: number[], maxConsecutive: number, rng: () => number): number[] | null {
  const k = CORNERS.length;
  for (let attempt = 0; attempt < 60; attempt++) {
    const seq = balancedSequence(n, k, Math.max(maxConsecutive, n), rng);
    let ok = true;
    for (let i = 0; i < n; i++) {
      if (seq[i] === sPlus[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) {
      // Swap conflicting empties with a non-conflicting position of a different value.
      for (let i = 0; i < n; i++) {
        if (seq[i] !== sPlus[i]) continue;
        let fixed = false;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          if (seq[j] === sPlus[i]) continue;
          if (seq[i] === sPlus[j]) continue;
          const a = seq[i] as number;
          seq[i] = seq[j] as number;
          seq[j] = a;
          fixed = true;
          break;
        }
        if (!fixed) ok = false;
      }
      ok = seq.every((value, i) => value !== sPlus[i]);
    }
    if (ok && isBalanced(seq, k)) return seq;
  }
  return null;
}

function place(
  trial: TrialLike,
  sPlusIndex: number,
  emptyIndex: number | null,
  rng: () => number,
): PositionAssignment {
  const corners = CORNERS.map((corner, index) => ({ corner, index }));
  const emptyCorner = emptyIndex === null ? null : (CORNERS[emptyIndex] as Corner);
  const used = corners.filter((c) => c.index !== emptyIndex);
  const sPlusCorner = CORNERS[sPlusIndex] as Corner;
  const negatives = shuffle(
    trial.comparisonStimuli.filter((id) => id !== trial.correct),
    rng,
  );
  const otherCorners = shuffle(
    used.filter((c) => c.index !== sPlusIndex),
    rng,
  );
  const placements: { stimulus: string; corner: Corner }[] = [
    { stimulus: trial.correct, corner: sPlusCorner },
  ];
  otherCorners.forEach((c, i) => {
    const stimulus = negatives[i];
    if (!stimulus) return;
    placements.push({ stimulus, corner: c.corner });
  });
  return { emptyCorner, sPlusCorner, placements };
}

/**
 * Constrained placement for one comparison from each class.
 * With 3 classes the spec applies directly: one corner stays empty,
 * each corner is S+ about equally often, each corner is empty about equally often,
 * and S+ does not stay in the same corner longer than maxConsecutive.
 */
export function assignPositions(
  trials: TrialLike[],
  mode: 'constrained' | 'free',
  maxConsecutive: number,
  rng: () => number,
): PositionAssignment[] {
  const n = trials.length;
  const k = CORNERS.length;
  if (n === 0) return [];
  const nComp = trials[0]?.comparisonStimuli.length ?? 3;
  if (trials.some((t) => t.comparisonStimuli.length !== nComp)) {
    throw new Error('Alle forsøk i blokken må ha like mange sammenligninger.');
  }
  if (nComp < 2 || nComp > 4) {
    throw new Error('Antall sammenligninger må være 2, 3 eller 4.');
  }

  if (mode === 'free') {
    return trials.map((trial) => {
      const perm = shuffle(Array.from({ length: k }, (_, i) => i), rng);
      const sPlusIndex = perm[0] as number;
      const emptyIndex = nComp === 4 ? null : (perm[1] as number);
      // For 2 comparisons we need two empty corners. place() only records one
      // empty corner; the second unused corner is simply not in placements.
      if (nComp === 2) {
        const secondEmpty = perm[2] as number;
        const assignment = place(trial, sPlusIndex, emptyIndex, rng);
        // Drop the comparison that landed on the second empty corner, if any,
        // by rebuilding with both empties excluded.
        return placeTwoEmpty(trial, sPlusIndex, emptyIndex, secondEmpty, rng) ?? assignment;
      }
      return place(trial, sPlusIndex, emptyIndex, rng);
    });
  }

  let sPlus: number[] = [];
  let empty: number[] | null = null;
  for (let attempt = 0; attempt < 80; attempt++) {
    sPlus = balancedSequence(n, k, maxConsecutive, rng);
    if (nComp === 4) {
      empty = null;
      if (isBalanced(sPlus, k) && maxRun(sPlus) <= maxConsecutive) break;
      continue;
    }
    if (nComp === 3) {
      empty = emptySequence(n, sPlus, maxConsecutive, rng);
      if (
        empty &&
        isBalanced(sPlus, k) &&
        isBalanced(empty, k) &&
        maxRun(sPlus) <= maxConsecutive &&
        empty.every((value, i) => value !== sPlus[i])
      ) {
        break;
      }
      empty = null;
    } else {
      const built = twoEmptySequence(n, sPlus, rng);
      if (built && isBalanced(sPlus, k) && maxRun(sPlus) <= maxConsecutive) {
        return trials.map((trial, i) =>
          placeTwoEmpty(trial, sPlus[i] as number, built[i]?.[0] as number, built[i]?.[1] as number, rng),
        );
      }
    }
  }

  if (nComp === 3) {
    if (!empty) {
      sPlus = roundRobin(n, k);
      empty = sPlus.map((value) => (value + 1) % k);
    }
    return trials.map((trial, i) => place(trial, sPlus[i] as number, empty?.[i] ?? null, rng));
  }
  if (nComp === 4) {
    if (!isBalanced(sPlus, k)) sPlus = roundRobin(n, k);
    return trials.map((trial, i) => place(trial, sPlus[i] as number, null, rng));
  }
  const empties = twoEmptySequence(n, sPlus, rng) ?? sPlus.map((value) => [(value + 1) % k, (value + 2) % k]);
  return trials.map((trial, i) =>
    placeTwoEmpty(trial, sPlus[i] as number, empties[i]?.[0] as number, empties[i]?.[1] as number, rng),
  );
}

function roundRobin(n: number, k: number): number[] {
  return Array.from({ length: n }, (_, i) => i % k);
}

function placeTwoEmpty(
  trial: TrialLike,
  sPlusIndex: number,
  emptyA: number,
  emptyB: number,
  rng: () => number,
): PositionAssignment {
  const banned = new Set([emptyA, emptyB]);
  const open = CORNERS.map((_, index) => index).filter((index) => !banned.has(index) || index === sPlusIndex);
  const usable = open.filter((index) => index !== sPlusIndex);
  const negatives = shuffle(
    trial.comparisonStimuli.filter((id) => id !== trial.correct),
    rng,
  );
  const placements: { stimulus: string; corner: Corner }[] = [
    { stimulus: trial.correct, corner: CORNERS[sPlusIndex] as Corner },
  ];
  const cornerForNegative = usable[0];
  const negative = negatives[0];
  if (cornerForNegative !== undefined && negative) {
    placements.push({ stimulus: negative, corner: CORNERS[cornerForNegative] as Corner });
  }
  return {
    emptyCorner: CORNERS[emptyA] as Corner,
    sPlusCorner: CORNERS[sPlusIndex] as Corner,
    placements,
  };
}

/** Each trial gets two distinct empty corners, neither equal to S+. Counts of empty-slot use differ by at most 1. */
function twoEmptySequence(n: number, sPlus: number[], rng: () => number): number[][] | null {
  const k = CORNERS.length;
  const slotTargets = Math.floor((2 * n) / k);
  for (let attempt = 0; attempt < 40; attempt++) {
    const remaining = Array.from({ length: k }, () => slotTargets + (attempt % 2 === 0 ? 0 : 0));
    // Distribute the 2n slots as evenly as possible.
    const base = Math.floor((2 * n) / k);
    const extra = (2 * n) % k;
    const order = shuffle(Array.from({ length: k }, (_, i) => i), rng);
    for (let i = 0; i < k; i++) remaining[i] = base;
    for (let i = 0; i < extra; i++) {
      const idx = order[i] as number;
      remaining[idx] = (remaining[idx] ?? 0) + 1;
    }
    const result: number[][] = [];
    let failed = false;
    for (let t = 0; t < n; t++) {
      const options = shuffle(
        Array.from({ length: k }, (_, i) => i).filter((i) => i !== sPlus[t] && (remaining[i] ?? 0) > 0),
        rng,
      );
      if (options.length < 2) {
        failed = true;
        break;
      }
      const a = options[0] as number;
      const b = options[1] as number;
      remaining[a] = (remaining[a] ?? 0) - 1;
      remaining[b] = (remaining[b] ?? 0) - 1;
      result.push([a, b]);
    }
    if (!failed && result.length === n) return result;
  }
  return null;
}
