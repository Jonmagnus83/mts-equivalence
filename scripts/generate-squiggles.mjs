/**
 * Seeded generator for the abstract squiggle set.
 * Run: node scripts/generate-squiggles.mjs
 * Check the checked-in files: node scripts/generate-squiggles.mjs --check
 *
 * Each stimulus is one open cubic Bézier (7 anchors), black stroke
 * on white, same stroke width. Candidates that are closed, nearly symmetric,
 * self-crossing, or too close to an accepted curve under rotation, reflection
 * or reversal are discarded. A candidate is also discarded when, in any of four
 * quarter-turns, its stroke lies close to a rendered DejaVu Sans glyph
 * A–Z, a–z or 0–9 (scripts/glyph-templates.json). The output is deterministic
 * for SQUIGGLE_SEED.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SEED = 20261030;
const COUNT = 12;
const MIN_DISTANCE = 0.46;
const ANCHORS = 7;
const STROKE = 5.5;
const LETTERS = 'ABCDEFGH';
const CLASSES = 4;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const glyphPath = join(dirname(fileURLToPath(import.meta.url)), 'glyph-templates.json');
const glyphFile = JSON.parse(readFileSync(glyphPath, 'utf8'));
const GLYPH_SIZE = glyphFile.size;
function distanceGrid(mask) {
  const n = GLYPH_SIZE * GLYPH_SIZE;
  const dist = new Uint16Array(n);
  dist.fill(999);
  const queue = [];
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    dist[i] = 0;
    queue.push(i);
  }
  let head = 0;
  while (head < queue.length) {
    const index = queue[head++];
    const next = dist[index] + 1;
    const x = index % GLYPH_SIZE;
    const y = (index / GLYPH_SIZE) | 0;
    const visit = (nx, ny) => {
      if (nx < 0 || ny < 0 || nx >= GLYPH_SIZE || ny >= GLYPH_SIZE) return;
      const neighbor = ny * GLYPH_SIZE + nx;
      if (dist[neighbor] <= next) return;
      dist[neighbor] = next;
      queue.push(neighbor);
    };
    visit(x + 1, y);
    visit(x - 1, y);
    visit(x, y + 1);
    visit(x, y - 1);
  }
  return dist;
}

const GLYPHS = glyphFile.glyphs.map((glyph) => {
  const mask = new Uint8Array(GLYPH_SIZE * GLYPH_SIZE);
  for (const index of glyph.ink) mask[index] = 1;
  return { char: glyph.char, mask, count: glyph.ink.length, dist: distanceGrid(mask) };
});
/** Mean distance, in grid pixels, from the stroke to a glyph skeleton. Lower is closer. */
const GLYPH_MEAN = 2.85;
const GLYPH_RECALL = 0.4;
const tsPath = join(root, 'src/stimuli/squiggles.ts');
const dirPath = join(root, 'src/stimuli/squiggles');
const sheetPath = join(root, 'docs/krusseduller-kontaktark.svg');
const pngPath = join(root, 'docs/krusseduller-kontaktark.png');

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cubic(p0, c1, c2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1],
  ];
}

function catmull(points) {
  const n = points.length;
  const at = (i) => points[Math.min(n - 1, Math.max(0, i))];
  const segments = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1);
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = at(i + 2);
    segments.push({
      p0: p1,
      c1: [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      c2: [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      p3: p2,
    });
  }
  return segments;
}

function mapSegments(segments, fn) {
  return segments.map((seg) => ({
    p0: fn(seg.p0),
    c1: fn(seg.c1),
    c2: fn(seg.c2),
    p3: fn(seg.p3),
  }));
}

function densePoints(segments, perSegment = 10) {
  const pts = [];
  for (const seg of segments) {
    for (let i = 0; i < perSegment; i++) pts.push(cubic(seg.p0, seg.c1, seg.c2, seg.p3, i / perSegment));
  }
  const last = segments[segments.length - 1];
  pts.push(cubic(last.p0, last.c1, last.c2, last.p3, 1));
  return pts;
}

