/**
 * Built-in abstract black-on-white symbols.
 * They are asymmetric filled shapes, screened so they do not depict letters,
 * digits, arrows, stars, hearts or other familiar signs. Jon can exclude any
 * of them from the preview page after looking at them.
 */

export interface SymbolSpec {
  id: string;
  /** Inner SVG markup, viewBox 0 0 100 100, black fill. */
  body: string;
}

function poly(points: number[][]): string {
  return `<polygon points="${points.map((p) => `${p[0]},${p[1]}`).join(' ')}"/>`;
}

function path(d: string): string {
  return `<path d="${d}"/>`;
}

/**
 * 32 hand-built shapes. Coordinates are chosen to be irregular and unlike
 * the Latin alphabet, digits and common icons.
 */
export const SYMBOLS: SymbolSpec[] = [
  { id: 's01', body: poly([[8, 62], [22, 18], [46, 28], [38, 8], [70, 24], [58, 48], [88, 40], [78, 72], [52, 60], [60, 90], [30, 74], [24, 92]]) },
  { id: 's02', body: path('M14 78 C18 20 40 8 48 36 C62 8 90 22 84 48 C96 70 70 92 48 74 C40 96 12 90 14 78 Z') },
  { id: 's03', body: poly([[12, 30], [44, 14], [36, 42], [70, 18], [92, 46], [64, 50], [86, 78], [50, 66], [58, 92], [28, 70], [18, 88], [10, 54]]) },
  { id: 's04', body: path('M20 20 L48 16 L44 40 L78 22 L90 46 L62 54 L84 84 L46 70 L52 94 L22 78 L30 52 L8 48 Z') },
  { id: 's05', body: path('M16 64 C8 28 36 6 42 34 C48 10 86 14 80 42 C98 48 86 86 58 72 C62 98 16 96 16 64 Z') },
  { id: 's06', body: poly([[18, 22], [34, 22], [28, 48], [52, 30], [48, 54], [74, 36], [70, 58], [92, 52], [76, 74], [54, 66], [58, 90], [32, 78], [22, 94], [14, 60]]) },
  { id: 's07', body: path('M30 12 L54 18 L40 36 L72 14 L88 38 L60 46 L92 62 L66 70 L78 92 L42 74 L48 96 L18 70 L26 48 L8 40 Z') },
  { id: 's08', body: path('M12 44 C20 12 48 20 44 40 C70 8 96 36 78 52 C98 78 64 96 46 74 C40 98 8 86 12 44 Z') },
  { id: 's09', body: poly([[10, 48], [28, 16], [36, 40], [58, 12], [52, 38], [82, 22], [68, 48], [94, 58], [70, 64], [88, 88], [56, 72], [48, 94], [30, 68], [16, 86]]) },
  { id: 's10', body: path('M22 86 L18 40 L40 28 L34 8 L58 30 L80 14 L74 40 L94 36 L82 62 L94 84 L62 70 L66 92 L40 74 Z') },
  { id: 's11', body: path('M8 58 L26 22 L48 40 L44 12 L72 28 L64 50 L90 42 L78 70 L92 88 L60 76 L54 94 L28 72 L32 90 L10 78 Z') },
  { id: 's12', body: path('M24 16 C48 4 52 28 36 34 C70 16 94 40 76 54 C98 66 80 96 52 78 C58 98 16 92 20 64 C6 60 8 28 24 16 Z') },
  { id: 's13', body: poly([[16, 36], [42, 8], [34, 40], [62, 20], [54, 46], [86, 28], [74, 56], [96, 70], [68, 66], [80, 92], [48, 74], [40, 96], [22, 70], [8, 78]]) },
  { id: 's14', body: path('M14 24 L46 20 L38 44 L70 26 L62 50 L90 44 L72 66 L88 90 L50 72 L56 94 L24 76 L32 54 L8 50 Z') },
  { id: 's15', body: path('M18 70 C6 36 28 8 46 30 C44 8 78 6 74 34 C98 28 96 64 74 60 C92 90 48 98 40 72 C28 96 8 90 18 70 Z') },
  { id: 's16', body: poly([[20, 14], [36, 28], [32, 8], [54, 26], [48, 8], [70, 30], [86, 16], [78, 42], [96, 48], [74, 58], [90, 80], [60, 70], [66, 94], [40, 76], [28, 94], [18, 68], [6, 72], [12, 46]]) },
  { id: 's17', body: path('M28 10 L46 24 L40 6 L64 28 L58 12 L86 36 L70 48 L94 58 L72 66 L86 88 L54 74 L60 96 L34 78 L26 96 L12 68 L22 50 L6 42 Z') },
  { id: 's18', body: path('M16 50 C10 18 40 14 38 36 C52 8 88 16 78 42 C100 50 84 82 58 68 C64 96 20 94 22 66 C4 72 4 58 16 50 Z') },
  { id: 's19', body: poly([[12, 28], [30, 12], [26, 36], [48, 16], [44, 40], [68, 22], [60, 46], [90, 34], [76, 58], [94, 76], [64, 68], [72, 94], [44, 76], [36, 94], [18, 70], [8, 82]]) },
  { id: 's20', body: path('M10 40 L34 18 L28 42 L56 14 L50 46 L82 24 L70 52 L96 60 L74 70 L88 92 L52 74 L46 94 L22 72 L30 96 L8 74 L16 56 Z') },
  { id: 's21', body: path('M26 18 C8 30 14 58 32 52 C14 66 22 96 48 80 C46 100 82 96 74 72 C98 84 100 48 76 46 C96 24 70 6 54 28 C48 8 32 6 26 18 Z') },
  { id: 's22', body: poly([[8, 66], [24, 34], [20, 12], [42, 30], [48, 10], [58, 36], [80, 16], [72, 44], [94, 40], [80, 62], [94, 84], [62, 72], [68, 94], [40, 76], [32, 94], [22, 70]]) },
  { id: 's23', body: path('M18 22 L40 14 L36 38 L64 16 L58 42 L88 28 L76 52 L96 66 L70 64 L82 90 L48 72 L54 94 L26 78 L34 56 L8 52 L14 36 Z') },
  { id: 's24', body: path('M22 80 C8 48 24 16 42 38 C40 10 74 12 70 40 C96 22 100 62 76 58 C94 92 50 100 42 74 C24 98 12 92 22 80 Z') },
  { id: 's25', body: poly([[14, 18], [28, 34], [22, 8], [46, 28], [40, 6], [62, 32], [78, 12], [72, 40], [96, 36], [78, 56], [92, 74], [64, 66], [70, 92], [42, 74], [36, 94], [16, 72], [8, 48]]) },
  { id: 's26', body: path('M12 52 L30 20 L26 44 L50 18 L46 46 L74 22 L66 50 L94 44 L80 68 L92 90 L58 74 L62 94 L34 76 L28 94 L10 72 Z') },
  { id: 's27', body: path('M30 8 C52 14 46 36 28 32 C48 40 44 64 24 56 C40 70 36 96 58 82 C62 100 92 88 80 64 C100 60 92 28 70 36 C86 14 58 2 30 8 Z') },
  { id: 's28', body: poly([[6, 42], [26, 26], [18, 10], [40, 24], [36, 6], [56, 28], [72, 10], [66, 36], [92, 24], [80, 48], [96, 62], [74, 60], [86, 86], [58, 70], [64, 94], [38, 76], [30, 94], [16, 70], [10, 84]]) },
  { id: 's29', body: path('M16 28 L38 12 L34 36 L60 18 L52 44 L84 26 L74 50 L96 56 L78 70 L90 92 L56 76 L62 94 L32 78 L24 94 L8 70 L18 52 L6 44 Z') },
  { id: 's30', body: path('M20 16 C6 40 18 46 34 40 C16 58 12 88 40 74 C36 98 72 100 68 74 C96 90 100 52 76 50 C98 28 74 6 52 26 C46 6 28 4 20 16 Z') },
  { id: 's31', body: poly([[10, 24], [32, 16], [24, 40], [46, 22], [40, 48], [66, 26], [58, 52], [88, 36], [72, 60], [94, 74], [66, 70], [76, 94], [46, 76], [38, 94], [20, 68], [8, 80], [14, 50]]) },
  { id: 's32', body: path('M18 60 C4 24 32 4 40 32 C54 6 92 18 78 44 C102 52 86 94 54 76 C48 100 10 92 18 60 Z') },
];

export function symbolById(id: string): SymbolSpec | undefined {
  return SYMBOLS.find((symbol) => symbol.id === id);
}

export function symbolSvg(id: string): string {
  const symbol = symbolById(id);
  const body = symbol?.body ?? SYMBOLS[0]?.body ?? '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="#000">${body}</svg>`;
}

export function stimulusSvg(stimulus: string, assignment: Record<string, string>, custom: Record<string, string>): string {
  const customUrl = custom[stimulus];
  if (customUrl) {
    return `<img alt="" src="${escapeAttr(customUrl)}" />`;
  }
  const symbolId = assignment[stimulus] ?? 's01';
  return symbolSvg(symbolId);
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
