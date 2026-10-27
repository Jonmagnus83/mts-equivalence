import { stimulusSvg } from './symbols';

/**
 * Selectable text stimuli for agent sessions and for experiments that opt in.
 * The nine glyphs are the set Jon asked for (A1–C3). They do not replace the
 * built-in SVG shapes, and they are not the default for human sessions.
 */
export const ABSTRACT_GLYPHS: Record<string, string> = {
  A1: '◆',
  A2: '▲',
  A3: '●',
  B1: '■',
  B2: '◢',
  B3: '◤',
  C1: '△',
  C2: '○',
  C3: '□',
};

export const ABSTRACT_GLYPH_LIST = '◆ ▲ ● ■ ◢ ◤ △ ○ □';

export function abstractGlyph(id: string): string | null {
  return ABSTRACT_GLYPHS[id] ?? null;
}

/** The glyph set covers exactly the 3×2 and 3×3 designs (letters A–C, classes 1–3). */
export function designFitsAbstractSet(classes: number, members: number): boolean {
  return members === 3 && classes >= 2 && classes <= 3;
}

export function stimulusMarkup(
  stimulus: string,
  config: { stimulusSet?: string; symbolAssignment: Record<string, string>; customStimuli: Record<string, string> },
): string {
  if (config.stimulusSet === 'abstrakte') {
    const glyph = abstractGlyph(stimulus);
    if (glyph) return `<span class="glyph" role="img" aria-label="${stimulus}">${glyph}</span>`;
    return `<span class="glyph glyph-missing" role="img" aria-label="${stimulus}">${stimulus}</span>`;
  }
  return stimulusSvg(stimulus, config.symbolAssignment, config.customStimuli);
}
