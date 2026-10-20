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

export const CODE_TTL_MS = 24 * 60 * 60 * 1000;

export function expiryFrom(nowMs: number): string {
  return new Date(nowMs + CODE_TTL_MS).toISOString();
}

export function isExpired(expiresAtIso: string, nowMs: number): boolean {
  const t = Date.parse(expiresAtIso);
  return Number.isNaN(t) || t <= nowMs;
}
