import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { ABSTRACT_GLYPHS, stimulusMarkup } from '../src/abstract-symbols';
import { createAgentPlugin } from '../src/agents/builtin';
import { runAgentSession } from '../src/agents/driver';
import { agentModeAllowed } from '../src/agents/launch';
import { comparisonsInReadingOrder, resolveChoice } from '../src/agents/reading-order';
import { defaultConfig, parseConfig } from '../src/config';
import { requiredCorrect } from '../src/criteria';
import { buildExport } from '../src/export';
import type { ProgrammedView } from '../src/session';
import type { AgentPlugin, VisibleTrialRequest } from '../src/agents/protocol';
import { PROTOCOL } from '../src/agents/protocol';
import type { ExperimentConfig } from '../src/types';

function fastConfig(over: Partial<ExperimentConfig> = {}): ExperimentConfig {
  return parseConfig({
    ...defaultConfig(),
    itiSeconds: 0,
    feedbackDurationMs: 0,
    sampleClicks: 0,
    stimulusSet: 'abstrakte',
    wrongFeedback: 'none',
    ...over,
  });
}

function harness(pick: (request: VisibleTrialRequest, view: ProgrammedView | null) => { position: number; corner?: string }) {
  const seen: VisibleTrialRequest[] = [];
  let view: ProgrammedView | null = null;
  const plugin: AgentPlugin = {
    agentType: 'test',
    agentVersion: '1',
    agentId: 'test-s1',
    parameters: {},
    model: null,
    memoryMode: 'none',
    memoryN: null,
    init: () => ({ type: 'ready', agent_type: 'test', agent_version: '1', protocol: PROTOCOL, capabilities: [] }),
    decide(request) {
      seen.push(request);
      const choice = pick(request, view);
      const slot = request.comparisons.find((item) => item.position === choice.position);
      return {
        type: 'trial_response',
        protocol: PROTOCOL,
        run_id: request.run_id,
        trial_nr: request.trial_nr,
        position: choice.position,
        corner: choice.corner ?? slot?.corner,
      };
    },
  };
  return { plugin, seen, beforeChoice: (session: { currentProgrammed: () => ProgrammedView | null }) => { view = session.currentProgrammed(); } };
}

describe('reading order', () => {
  it('maps corners to positions 1–3 and skips the empty corner', () => {
    const slots = comparisonsInReadingOrder([
      { stimulus: 'C2', corner: 'nh' },
      { stimulus: 'C3', corner: 'øv' },
      { stimulus: 'C1', corner: 'nv' },
    ]);
    expect(slots.map((slot) => `${slot.position}:${slot.corner}:${slot.stimulus}`)).toEqual([
      '1:øv:C3',
      '2:nv:C1',
      '3:nh:C2',
    ]);
    expect(resolveChoice(slots, 3, 'nh').ok).toBe(true);
    expect(resolveChoice(slots, 3, 'øv').ok).toBe(false);
    expect(resolveChoice(slots, 4).ok).toBe(false);
  });

  it('supports 2 and 4 comparisons', () => {
    const two = comparisonsInReadingOrder([
      { stimulus: 'B2', corner: 'nh' },
      { stimulus: 'B1', corner: 'øh' },
    ]);
    expect(two.map((slot) => slot.position)).toEqual([1, 2]);
    expect(two[0]?.corner).toBe('øh');
    const four = comparisonsInReadingOrder([
      { stimulus: 'B4', corner: 'nh' },
      { stimulus: 'B2', corner: 'øh' },
      { stimulus: 'B1', corner: 'øv' },
      { stimulus: 'B3', corner: 'nv' },
    ]);
    expect(four.map((slot) => `${slot.position}${slot.corner}`)).toEqual(['1øv', '2øh', '3nv', '4nh']);
  });
});