function resample(points, n) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  if (!(total > 0)) return null;
  const out = [];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const target = (total * i) / (n - 1);
    while (j < cum.length - 1 && cum[j] < target) j++;
    const span = cum[j] - cum[j - 1] || 1;
    const u = (target - cum[j - 1]) / span;
    const a = points[j - 1];
    const b = points[j];
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return { points: out, length: total };
}

function bbox(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function segmentsIntersect(a, b, c, d) {
  const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const ab = cross(a, b, c);
  const ac = cross(a, b, d);
  const cd = cross(c, d, a);
  const ce = cross(c, d, b);
  if (ab === 0 && ac === 0) return false;
  return ab * ac < 0 && cd * ce < 0;
}

function hasSelfIntersection(points) {
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 3; j < n - 1; j++) {
      if (segmentsIntersect(points[i], points[i + 1], points[j], points[j + 1])) return true;
    }
  }
  return false;
}

function gesture(points) {
  const step = 4;
  const turns = [];
  let prev = 0;
  let maxSeg = 0;
  let total = 0;
  for (let i = step; i < points.length; i += step) {
    const dx = points[i][0] - points[i - step][0];
    const dy = points[i][1] - points[i - step][1];
    const len = Math.hypot(dx, dy);
    total += len;
    if (len > maxSeg) maxSeg = len;
    const heading = Math.atan2(dy, dx);
    if (turns.length > 0 || i > step) {
      let delta = heading - prev;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      if (i > step) turns.push(delta);
    }
    prev = heading;
  }
  let changes = 0;
  for (let i = 1; i < turns.length; i++) {
    if (turns[i - 1] * turns[i] < 0 && Math.abs(turns[i]) > 0.35 && Math.abs(turns[i - 1]) > 0.35) changes += 1;
  }
  const abs = turns.reduce((sum, turn) => sum + Math.abs(turn), 0);
  const maxTurn = turns.reduce((max, turn) => Math.max(max, Math.abs(turn)), 0);
  return {
    changes,
    dominance: abs > 0 ? maxTurn / abs : 1,
    shaft: total > 0 ? maxSeg / total : 1,
  };
}

function tooCloseToSelf(points) {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 6; j < n; j++) {
      if (Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]) < 9) return true;
    }
  }
  return false;
}

function unitSamples(points) {
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p[0];
    cy += p[1];
  }
  cx /= points.length;
  cy /= points.length;
  let rms = 0;
  for (const p of points) rms += (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
  rms = Math.sqrt(rms / points.length) || 1;
  return points.map((p) => [(p[0] - cx) / rms, (p[1] - cy) / rms]);
}

function coarse(points) {
  const out = [];
  for (let i = 0; i < points.length; i += 2) out.push(points[i]);
  return out;
}

function alignedDistance(a, b) {
  let best = Infinity;
  for (let k = 0; k < 8; k++) {
    const ang = (k * Math.PI) / 4;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const x = c * b[i][0] - s * b[i][1];
      const y = s * b[i][0] + c * b[i][1];
      const dx = a[i][0] - x;
      const dy = a[i][1] - y;
      sum += dx * dx + dy * dy;
    }
    const score = Math.sqrt(sum / a.length);
    if (score < best) best = score;
  }
  return best;
}

function shapeDistance(a, b) {
  a = coarse(a);
  b = coarse(b);
  const reversed = b.slice().reverse();
  const mirrored = b.map((p) => [-p[0], p[1]]);
  const mirroredReversed = mirrored.slice().reverse();
  return Math.min(
    alignedDistance(a, b),
    alignedDistance(a, reversed),
    alignedDistance(a, mirrored),
    alignedDistance(a, mirroredReversed),
  );
}

function rotatePlaced(points, k) {
  if (k === 0) return points;
  const ang = (k * Math.PI) / 2;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return points.map((p) => [50 + c * (p[0] - 50) - s * (p[1] - 50), 50 + s * (p[0] - 50) + c * (p[1] - 50)]);
}

