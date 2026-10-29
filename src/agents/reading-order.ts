import type { Corner } from '../types';
import { CORNERS } from '../types';

export interface ReadingSlot {
  position: number;
  corner: Corner;
  stimulus: string;
}

/**
 * Positions 1–n follow reading order across the corners that are in use:
 * øv → øh → nv → nh. Empty corners are skipped. With 3 classes, n is 3.
 */
export function comparisonsInReadingOrder(options: { stimulus: string; corner: Corner }[]): ReadingSlot[] {
  const byCorner = new Map(options.map((option) => [option.corner, option.stimulus]));
  const slots: ReadingSlot[] = [];
  for (const corner of CORNERS) {
    const stimulus = byCorner.get(corner);
    if (!stimulus) continue;
    slots.push({ position: slots.length + 1, corner, stimulus });
  }
  return slots;
}

export function resolveChoice(
  slots: ReadingSlot[],
  position: number,
  corner?: string,
): { ok: true; slot: ReadingSlot } | { ok: false; message: string } {
  if (!Number.isInteger(position) || position < 1 || position > slots.length) {
    return { ok: false, message: `position må være 1–${slots.length}` };
  }
  const slot = slots[position - 1];
  if (!slot) return { ok: false, message: `position må være 1–${slots.length}` };
  if (corner !== undefined && corner !== '' && corner !== slot.corner) {
    return { ok: false, message: 'corner stemmer ikke med position' };
  }
  return { ok: true, slot };
}