describe('agent driver', () => {
  it('clicks the comparison at the requested reading-order position', async () => {
    const tool = harness(() => ({ position: 2 }));
    const result = await runAgentSession({
      config: fastConfig({ thinning: [100], testSymmetry: false, testTransitivity: false, testEquivalence: false }),
      participantNumber: 41001,
      seed: 4,
      agent: tool.plugin,
      limits: { maxBlocks: 2, maxTrials: 1 },
      pace: 'rask',
      revealCorrection: false,
      beforeChoice: tool.beforeChoice,
      now: () => 1_700_000_000_000,
      mono: () => 0,
    });
    const request = tool.seen[0];
    expect(request?.comparisons).toHaveLength(3);
    expect(result.session.trials[0]?.valgt_stimulus).toBe(request?.comparisons[1]?.id);
    expect(result.session.trials[0]?.valgt_posisjon).toBe(request?.comparisons[1]?.corner);
    expect(result.reason).toBe('ikke_mestret');
  });

  it('never gives the agent observer fields, and hides the answer when feedback was not given', async () => {
    const tool = harness((request) => ({ position: request.comparisons[0]?.position ?? 1 }));
    await runAgentSession({
      config: fastConfig({ thinning: [0], testSymmetry: false, testTransitivity: false, testEquivalence: false }),
      participantNumber: 41002,
      seed: 5,
      agent: tool.plugin,
      limits: { maxBlocks: 2, maxTrials: 4 },
      pace: 'rask',
      revealCorrection: false,
      now: () => 1_700_000_000_000,
      mono: () => 0,
    });
    expect(tool.seen.length).toBeGreaterThan(1);
    for (const request of tool.seen) {
      expect(request).not.toHaveProperty('observer');
      expect(request).not.toHaveProperty('training');
      expect(JSON.stringify(request)).not.toContain('riktig_posisjon');
      expect(JSON.stringify(request)).not.toContain('relasjonstype');
    }
    expect(tool.seen[0]?.previous).toBeNull();
    for (const request of tool.seen.slice(1)) {
      expect(request.previous?.feedback_given).toBe(false);
      expect(request.previous?.correct).toBeNull();
    }
  });

  it('treats 16/18 as not mastered and 17/18 as mastered in one block', async () => {
    expect(requiredCorrect(18, 17, 18)).toBe(17);
    const tool = harness((_request, view) => {
      const miss = (view?.attempt === 1 && (view.programmedIndex ?? 0) <= 2) || (view?.attempt === 2 && view.programmedIndex === 1);
      const id = miss
        ? _request.comparisons.find((item) => item.id !== view?.correct)?.id
        : _request.comparisons.find((item) => item.id === view?.correct)?.id;
      const slot = _request.comparisons.find((item) => item.id === id) ?? _request.comparisons[0];
      return { position: slot?.position ?? 1 };
    });
    const result = await runAgentSession({
      config: fastConfig({
        thinning: [100],
        correction: false,
        testSymmetry: false,
        testTransitivity: false,
        testEquivalence: false,
        testBaseline: false,
        testReflexivity: false,
      }),
      participantNumber: 41003,
      seed: 6,
      agent: tool.plugin,
      limits: { maxBlocks: 6, maxTrials: 80 },
      pace: 'rask',
      revealCorrection: false,
      beforeChoice: tool.beforeChoice,
      now: () => 1_700_000_000_000,
      mono: () => 0,
    });
    const programmed = result.session.trials.filter((trial) => trial.fase === 'trening' && trial.korreksjonsforsøk === 0);
    const first = programmed.filter((trial) => trial.blokk_gjentakelse === 1);
    const second = programmed.filter((trial) => trial.blokk_gjentakelse === 2);
    expect(first).toHaveLength(18);
    expect(first.filter((trial) => trial.riktig === 1)).toHaveLength(16);
    expect(second.filter((trial) => trial.riktig === 1)).toHaveLength(17);
    expect(result.reason).toBe('ferdig');
    expect(tool.seen.every((request) => request.correction === undefined)).toBe(true);
  });

  it('does not count correction trials toward mastery', async () => {
    const tool = harness((request, view) => {
      const id = view?.isCorrection
        ? request.comparisons.find((item) => item.id === view.correct)?.id
        : request.comparisons.find((item) => item.id !== view?.correct)?.id;
      const slot = request.comparisons.find((item) => item.id === id) ?? request.comparisons[0];
      return { position: slot?.position ?? 1 };
    });
    const result = await runAgentSession({
      config: fastConfig({
        thinning: [100],
        correction: true,
        correctionMaxRepeats: 3,
        testSymmetry: false,
        testTransitivity: false,
        testEquivalence: false,
      }),
      participantNumber: 41004,
      seed: 7,
      agent: tool.plugin,
      limits: { maxBlocks: 2, maxTrials: 400 },
      pace: 'rask',
      revealCorrection: true,
      beforeChoice: tool.beforeChoice,
      now: () => 1_700_000_000_000,
      mono: () => 0,
    });
    const programmed = result.session.trials.filter((trial) => trial.korreksjonsforsøk === 0);
    const corrections = result.session.trials.filter((trial) => trial.korreksjonsforsøk === 1);
    expect(programmed.every((trial) => trial.riktig === 0)).toBe(true);
    expect(corrections.length).toBeGreaterThan(0);
    expect(corrections.every((trial) => trial.riktig === 1)).toBe(true);
    expect(result.reason).toBe('ikke_mestret');
    expect(tool.seen.some((request) => request.correction === true)).toBe(true);
  });

  it('stops a random agent at maxBlocks with ikke_mestret', async () => {
    const slept: number[] = [];
    const result = await runAgentSession({
      config: fastConfig({ thinning: [100, 75, 50, 0], correction: false }),
      participantNumber: 41005,
      seed: 11,
      agent: createAgentPlugin('tilfeldig', { seed: 11, memoryMode: 'none', memoryN: 1, gamma: 0.001, derivedMode: 'path', neVariant: 'sne' }),
      limits: { maxBlocks: 3, maxTrials: 500 },
      pace: 'rask',
      revealCorrection: false,
      sleep: async (ms) => { slept.push(ms); },
      now: () => 1_700_000_000_000,
      mono: () => 0,
    });
    expect(result.reason).toBe('ikke_mestret');
    expect(result.sessionEnd.reason).toBe('not_mastered');
    expect(result.sessionEnd.summary.stopped_by).toBe('ikke_mestret');
    expect(new Set(result.session.trials.map((trial) => trial.blokk)).size).toBe(3);
    expect(slept).toEqual([]);
    expect(result.session.finished).toBe(true);
    const again = await runAgentSession({
      config: fastConfig({ thinning: [100, 75, 50, 0], correction: false }),
      participantNumber: 41005,
      seed: 11,
      agent: createAgentPlugin('tilfeldig', { seed: 11, memoryMode: 'none', memoryN: 1, gamma: 0.001, derivedMode: 'path', neVariant: 'sne' }),
      limits: { maxBlocks: 3, maxTrials: 500 },
      pace: 'rask',
      revealCorrection: false,
      now: () => 1_700_000_000_000,
      mono: () => 0,
    });
    expect(again.session.trials.map((trial) => trial.valgt_stimulus)).toEqual(result.session.trials.map((trial) => trial.valgt_stimulus));
  });

  it('waits out feedback and ITI in realtime', async () => {
    const slept: number[] = [];
    const result = await runAgentSession({
      config: fastConfig({
        thinning: [100],
        itiSeconds: 0.5,
        feedbackDurationMs: 2000,
        testSymmetry: false,
        testTransitivity: false,
        testEquivalence: false,
      }),
      participantNumber: 41006,
      seed: 2,
      agent: createAgentPlugin('tilfeldig', { seed: 2, memoryMode: 'none', memoryN: 1, gamma: 0.001, derivedMode: 'path', neVariant: 'sne' }),
      limits: { maxBlocks: 1, maxTrials: 1 },
      pace: 'sanntid',
      revealCorrection: false,
      sleep: async (ms) => { slept.push(ms); },
      now: () => 1_700_000_000_000,
      mono: () => 0,
    });
    expect(slept).toContain(500);
    if (result.session.trials[0]?.tilbakemelding_gitt === 1) expect(slept).toContain(2000);
    expect(result.exportMeta.clock).toBe('sanntid');
  });

  it('records an invalid corner as ugyldig and aborts after three invalid trials', async () => {
    const tool = harness(() => ({ position: 1, corner: 'ikke' }));
    const once = await runAgentSession({
      config: fastConfig({ thinning: [100], correction: false, testSymmetry: false, testTransitivity: false, testEquivalence: false }),
      participantNumber: 41007,
      seed: 1,
      agent: tool.plugin,
      limits: { maxBlocks: 2, maxTrials: 1 },
      pace: 'rask',
      revealCorrection: false,
      now: () => 1_700_000_000_000,
      mono: () => 0,
    });
    expect(once.exportMeta.traces[0]?.invalid).toBe(1);
    expect(once.exportMeta.traces[0]?.attempts).toBe(3);
    expect(once.session.trials[0]?.riktig).toBe(0);
    expect(once.reason).toBe('ikke_mestret');

    const repeated = harness(() => ({ position: 1, corner: 'ikke' }));
    const aborted = await runAgentSession({
      config: fastConfig({ thinning: [100], correction: false, testSymmetry: false, testTransitivity: false, testEquivalence: false }),
      participantNumber: 41008,
      seed: 1,
      agent: repeated.plugin,
      limits: { maxBlocks: 8, maxTrials: 20 },
      pace: 'rask',
      revealCorrection: false,
      now: () => 1_700_000_000_000,
      mono: () => 0,
    });
    expect(aborted.reason).toBe('agent_feil');
    expect(aborted.sessionEnd.reason).toBe('agent_error');
  });

  it('asks a 2-class and a 4-class agent with the matching position count', async () => {
    for (const classes of [2, 4] as const) {
      const tool = harness((request) => ({ position: request.comparisons.length }));
      await runAgentSession({
        config: fastConfig({
          classes,
          members: 3,
          thinning: [100],
          correction: false,
          testSymmetry: false,
          testTransitivity: false,
          testEquivalence: false,
        }),
        participantNumber: 41010 + classes,
        seed: 3,
        agent: tool.plugin,
        limits: { maxBlocks: 1, maxTrials: 1 },
        pace: 'rask',
        revealCorrection: false,
        now: () => 1_700_000_000_000,
        mono: () => 0,
      });
      expect(tool.seen[0]?.comparisons).toHaveLength(classes);
    }
  });

  it('lets the perfect learner finish with full marks on symmetry, transitivity and equivalence', async () => {
    const config = fastConfig({ wrongFeedback: 'literature' });
    const build = { seed: 3, memoryMode: 'full' as const, memoryN: 72, gamma: 0.001, derivedMode: 'path' as const, neVariant: 'sne' as const };
    const result = await runAgentSession({
      config,
      participantNumber: 41009,
      seed: 3,
      agent: createAgentPlugin('perfekt', build),
      limits: { maxBlocks: 12, maxTrials: 2000 },
      pace: 'rask',
      revealCorrection: false,
      now: () => Date.parse('2026-10-27T08:00:00.000Z'),
      mono: () => 0,
    });
    expect(result.reason).toBe('ferdig');
    const testRows = result.session.trials.filter((trial) => trial.fase === 'test' && trial.korreksjonsforsøk === 0);
    for (const kind of ['symmetri', 'transitivitet', 'ekvivalens'] as const) {
      const rows = testRows.filter((trial) => trial.relasjonstype === kind);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((trial) => trial.riktig === 1)).toBe(true);
    }
    const bundle = buildExport(41009, config, result.session.trials, result.session.events, result.exportMeta);
    expect(bundle.rows[0]?.par_agent_type).toBe('perfekt');
    expect(bundle.rows[0]?.par_mappe).toBe('Boter-AI');
    expect(bundle.rows[0]?.par_avslutning).toBe('ferdig');
    expect(bundle.rows[0]?.par_seed).toBe(3);
    expect(bundle.rows[0]).toHaveProperty('agent_valg_posisjon');
    expect(bundle.parameters.some((row) => row.parameter === 'par_minne_modus')).toBe(true);
    const book = XLSX.read(bundle.xlsx, { type: 'array' });
    expect(book.SheetNames).toEqual(['Data', 'Parametere', 'Hendelser', 'Oppsummering', 'Agent']);

    const human = buildExport(41009, defaultConfig(), result.session.trials, []);
    expect(human.rows[0]).not.toHaveProperty('agent_valg_posisjon');
    expect(human.rows[0]).not.toHaveProperty('par_agent_type');
    expect(human.rows[0]?.par_stimulussett).toBe('innebygd');
    expect(XLSX.read(human.xlsx, { type: 'array' }).SheetNames).toEqual(['Data', 'Parametere', 'Hendelser', 'Oppsummering']);

    const dir = mkdtempSync(join(tmpdir(), 'mts-agent-'));
    const csvPath = join(dir, '41009.csv');
    writeFileSync(csvPath, bundle.csv);
    const report = execFileSync('python3', ['analysis/analyze_mts.py', csvPath, '--out', join(dir, 'ut')], { encoding: 'utf8' });
    expect(report).toContain('symmetri');
    expect(report).toContain('41009');
  });
});

