/**
 * Register a browser agent here, then add it to the list in `launch.ts`
 * (`registerAgentChoice`) if it should appear in the setup form.
 *
 * The factory is wired when the agent page loads. It must implement `AgentPlugin`
 * from `./protocol` and must read only the visible trial request.
 *
 *   import { registerAgentPlugin } from './builtin';
 *   import { registerAgentChoice } from './launch';
 *   registerAgentChoice({ id: 'min-agent', label: 'Min agent', needsThree: false });
 *   registerAgentPlugin('min-agent', (build) => ({ ... }));
 *
 * Mofrad EPS/E-EPS and an LLM bot are not registered here. They need a local
 * process and are described in `docs/agentadapter.md`.
 */
export {};
