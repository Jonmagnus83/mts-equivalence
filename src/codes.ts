import { randomInt } from './rng';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatCode(normalized: string): string {
  const clean = normalizeCode(normalized);
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

export function generateCode(rng: () => number, length = 8): string {
  let raw = '';
  for (let i = 0; i < length; i++) raw += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return formatCode(raw);
}

/** At least five digits. 10000–99999. */
export function generateParticipantNumber(rng: () => number, used: Set<number> = new Set()): number {
  for (let i = 0; i < 100; i++) {
    const n = randomInt(rng, 10000, 99999);
    if (!used.has(n)) return n;
  }
  return randomInt(rng, 100000, 999999);
}

export async function hashCode(code: string): Promise<string> {
  const normalized = normalizeCode(code);
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A code lasts 6 hours from the first time it is opened, not from when it was created. */
export const CODE_TTL_MS = 6 * 60 * 60 * 1000;

export const EXPIRED_CODE_MESSAGE =
  'Denne koden er ikke lenger gyldig. Den virket i seks timer fra første gang den ble åpnet. Be eksperimentatoren om en ny lenke.';

export function expiryFrom(nowMs: number): string {
  return new Date(nowMs + CODE_TTL_MS).toISOString();
}

export function isExpired(expiresAtIso: string, nowMs: number): boolean {
  if (!expiresAtIso) return false;
  const t = Date.parse(expiresAtIso);
  return Number.isNaN(t) || t <= nowMs;
}

/** Published site. Participant links always use this host so they work on any computer. */
export const PUBLIC_SITE = 'https://jonmagnus83.github.io/mts-equivalence/';

export function participantLink(code: string): string {
  const formatted = formatCode(code);
  return `${PUBLIC_SITE}#/delta?k=${encodeURIComponent(formatted)}`;
}

/** Reads `#/delta?k=`, `?k=`, the older `#/kode/`, and `?kode=`. */
export function parseParticipantCode(hash: string, search = ''): string {
  const queryIndex = hash.indexOf('?');
  if (queryIndex >= 0) {
    const fromHash = new URLSearchParams(hash.slice(queryIndex + 1)).get('k');
    if (fromHash) return normalizeCode(fromHash);
  }
  const fromSearch = new URLSearchParams(search).get('k') ?? new URLSearchParams(search).get('kode');
  if (fromSearch) return normalizeCode(fromSearch);
  const older = hash.match(/#\/kode\/([A-Za-z0-9-]+)/);
  return older?.[1] ? normalizeCode(older[1]) : '';
}
