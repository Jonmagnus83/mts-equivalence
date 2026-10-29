import { mulberry32 } from '../rng';
import {
  PROTOCOL,
  readyMessage,
  type AgentPlugin,
  type TrialResponse,
  type VisibleTrialRequest,
} from './protocol';
import { createSeiaiaPlugin, type SeiaiaBuild } from './seiaia/plugin';

export interface AgentBuild extends SeiaiaBuild {}

const custom = new Map<string, (build: AgentBuild) => AgentPlugin>();

/** Register a browser agent. Built-in ids cannot be replaced. */
export function registerAgentPlugin(type: string, factory: (build: AgentBuild) => AgentPlugin): void {
  if (type === 'tilfeldig' || type === 'perfekt' || type === 'perfekt-ikke-deriverer' || type === 'seiaia_ps') {
    throw new Error(`Agenttypen ${type} er innebygd.`);
  }
  custom.set(type, factory);
}

export function createAgentPlugin(type: string, build: AgentBuild): AgentPlugin {
  if (type === 'tilfeldig') return randomAgent(build);
  if (type === 'perfekt') return perfectAgent(build, true);
  if (type === 'perfekt-ikke-deriverer') return perfectAgent(build, false);
  if (type === 'seiaia_ps') return createSeiaiaPlugin(build);
  const factory = custom.get(type);
  if (!factory) throw new Error(`Ukjent agenttype: ${type}`);
  return factory(build);
}

function responseFor(
  request: VisibleTrialRequest,
  position: number,
  corner: string | undefined,
  meta: Record<string, unknown>,
): TrialResponse {
  return {
    type: 'trial_response',
    protocol: PROTOCOL,
    run_id: request.run_id,
    trial_nr: request.trial_nr,
    position,
    corner,
    meta,
  };
}

function randomAgent(build: AgentBuild): AgentPlugin {
  const rng = mulberry32(build.seed);
  let cache: { trial: number; response: TrialResponse } | null = null;
  return {
    agentType: 'tilfeldig',
    agentVersion: '1',
    agentId: `tilfeldig-s${build.seed}`,
    model: null,
    memoryMode: 'none',
    memoryN: null,
    parameters: { policy: 'uniform' },
    init() {
      return readyMessage('tilfeldig', '1');
    },
    decide(request) {
      if (cache?.trial === request.trial_nr) return cache.response;
      const n = request.comparisons.length;
      const index = n > 0 ? Math.floor(rng() * n) : 0;
      const slot = request.comparisons[index] ?? request.comparisons[0];
      if (!slot) throw new Error('Ingen sammenligninger.');
      const response = responseFor(request, slot.position, slot.corner, { route: 'uniform' });
      cache = { trial: request.trial_nr, response };
      return response;
    },
  };
}

/**
 * Learns sample → comparison from feedback and, when `derive` is on,
 * closes the classes with union-find (symmetry, transitivity, equivalence).
 * A trial without feedback does not update the table.
 */
function perfectAgent(build: AgentBuild, derive: boolean): AgentPlugin {
  const rng = mulberry32(build.seed ^ 0x9e3779b9);
  const parent = new Map<string, string>();
  const excluded = new Set<string>();
  const direct = new Map<string, string>();
  let cache: { trial: number; response: TrialResponse } | null = null;
  let pending: { sample: string; comps: { position: number; id: string }[]; position: number } | null = null;

  const find = (id: string): string => {
    const next = parent.get(id);
    if (!next || next === id) return id;
    const root = find(next);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const sameClass = (a: string, b: string) => find(a) === find(b);
  const learn = (correct: boolean | null) => {
    const last = pending;
    pending = null;
    if (!last || correct === null) return;
    const chosen = last.comps.find((item) => item.position === last.position);
    if (!chosen) return;
    const key = `${last.sample}|${chosen.id}`;
    if (correct) {
      excluded.delete(key);
      direct.set(last.sample, chosen.id);
      if (derive) union(last.sample, chosen.id);
    } else {
      excluded.add(key);
    }
  };
  const pick = (sample: string, comps: { position: number; id: string }[]): number => {
    if (derive) {
      const same = comps.filter((item) => sameClass(sample, item.id));
      if (same.length > 0) return same[0]!.position;
    } else {
      const known = direct.get(sample);
      const hit = comps.find((item) => item.id === known);
      if (hit) return hit.position;
    }
    const open = comps.filter((item) => !excluded.has(`${sample}|${item.id}`));
    const pool = open.length > 0 ? open : comps;
    const index = Math.floor(rng() * pool.length);
    return pool[index]!.position;
  };

  const type = derive ? 'perfekt' : 'perfekt-ikke-deriverer';
  return {
    agentType: type,
    agentVersion: '1',
    agentId: `${type}-s${build.seed}`,
    model: null,
    memoryMode: 'full',
    memoryN: null,
    parameters: { derive, test_in_history: true },
    init() {
      return readyMessage(type, '1');
    },
    decide(request) {
      if (cache?.trial === request.trial_nr) return cache.response;
      if (request.previous && pending) {
        const correct = request.previous.feedback_given ? request.previous.correct : null;
        learn(correct === true ? true : correct === false ? false : null);
      } else {
        pending = null;
      }
      const comps = request.comparisons.map((item) => ({ position: item.position, id: item.id }));
      const position = pick(request.sample.id, comps);
      pending = { sample: request.sample.id, comps, position };
      const slot = request.comparisons.find((item) => item.position === position);
      const response = responseFor(request, position, slot?.corner, { route: derive ? 'derive' : 'direct' });
      cache = { trial: request.trial_nr, response };
      return response;
    },
    onEnd(end) {
      if (!pending) return;
      const correct = end.previous?.feedback_given ? end.previous.correct : null;
      learn(correct === true ? true : correct === false ? false : null);
    },
  };
}
