import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SQUIGGLE_SEED, SQUIGGLE_STROKE, SQUIGGLES } from '../src/stimuli/squiggles';

describe('squiggle set', () => {
  it('is a fixed open-stroke set of at least 12, regenerated from the seed', () => {
    expect(SQUIGGLES.length).toBeGreaterThanOrEqual(12);
    expect(SQUIGGLE_SEED).toBe(20261030);
    const files = readdirSync('src/stimuli/squiggles').filter((name) => name.endsWith('.svg'));
    expect(files).toHaveLength(SQUIGGLES.length);
    for (const item of SQUIGGLES) {
      expect(item.d.startsWith('M ')).toBe(true);
      expect(item.d.includes('Z')).toBe(false);
      expect(item.d.includes('C ')).toBe(true);
      const file = readFileSync(`src/stimuli/squiggles/${item.id}.svg`, 'utf8');
      expect(file).toContain(`stroke-width="${SQUIGGLE_STROKE}"`);
      expect(file).toContain('fill="none"');
      expect(file).toContain(item.d);
      expect(file).not.toMatch(/[◆▲●■◢◤△○□]/);
    }
    const ids = new Set(SQUIGGLES.map((item) => item.d));
    expect(ids.size).toBe(SQUIGGLES.length);
    execFileSync('node', ['scripts/generate-squiggles.mjs', '--check'], { encoding: 'utf8' });
    const audit = execFileSync('node', ['scripts/generate-squiggles.mjs', '--audit'], { encoding: 'utf8' });
    const rows = audit.trim().split('\n').filter((line) => line.startsWith('k'));
    expect(rows.length).toBe(SQUIGGLES.length);
    for (const line of rows) {
      const mean = Number(/middel ([0-9.]+)/.exec(line)?.[1]);
      const cover = Number(/dekning ([0-9.]+)/.exec(line)?.[1]);
      const closeToGlyph = mean <= 2.85 && cover >= 0.4;
      expect(closeToGlyph).toBe(false);
    }
  }, 60_000);
});