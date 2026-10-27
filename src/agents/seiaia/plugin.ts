import {
  PROTOCOL,
  capMeta,
  readyMessage,
  type AgentPlugin,
  type SessionEnd,
  type TrialResponse,
  type VisibleTrialRequest,
} from '../protocol';
import { createAgent, type SeiaiaAgent } from './agent.js';

export const SEIAIA_JS_VERSION = '0.1.0-js';

export interface SeiaiaBuild {
  seed: number;
  memoryMode: 'full' | 'last_n' | 'none';
  memoryN: number;
  gamma: number;
  derivedMode: 'path' | 'ne';
  neVariant: 'sne' | 'dne';
}

/**
 * Browser port of SEIAIA-PS. Test trials stay in the memory window
 * (`test_in_history: true`, Jon 27.10.2026). `training` is set from the
 * session stage and is not part of the object passed to a generic `decide`.
 */
export function createSeiaiaPlugin(build: SeiaiaBuild): AgentPlugin {
  const agent: SeiaiaAgent = createAgent(
    {
      memory_mode: build.memoryMode,
      memory_n: build.memoryN,
      gamma: build.gamma,
      derived_mode: build.derivedMode,
      ne_variant: build.neVariant,
      test_in_history: true,
    },
    build.seed,
  );
  let training = true;
  let cache: { trial: number; response: TrialResponse } | null = null;
  let awaitingFeedback = false;

  const applyPrevious = (request: VisibleTrialRequest) => {
    if (!awaitingFeedback) return;
    const previous = request.previous;
    const correct = previous?.feedback_given ? previous.correct : null;
    agent.feedback(correct === true ? true : correct === false ? false : null);
    awaitingFeedback = false;
  };

  const plugin: AgentPlugin = {
    agentType: 'seiaia_ps',
    agentVersion: SEIAIA_JS_VERSION,
    agentId: `seiaia_ps-${build.memoryMode}-g${build.gamma}-s${build.seed}`,
    model: null,
    memoryMode: build.memoryMode,
    memoryN: build.memoryMode === 'last_n' ? build.memoryN : null,
    parameters: {
      gamma: build.gamma,
      memory_mode: build.memoryMode,
      memory_n: build.memoryMode === 'last_n' ? build.memoryN : null,
      derived_mode: build.derivedMode,
      ne_variant: build.neVariant,
      test_in_history: true,
      policy: 'standard',
    },
    init() {
      return readyMessage('seiaia_ps', SEIAIA_JS_VERSION, ['reset']);
    },
    noteStage(stage) {
      training = stage.training;
    },
    decide(request) {
      if (cache?.trial === request.trial_nr) return cache.response;
      applyPrevious(request);
      const position = agent.choose({
        sample: request.sample.id,
        comparisons: request.comparisons.map((item) => ({ id: item.id, corner: item.corner })),
        training,
      });
      awaitingFeedback = true;
      const slot = request.comparisons[position - 1];
      const response: TrialResponse = {
        type: 'trial_response',
        protocol: PROTOCOL,
        run_id: request.run_id,
        trial_nr: request.trial_nr,
        position,
        corner: slot?.corner,
        meta: capMeta({ route: agent.lastRoute, p_choice: agent.lastProbs ? [...agent.lastProbs] : [] }),
      };
      cache = { trial: request.trial_nr, response };
      return response;
    },
    onEnd(end: SessionEnd) {
      if (!awaitingFeedback) return;
      const previous = end.previous;
      const correct = previous?.feedback_given ? previous.correct : null;
      agent.feedback(correct === true ? true : correct === false ? false : null);
      awaitingFeedback = false;
    },
    reset() {
      agent.reset();
      cache = null;
      awaitingFeedback = false;
      training = true;
      return readyMessage('seiaia_ps', SEIAIA_JS_VERSION, ['reset']);
    },
  };
  return plugin;
}