function centerline(points) {
  const seen = new Uint8Array(GLYPH_SIZE * GLYPH_SIZE);
  const ink = [];
  const plot = (x, y) => {
    const px = Math.round((x / 100) * (GLYPH_SIZE - 1));
    const py = Math.round((y / 100) * (GLYPH_SIZE - 1));
    if (px < 0 || py < 0 || px >= GLYPH_SIZE || py >= GLYPH_SIZE) return;
    const index = py * GLYPH_SIZE + px;
    if (seen[index]) return;
    seen[index] = 1;
    ink.push(index);
  };
  for (let i = 1; i < points.length; i++) {
    const steps = Math.max(1, Math.ceil(Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      plot(
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
      );
    }
  }
  return ink;
}

function glyphMatch(placedPoints) {
  let bestMean = Infinity;
  let bestChar = '';
  let bestRecall = 0;
  for (let k = 0; k < 4; k++) {
    const line = centerline(rotatePlaced(placedPoints, k));
    if (line.length === 0) continue;
    const lineMask = new Uint8Array(GLYPH_SIZE * GLYPH_SIZE);
    for (const index of line) lineMask[index] = 1;
    const lineDist = distanceGrid(lineMask);
    for (const glyph of GLYPHS) {
      let sum = 0;
      for (const index of line) sum += glyph.dist[index];
      const mean = sum / line.length;
      let covered = 0;
      for (let index = 0; index < glyph.mask.length; index++) {
        if (glyph.mask[index] && lineDist[index] <= 2) covered += 1;
      }
      const recall = covered / glyph.count;
      if (mean < bestMean) {
        bestMean = mean;
        bestChar = glyph.char;
        bestRecall = recall;
      }
    }
  }
  return { mean: bestMean, char: bestChar, recall: bestRecall };
}

function symmetryScore(samples) {
  samples = coarse(samples);
  const mirrors = [
    samples.map((p) => [-p[0], p[1]]),
    samples.map((p) => [p[0], -p[1]]),
    samples.map((p) => [p[1], p[0]]),
  ];
  let best = Infinity;
  for (const mirror of mirrors) best = Math.min(best, alignedDistance(samples, mirror));
  return best;
}

function propose(rng) {
  const points = [];
  let x = (rng() - 0.5) * 12;
  let y = (rng() - 0.5) * 12;
  let angle = rng() * Math.PI * 2;
  points.push([x, y]);
  let sign = rng() < 0.5 ? -1 : 1;
  for (let i = 1; i < ANCHORS; i++) {
    if (rng() < 0.55) sign = -sign;
    angle += sign * (0.55 + rng() * 1.7);
    const step = 24 + rng() * 14;
    let nx = x + Math.cos(angle) * step;
    let ny = y + Math.sin(angle) * step;
    if (nx > 46 || nx < -46) {
      angle = Math.PI - angle;
      nx = x + Math.cos(angle) * step;
    }
    if (ny > 46 || ny < -46) {
      angle = -angle;
      ny = y + Math.sin(angle) * step;
    }
    x = Math.max(-48, Math.min(48, nx));
    y = Math.max(-48, Math.min(48, ny));
    points.push([x, y]);
  }
  return points;
}

function accept(segments, accepted) {
  const dense = densePoints(segments, 12);
  const sampled = resample(dense, 28);
  if (!sampled) return null;
  const box = bbox(sampled.points);
  const longSide = Math.max(box.w, box.h);
  const shortSide = Math.min(box.w, box.h);
  if (longSide < 1 || shortSide / longSide < 0.58) return null;
  const endGap = Math.hypot(sampled.points[0][0] - sampled.points.at(-1)[0], sampled.points[0][1] - sampled.points.at(-1)[1]);
  if (endGap < longSide * 0.34) return null;
  if (sampled.length < longSide * 1.25 || sampled.length > longSide * 3.1) return null;
  if (hasSelfIntersection(sampled.points)) return null;
  const scale = 72 / longSide;
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const placed = mapSegments(segments, (p) => [50 + (p[0] - cx) * scale, 50 + (p[1] - cy) * scale]);
  const placedPts = resample(densePoints(placed, 12), 28);
  if (!placedPts) return null;
  if (hasSelfIntersection(placedPts.points) || tooCloseToSelf(placedPts.points)) return null;
  const move = gesture(placedPts.points);
  if (move.changes < 2 || move.dominance > 0.55 || move.shaft > 0.4) return null;
  const samples = unitSamples(placedPts.points);
  if (symmetryScore(samples) < 0.45) return null;
  const glyph = glyphMatch(densePoints(placed, 8));
  if (glyph.mean <= GLYPH_MEAN && glyph.recall >= GLYPH_RECALL) return null;
  for (const other of accepted) {
    if (shapeDistance(samples, other.samples) < MIN_DISTANCE) return null;
  }
  const margin = bbox(placedPts.points);
  if (margin.minX < 8 || margin.minY < 8 || margin.maxX > 92 || margin.maxY > 92) return null;
  return { segments: placed, samples, d: pathD(placed) };
}

function fmt(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function pathD(segments) {
  const p0 = segments[0].p0;
  let d = `M ${fmt(p0[0])} ${fmt(p0[1])}`;
  for (const seg of segments) {
    d += ` C ${fmt(seg.c1[0])} ${fmt(seg.c1[1])} ${fmt(seg.c2[0])} ${fmt(seg.c2[1])} ${fmt(seg.p3[0])} ${fmt(seg.p3[1])}`;
  }
  return d;
}

function stimulusIdFor(index) {
  const letter = LETTERS[Math.floor(index / CLASSES)];
  const classNo = (index % CLASSES) + 1;
  return `${letter}${classNo}`;
}

export function generateSquiggles(seed = SEED) {
  const rng = mulberry32(seed);
  const accepted = [];
  const limit = 400000;
  for (let attempt = 0; attempt < limit && accepted.length < COUNT; attempt++) {
    const raw = catmull(propose(rng));
    const hit = accept(raw, accepted);
    if (hit) accepted.push(hit);
    if (!process.argv.includes('--check') && attempt > 0 && attempt % 20000 === 0) {
      console.log(`${accepted.length} godtatt etter ${attempt} forsøk`);
    }
  }
  if (accepted.length < COUNT) {
    throw new Error(`Fant bare ${accepted.length} av ${COUNT} krusseduller.`);
  }
  return accepted.map((item, index) => ({
    id: `k${String(index + 1).padStart(2, '0')}`,
    stimulusId: stimulusIdFor(index),
    d: item.d,
  }));
}

function svgFor(d) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n  <path d="${d}" fill="none" stroke="#000" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"/>\n</svg>\n`;
}

function contactSheet(items) {
  const cols = 8;
  const cellW = 120;
  const cellH = 148;
  const width = cols * cellW;
  const height = Math.ceil(items.length / cols) * cellH;
  const cells = items.map((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = col * cellW + 10;
    const y = row * cellH + 8;
    return `<g transform="translate(${x} ${y})">
      <rect width="100" height="100" fill="#fff" stroke="#e2e2e2"/>
      <svg x="0" y="0" width="100" height="100" viewBox="0 0 100 100">
        <path d="${item.d}" fill="none" stroke="#000" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <text x="50" y="122" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#141414">${item.id} · ${item.stimulusId}</text>
    </g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n<rect width="100%" height="100%" fill="#fff"/>\n${cells.join('\n')}\n</svg>\n`;
}

function tsSource(items) {
  const rows = items
    .map((item) => `  { id: '${item.id}', stimulusId: '${item.stimulusId}', d: '${item.d}' },`)
    .join('\n');
  return `/** Generated by scripts/generate-squiggles.mjs. Do not edit by hand. Seed ${SEED}. */
export const SQUIGGLE_SEED = ${SEED};
export const SQUIGGLE_STROKE = ${STROKE};

export interface Squiggle {
  id: string;
  stimulusId: string;
  d: string;
}

export const SQUIGGLES: Squiggle[] = [
${rows}
];
`;
}

function writeAll(items) {
  mkdirSync(dirPath, { recursive: true });
  mkdirSync(dirname(sheetPath), { recursive: true });
  writeFileSync(tsPath, tsSource(items));
  const keep = new Set(items.map((item) => `${item.id}.svg`));
  for (const name of readdirSync(dirPath)) {
    if (!keep.has(name)) unlinkSync(join(dirPath, name));
  }
  for (const item of items) writeFileSync(join(dirPath, `${item.id}.svg`), svgFor(item.d));
  writeFileSync(sheetPath, contactSheet(items));
  const cols = 8;
  const sheetHeight = Math.ceil(items.length / cols) * 148;
  const chrome = spawnSync('google-chrome', [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    `--user-data-dir=/tmp/chrome-squiggle-${SEED}`,
    '--default-background-color=FFFFFFFF',
    `--screenshot=${pngPath}`,
    `--window-size=960,${sheetHeight}`,
    `file://${sheetPath}`,
  ], { encoding: 'utf8', timeout: 8000, killSignal: 'SIGKILL' });
  if (!existsSync(pngPath)) {
    throw new Error(chrome.stderr || 'Klarte ikke å lage PNG-kontaktarket.');
  }
}

function checkedPaths() {
  const text = readFileSync(tsPath, 'utf8');
  const found = [...text.matchAll(/id: '(k\d+)', stimulusId: '([A-H][1-4])', d: '([^']+)'/g)];
  return found.map((match) => ({ id: match[1], stimulusId: match[2], d: match[3] }));
}

function segmentsFromD(d) {
  const nums = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const segments = [];
  let p0 = [nums[0], nums[1]];
  for (let i = 2; i + 5 < nums.length; i += 6) {
    const p3 = [nums[i + 4], nums[i + 5]];
    segments.push({ p0, c1: [nums[i], nums[i + 1]], c2: [nums[i + 2], nums[i + 3]], p3 });
    p0 = p3;
  }
  return segments;
}

function auditStored() {
  const stored = checkedPaths();
  for (const item of stored) {
    const score = glyphMatch(densePoints(segmentsFromD(item.d), 8));
    console.log(`${item.id} ${item.stimulusId}  middel ${score.mean.toFixed(2)}  dekning ${score.recall.toFixed(2)}  «${score.char}»`);
  }
}

function check() {
  const fresh = generateSquiggles(SEED);
  const stored = checkedPaths();
  if (fresh.length !== stored.length) throw new Error('Antall krusseduller stemmer ikke.');
  for (let i = 0; i < fresh.length; i++) {
    if (fresh[i].id !== stored[i].id || fresh[i].stimulusId !== stored[i].stimulusId || fresh[i].d !== stored[i].d) {
      throw new Error(`Avvik i ${fresh[i].id}. Kjør generatoren på nytt.`);
    }
    const file = readFileSync(join(dirPath, `${fresh[i].id}.svg`), 'utf8');
    if (file !== svgFor(fresh[i].d)) throw new Error(`SVG-filen ${fresh[i].id}.svg er ikke den genererte.`);
  }
  const sheet = readFileSync(sheetPath, 'utf8');
  if (sheet !== contactSheet(fresh)) throw new Error('Kontaktarket er ikke det genererte.');
  if (!existsSync(pngPath)) throw new Error('PNG-kontaktarket mangler.');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (process.argv.includes('--audit')) {
    auditStored();
  } else if (process.argv.includes('--check')) {
    check();
    console.log(`Krussedullene stemmer med seed ${SEED}.`);
  } else {
    const items = generateSquiggles(SEED);
    writeAll(items);
    console.log(`Skrev ${items.length} krusseduller fra seed ${SEED}.`);
  }
}
