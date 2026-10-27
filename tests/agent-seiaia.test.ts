import { describe, expect, it } from 'vitest';
import { createAgentPlugin } from '../src/agents/builtin';
import { runAgentSession } from '../src/agents/driver';
import { parseConfig } from '../src/config';
import { createAgent, DEFAULT_AGENT, runSession } from '../src/agents/seiaia/agent.js';

const fingerprint = '2,2,2,2,3,1,2,2,1,3,1,1,2,1,3,1,2,2';

describe('SEIAIA-PS in the browser', () => {
  it('matches the locked JavaScript fingerprint and stays deterministic', () => {
    expect(DEFAULT_AGENT.test_in_history).toBe(true);
    const config = {
      agent: { memory_mode: 'full', gamma: 0.001, derived_mode: 'path', test_in_history: true },
      protocol: { max_blocks: 1, force_test: false, thinning_levels: [] },
    };
    const once = runSession(config, 1);
    const twice = runSession(config, 1);
    expect(once.status).toBe('failed_training');
    expect(once.n_trials).toBe(18);
    expect(once.logs.map((row) => row.agent_choice_position).join(',')).toBe(fingerprint);
    expect(twice.logs.map((row) => row.agent_choice_position)).toEqual(once.logs.map((row) => row.agent_choice_position));
    expect(twice.logs.map((row) => row.correct)).toEqual(once.logs.map((row) => row.correct));
  });

  it('repeats the same choice after reset, including corner objects', () => {
    const agent = createAgent({ memory_mode: 'full', test_in_history: true }, 1);
    const trial = {
      sample: { id: 'A1' },
      comparisons: [
        { id: 'B3', corner: 'øv' },
        { id: 'B1', corner: 'nv' },
        { id: 'B2', corner: 'nh' },
      ],
      training: true,
    };
    const first = agent.choose(trial);
    expect(first).toBe(2);
    agent.feedback(true);
    agent.reset();
    expect(agent.choose(trial)).toBe(first);
  });

  it('rejects an unknown configuration key', () => {
    expect(() => createAgent({ no_such: 1 }, 1)).toThrow(/ukjent/);
  });

  it('runs inside the lab session without seeing the observer', async () => {
    const seen: unknown[] = [];
    const agent = createAgentPlugin('seiaia_ps', {
      seed: 1,
      memoryMode: 'full',
      memoryN: 36,
      gamma: 0.001,
      derivedMode: 'path',
      neVariant: 'sne',
    });
    const decide = agent.decide.bind(agent);
    agent.decide = (request) => {
      seen.push(request);
      return decide(request);
    };
    const result = await runAgentSession({
      config: parseConfig({
        itiSeconds: 0,
        feedbackDurationMs: 0,
        sampleClicks: 0,
        stimulusSet: 'abstrakte',
        thinning: [100],
        correction: false,
        testSymmetry: false,
        testTransitivity: false,
        testEquivalence: false,
      }),
      participantNumber: 42001,
      seed: 1,
      agent,
      limits: { maxBlocks: 2, maxTrials: 6 },
      pace: 'rask',
      revealCorrection: false,
      now: () => Date.parse('2026-10-27T08:00:00.000Z'),
      mono: () => 0,
    });
    expect(result.session.trials.length).toBe(6);
    expect(result.exportMeta.parameters.test_in_history).toBe(true);
    expect(seen.length).toBe(6);
    for (const request of seen) {
      expect(request).not.toHaveProperty('observer');
      expect(JSON.stringify(request)).not.toContain('riktig_posisjon');
    }
    const positions = result.exportMeta.traces.map((trace) => trace.position);
    expect(positions.every((position) => position !== null && position >= 1 && position <= 3)).toBe(true);
  });
});