describe('stimulus set', () => {
  it('keeps the built-in set as the human default and adds the nine glyphs beside it', () => {
    const human = defaultConfig();
    expect(human.stimulusSet).toBe('innebygd');
    expect(parseConfig({ studyId: 'eldre' }).stimulusSet).toBe('innebygd');
    expect(parseConfig({ studyId: 'eldre' }).symbolAssignment).toEqual(human.symbolAssignment);
    expect(stimulusMarkup('A1', human)).toContain('<svg');
    expect(stimulusMarkup('A1', human)).not.toContain('◆');
    const glyphs = parseConfig({ stimulusSet: 'abstrakte' });
    expect(stimulusMarkup('A1', glyphs)).toContain('◆');
    expect(stimulusMarkup('B2', glyphs)).toContain('◢');
    expect(stimulusMarkup('C3', glyphs)).toContain('□');
    expect(ABSTRACT_GLYPHS).toEqual({
      A1: '◆', A2: '▲', A3: '●', B1: '■', B2: '◢', B3: '◤', C1: '△', C2: '○', C3: '□',
    });
    expect(agentModeAllowed('Boter-AI')).toBe(true);
    expect(agentModeAllowed('Mennesker')).toBe(false);
  });
});

describe('agent page guards', () => {
  it('leaves human guards in the participant page and out of the agent page', () => {
    const participant = readFileSync('src/participant.ts', 'utf8');
    const agentPage = readFileSync('src/agent-page.ts', 'utf8');
    expect(participant).toContain('requestFullscreen');
    expect(participant).toContain('beforeunload');
    expect(participant).toContain('noteInactivity');
    expect(agentPage).not.toContain('requestFullscreen');
    expect(agentPage).not.toContain('beforeunload');
    expect(agentPage).not.toContain('noteInactivity');
  });
});
