import type { ExperimentConfig } from '../types';

export type Pace = 'rask' | 'sanntid';
export type MemoryMode = 'full' | 'last_n' | 'none';
export type DerivedMode = 'path' | 'ne';
export type NeVariant = 'sne' | 'dne';

export interface AgentChoice {
  id: string;
  label: string;
  needsThree: boolean;
}

export const AGENT_CHOICES: AgentChoice[] = [
  { id: 'tilfeldig', label: 'Tilfeldig', needsThree: false },
  { id: 'perfekt', label: 'Perfekt lærer', needsThree: false },
  { id: 'perfekt-ikke-deriverer', label: 'Perfekt lærer uten avledning', needsThree: false },
  { id: 'seiaia_ps', label: 'SEIAIA-PS', needsThree: true },
];

const extraChoices: AgentChoice[] = [];

export function registerAgentChoice(choice: AgentChoice): void {
  if (AGENT_CHOICES.some((item) => item.id === choice.id) || extraChoices.some((item) => item.id === choice.id)) return;
  extraChoices.push(choice);
}

export function agentChoices(): AgentChoice[] {
  return [...AGENT_CHOICES, ...extraChoices];
}

export interface AgentSettings {
  agentType: string;
  seed: number;
  pace: Pace;
  maxBlocks: number;
  maxTrials: number;
  revealCorrection: boolean;
  memoryMode: MemoryMode;
  memoryN: number;
  gamma: number;
  derivedMode: DerivedMode;
  neVariant: NeVariant;
}

export interface AgentLaunch extends AgentSettings {
  config: ExperimentConfig;
  participantNumber: number;
  folder: 'Boter-AI';
}

const SETTINGS_KEY = 'mts-lab-agent-settings';
const LAUNCH_KEY = 'mts-lab-agent-launch';

export function defaultAgentSettings(): AgentSettings {
  return {
    agentType: 'seiaia_ps',
    seed: 1,
    pace: 'rask',
    maxBlocks: 20,
    maxTrials: 1500,
    revealCorrection: false,
    memoryMode: 'full',
    memoryN: 72,
    gamma: 0.001,
    derivedMode: 'path',
    neVariant: 'sne',
  };
}

export function loadAgentSettings(): AgentSettings {
  const base = defaultAgentSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return base;
    return normalizeSettings(JSON.parse(raw) as Partial<AgentSettings>);
  } catch {
    return base;
  }
}

export function saveAgentSettings(settings: AgentSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function saveAgentLaunch(launch: AgentLaunch): void {
  localStorage.setItem(LAUNCH_KEY, JSON.stringify(launch));
}

export function loadAgentLaunch(): AgentLaunch | null {
  try {
    const raw = localStorage.getItem(LAUNCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AgentLaunch>;
    if (!parsed.config || parsed.folder !== 'Boter-AI') return null;
    if (typeof parsed.participantNumber !== 'number') return null;
    return { ...normalizeSettings(parsed), config: parsed.config, participantNumber: parsed.participantNumber, folder: 'Boter-AI' };
  } catch {
    return null;
  }
}

export function normalizeSettings(input: Partial<AgentSettings> | null | undefined): AgentSettings {
  const base = defaultAgentSettings();
  const source = input ?? {};
  const pace: Pace = source.pace === 'sanntid' ? 'sanntid' : 'rask';
  const memoryMode: MemoryMode =
    source.memoryMode === 'last_n' || source.memoryMode === 'none' || source.memoryMode === 'full'
      ? source.memoryMode
      : base.memoryMode;
  const derivedMode: DerivedMode = source.derivedMode === 'ne' ? 'ne' : 'path';
  const neVariant: NeVariant = source.neVariant === 'dne' ? 'dne' : 'sne';
  const gamma = typeof source.gamma === 'number' && source.gamma >= 0 && source.gamma < 1 ? source.gamma : base.gamma;
  return {
    agentType: typeof source.agentType === 'string' && source.agentType ? source.agentType : base.agentType,
    seed: clampInt(source.seed, 0, 0xffffffff, base.seed),
    pace,
    maxBlocks: clampInt(source.maxBlocks, 1, 500, base.maxBlocks),
    maxTrials: clampInt(source.maxTrials, 1, 20000, base.maxTrials),
    revealCorrection: source.revealCorrection === true,
    memoryMode,
    memoryN: clampInt(source.memoryN, 1, 5000, base.memoryN),
    gamma,
    derivedMode,
    neVariant,
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function agentModeAllowed(folder: string | null | undefined): boolean {
  return folder === 'Boter-AI';
}
