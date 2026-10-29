import { allStimulusIds } from './relations';
import { SQUIGGLE_STROKE, SQUIGGLES, type Squiggle } from './stimuli/squiggles';
import { stimulusSvg } from './symbols';

const byStimulus = new Map(SQUIGGLES.map((item) => [item.stimulusId, item]));

/** Fixed squiggle for a stimulus id, or null when this set does not cover that id. */
export function squiggleFor(stimulusId: string): Squiggle | null {
  return byStimulus.get(stimulusId) ?? null;
}

/**
 * The checked-in squiggles cover letters A–C and classes 1–4
 * (3 members × up to 4 classes).
 */
export function designFitsAbstractSet(classes: number, members: number): boolean {
  if (classes < 2 || members < 3) return false;
  return allStimulusIds(classes, members).every((id) => squiggleFor(id) !== null);
}

export function squiggleSvg(stimulusId: string): string {
  const squiggle = squiggleFor(stimulusId);
  const d = squiggle?.d ?? '';
  return `<svg class="squiggle" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true"><path d="${d}" fill="none" stroke="#000" stroke-width="${SQUIGGLE_STROKE}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function stimulusMarkup(
  stimulus: string,
  config: { stimulusSet?: string; symbolAssignment: Record<string, string>; customStimuli: Record<string, string> },
): string {
  if (config.stimulusSet === 'abstrakte') return squiggleSvg(stimulus);
  return stimulusSvg(stimulus, config.symbolAssignment, config.customStimuli);
}
