import { buildExport } from './export';
import { storageFolder } from './folders';
import type { ExperimentConfig, EventRecord, TrialRecord } from './types';
import type { PersistedSession } from './session';

const CONFIG_KEY = 'mts-lab-config';
const CODES_KEY = 'mts-lab-codes';
const SETTINGS_KEY = 'mts-lab-settings';
const SESSION_KEY = 'mts-lab-active-session';
const AUTH_KEY = 'mts-lab-auth';
const LOCAL_RUN_KEY = 'mts-lab-local-run';

export interface LabSettings {
  scriptUrl: string;
  secret: string;
  middle: string;
}

export interface StoredCode {
  code: string;
  hash: string;
  participantNumber: number;
  expiresAt: string;
  createdAt: string;
  completed: boolean;
  config: ExperimentConfig;
}

export interface EndpointFile {
  scriptUrl: string;
  middle: string;
}

const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}

export function loadSettings(): LabSettings {
  const raw = read(SETTINGS_KEY);
  const parsed = raw ? (JSON.parse(raw) as Partial<LabSettings>) : {};
  return {
    scriptUrl: typeof parsed.scriptUrl === 'string' ? parsed.scriptUrl : '',
    secret: typeof parsed.secret === 'string' ? parsed.secret : '',
    middle: storageFolder(parsed.middle),
  };
}

export function saveSettings(settings: LabSettings): void {
  write(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadSavedConfig(): unknown {
  const raw = read(CONFIG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveConfig(config: ExperimentConfig): void {
  const copy: ExperimentConfig = { ...config, customStimuli: { ...config.customStimuli } };
  write(CONFIG_KEY, JSON.stringify(copy));
}

export function loadCodes(): StoredCode[] {
  const raw = read(CODES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StoredCode[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCodes(codes: StoredCode[]): void {
  write(CODES_KEY, JSON.stringify(codes));
}

export function saveActiveSession(data: PersistedSession): void {
  write(SESSION_KEY, JSON.stringify(data));
}

export function loadActiveSession(): PersistedSession | null {
  const raw = read(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedSession;
    if (parsed?.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearActiveSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    memory.delete(SESSION_KEY);
  }
}

export interface LocalRun {
  config: ExperimentConfig;
  participantNumber: number;
}

export function saveLocalRun(run: LocalRun): void {
  write(LOCAL_RUN_KEY, JSON.stringify(run));
}

export function loadLocalRun(): LocalRun | null {
  const raw = read(LOCAL_RUN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalRun;
  } catch {
    return null;
  }
}

export function clearLocalRun(): void {
  try {
    localStorage.removeItem(LOCAL_RUN_KEY);
  } catch {
    memory.delete(LOCAL_RUN_KEY);
  }
}

export async function loadEndpointFile(): Promise<EndpointFile> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}lagring.json`, { cache: 'no-store' });
    if (!response.ok) return { scriptUrl: '', middle: 'Mennesker' };
    const parsed = (await response.json()) as Partial<EndpointFile>;
    return {
      scriptUrl: typeof parsed.scriptUrl === 'string' ? parsed.scriptUrl.trim() : '',
      middle: storageFolder(parsed.middle),
    };
  } catch {
    return { scriptUrl: '', middle: 'Mennesker' };
  }
}

export interface ExperimenterSession {
  token: string;
  expiresAt: number;
}

export function loadSessionToken(): string | null {
  const raw = read(AUTH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ExperimenterSession;
    if (!parsed.token || parsed.expiresAt <= Date.now()) return null;
    return parsed.token;
  } catch {
    return null;
  }
}

export function saveSessionToken(token: string, expiresInSec: number): void {
  const value: ExperimenterSession = { token, expiresAt: Date.now() + expiresInSec * 1000 };
  write(AUTH_KEY, JSON.stringify(value));
}

export function clearSessionToken(): void {
  try {
    localStorage.removeItem(AUTH_KEY);
  } catch {
    memory.delete(AUTH_KEY);
  }
}

export async function loginExperimenter(url: string, username: string, password: string): Promise<string> {
  const result = await postScript(url, { action: 'login', username, password });
  if (result.ok !== true || typeof result.token !== 'string') {
    throw new Error(String(result.error ?? 'Innlogging feilet.'));
  }
  const expiresIn = typeof result.expiresInSec === 'number' ? result.expiresInSec : 21600;
  saveSessionToken(result.token, expiresIn);
  return result.token;
}

export async function resolveEndpoint(): Promise<EndpointFile & { secret: string }> {
  const [file, settings] = await Promise.all([loadEndpointFile(), Promise.resolve(loadSettings())]);
  return {
    scriptUrl: settings.scriptUrl.trim() || file.scriptUrl,
    middle: storageFolder(settings.middle || file.middle),
    secret: settings.secret,
  };
}

export async function postScript(url: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(text.slice(0, 180) || `HTTP ${response.status}`);
  }
}

export async function getScript(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  const response = await fetch(target.toString());
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(text.slice(0, 180) || `HTTP ${response.status}`);
  }
}

export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): void {
  downloadBytes(filename, new TextEncoder().encode(text), mime);
}

export function downloadBytes(filename: string, bytes: Uint8Array, mime: string): void {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(binary);
}

export async function uploadResults(args: {
  scriptUrl: string;
  hash: string;
  project: string;
  middle: string;
  participantNumber: number;
  config: ExperimentConfig;
  trials: TrialRecord[];
  events: EventRecord[];
  final: boolean;
}): Promise<{ ok: boolean; detail: string }> {
  const bundle = buildExport(args.participantNumber, args.config, args.trials, args.events);
  const xlsxBase64 = bytesToBase64(bundle.xlsx);
  const payload: Record<string, unknown> = {
    action: 'submit',
    hash: args.hash,
    project: args.project,
    middle: args.middle,
    participantNumber: args.participantNumber,
    final: args.final,
    rows: bundle.rows,
    events: args.events,
    parameters: bundle.parameters,
    csv: bundle.csv,
    eventsCsv: bundle.eventsCsv,
  };
  if (xlsxBase64.length < 1_500_000) payload.xlsxBase64 = xlsxBase64;
  try {
    const result = await postScript(args.scriptUrl, payload);
    if (result.ok === true) return { ok: true, detail: 'Lagret i Google Drive.' };
    return { ok: false, detail: String(result.error ?? 'Opplasting feilet.') };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'Opplasting feilet.' };
  }
}
