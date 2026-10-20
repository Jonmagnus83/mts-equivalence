import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config';
import {
  feedbackCount,
  jonTestRequired,
  literatureRequired,
  meetsMastery,
  requiredCorrect,
} from '../src/criteria';
import { isBalanced, maxRun } from '../src/positions';
import { classifyPair } from '../src/relations';
import { mulberry32 } from '../src/rng';
import { SYMBOLS } from '../src/symbols';
import { generateTestBlock, generateTrainingBlock, planSizes } from '../src/trials';
import type { Corner } from '../src/types';
import { CORNERS } from '../src/types';

const cornerIndex = (corner: Corner) => CORNERS.indexOf(corner);

describe('criteria', () => {
  it('uses 17/18 as the training default and scales with block size', () => {
    expect(requiredCorrect(18, 17, 18)).toBe(17);
    expect(requiredCorrect(36, 17, 18)).toBe(34);
    expect(meetsMastery(17, 18, 17, 18)).toBe(true);
    expect(meetsMastery(16, 18, 17, 18)).toBe(false);
  });

  it('matches Jon’s >95% table and the 17/18 literature rule', () => {
    const table: [number, number][] = [
      [9, 9],
      [18, 18],
      [20, 20],
      [21, 20],
      [27, 26],
      [36, 35],
    ];
    for (const [n, required] of table) expect(jonTestRequired(n)).toBe(required);
    expect(literatureRequired(18)).toBe(17);
    expect(literatureRequired(9)).toBe(9);
    expect(literatureRequired(36)).toBe(34);
  });

  it('rounds feedback thinning and keeps the endpoints exact', () => {
    expect(feedbackCount(18, 100)).toBe(18);
    expect(feedbackCount(18, 75)).toBe(14);
    expect(feedbackCount(18, 50)).toBe(9);
    expect(feedbackCount(18, 0)).toBe(0);
  });
});

describe('training blocks', () => {
  it('builds an 18-trial LS block and balances corners', () => {
    const config = defaultConfig();
    const plan = planSizes(config);
    expect(plan.trainingRelations).toBe(6);
    expect(plan.trialsPerTrainingBlock).toBe(18);

    for (let seed = 1; seed <= 25; seed++) {
      const block = generateTrainingBlock(config, 75, mulberry32(seed));
      expect(block).toHaveLength(18);
      expect(block.every((trial) => trial.relationType === 'baseline')).toBe(true);
      const perRelation = new Map<string, number>();
      for (const trial of block) perRelation.set(trial.relation, (perRelation.get(trial.relation) ?? 0) + 1);
      expect(perRelation.size).toBe(6);
      for (const count of perRelation.values()) expect(count).toBe(3);

      const sPlus = block.map((trial) => cornerIndex(trial.sPlusCorner));
      const empty = block.map((trial) => cornerIndex(trial.emptyCorner as Corner));
      expect(isBalanced(sPlus, 4)).toBe(true);
      expect(isBalanced(empty, 4)).toBe(true);
      expect(maxRun(sPlus)).toBeLessThanOrEqual(config.maxConsecutiveSPlus);
      expect(empty.every((value, index) => value !== sPlus[index])).toBe(true);

      for (const trial of block) {
        expect(trial.placements).toHaveLength(3);
        expect(trial.comparisonStimuli).toHaveLength(3);
        expect(new Set(trial.placements.map((item) => item.corner)).size).toBe(3);
        const correctPlacement = trial.placements.find((item) => item.stimulus === trial.correct);
        expect(correctPlacement?.corner).toBe(trial.sPlusCorner);
        expect(trial.placements.some((item) => item.corner === trial.emptyCorner)).toBe(false);
      }

      expect(block.filter((trial) => trial.feedbackScheduled).length).toBe(14);
    }
  });

  it('labels OTM and MTO tests the way the plan specifies', () => {
    expect(classifyPair('LS', 3, 1, 0)).toBe('symmetri');
    expect(classifyPair('LS', 3, 2, 1)).toBe('symmetri');
    expect(classifyPair('LS', 3, 0, 2)).toBe('transitivitet');
    expect(classifyPair('LS', 3, 2, 0)).toBe('ekvivalens');
    expect(classifyPair('LS', 4, 0, 3)).toBe('transitivitet');
    expect(classifyPair('LS', 4, 3, 0)).toBe('ekvivalens');

    expect(classifyPair('OTM', 3, 0, 1)).toBe('baseline');
    expect(classifyPair('OTM', 3, 0, 2)).toBe('baseline');
    expect(classifyPair('OTM', 3, 1, 0)).toBe('symmetri');
    expect(classifyPair('OTM', 3, 2, 0)).toBe('symmetri');
    expect(classifyPair('OTM', 3, 1, 2)).toBe('ekvivalens');
    expect(classifyPair('OTM', 3, 2, 1)).toBe('ekvivalens');

    expect(classifyPair('MTO', 3, 0, 2)).toBe('baseline');
    expect(classifyPair('MTO', 3, 1, 2)).toBe('baseline');
    expect(classifyPair('MTO', 3, 2, 0)).toBe('symmetri');
    expect(classifyPair('MTO', 3, 2, 1)).toBe('symmetri');
    expect(classifyPair('MTO', 3, 0, 1)).toBe('ekvivalens');
    expect(classifyPair('MTO', 3, 1, 0)).toBe('ekvivalens');
  });

  it('mixes symmetry, transitivity and equivalence, and leaves reflexivity and baseline out', () => {
    const config = defaultConfig();
    const block = generateTestBlock(config, mulberry32(3));
    expect(block).toHaveLength(36);
    const counts = new Map<string, number>();
    for (const trial of block) counts.set(trial.relationType, (counts.get(trial.relationType) ?? 0) + 1);
    expect(counts.get('symmetri')).toBe(18);
    expect(counts.get('transitivitet')).toBe(9);
    expect(counts.get('ekvivalens')).toBe(9);
    expect(counts.get('baseline')).toBeUndefined();
    expect(counts.get('refleksivitet')).toBeUndefined();
    expect(block.every((trial) => trial.feedbackScheduled === false)).toBe(true);
    expect(block.every((trial) => trial.thinningPercent === 0)).toBe(true);

    const labels = new Set(block.map((trial) => trial.relationLabel));
    expect(labels).toEqual(new Set(['BA', 'CB', 'AC', 'CA']));
  });

  it('gives a fresh order when the block is generated again', () => {
    const config = defaultConfig();
    const a = generateTrainingBlock(config, 100, mulberry32(1)).map((trial) => trial.relation).join(',');
    const b = generateTrainingBlock(config, 100, mulberry32(2)).map((trial) => trial.relation).join(',');
    expect(a).not.toBe(b);
  });
});

describe('symbol set', () => {
  it('contains at least 24 unique abstract symbols', () => {
    expect(SYMBOLS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(SYMBOLS.map((symbol) => symbol.id)).size).toBe(SYMBOLS.length);
    for (const symbol of SYMBOLS) {
      expect(symbol.body.length).toBeGreaterThan(10);
      expect(symbol.body.toLowerCase()).not.toContain('text');
    }
  });
});
