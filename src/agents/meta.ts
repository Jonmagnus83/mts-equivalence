import type { ProtocolReason } from './protocol';

export interface AgentTraceExport {
  forsøk_nr: number;
  position: number | null;
  latencyMs: number;
  invalid: 0 | 1;
  attempts: number;
  request: unknown;
  response: unknown;
}

export interface AgentExportData {
  runId: string;
  participantNumber: number;
  studyId: string;
  agentId: string;
  agentType: string;
  agentVersion: string;
  seed: number;
  memoryMode: string;
  memoryN: number | null;
  model: string | null;
  revealCorrection: boolean;
  historyInRequest: 'none';
  maxBlocks: number;
  maxTrials: number;
  clock: 'virtuell' | 'sanntid';
  endReason: string;
  protocolReason: ProtocolReason;
  folder: 'Boter-AI';
  parameters: Record<string, string | number | boolean | null>;
  startedUtc: string;
  endedUtc: string;
  message: string;
  traces: AgentTraceExport[];
}

export function agentParameterColumns(agent: AgentExportData): Record<string, string | number> {
  return {
    par_run_id: agent.runId,
    par_agent_id: agent.agentId,
    par_agent_type: agent.agentType,
    par_agent_versjon: agent.agentVersion,
    par_seed: agent.seed,
    par_minne_modus: agent.memoryMode,
    par_minne_n: agent.memoryN ?? '',
    par_modell: agent.model ?? '',
    par_maks_blokker: agent.maxBlocks,
    par_maks_forsok: agent.maxTrials,
    par_avslor_korreksjon: agent.revealCorrection ? 1 : 0,
    par_klokke: agent.clock,
    par_avslutning: agent.endReason,
    par_mappe: agent.folder,
    par_protokoll: 'mts-agent/1',
  };
}

export function agentMetadata(agent: AgentExportData): Record<string, unknown> {
  return {
    run_id: agent.runId,
    deltakernr: agent.participantNumber,
    studie_id: agent.studyId,
    agent_id: agent.agentId,
    agent_type: agent.agentType,
    agent_version: agent.agentVersion,
    adapter_protocol: 'mts-agent/1',
    seed: agent.seed,
    memory_mode: agent.memoryMode,
    memory_n: agent.memoryN,
    parameters: agent.parameters,
    model: agent.model,
    reveal_correction: agent.revealCorrection,
    history_in_request: agent.historyInRequest,
    limits: { max_blocks: agent.maxBlocks, max_trials: agent.maxTrials },
    clock: agent.clock,
    folder: agent.folder,
    started_utc: agent.startedUtc,
    ended_utc: agent.endedUtc,
    end_reason: agent.endReason,
    protocol_reason: agent.protocolReason,
    message: agent.message,
  };
}

export function tracesToJsonl(traces: AgentTraceExport[]): string {
  if (traces.length === 0) return '';
  return `${traces
    .map((trace) =>
      JSON.stringify({
        trial_request: trace.request,
        trial_response: trace.response,
        latency_ms: trace.latencyMs,
        agent_ugyldig: trace.invalid,
        agent_forsok_nr: trace.attempts,
      }),
    )
    .join('\n')}\n`;
}
