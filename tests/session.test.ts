import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config';
import { feedbackCount } from '../src/criteria';
import { mulberry32 } from '../src/rng';
import { Session } from '../src/session';
import type { ExperimentConfig } from '../src/types';

function tinyConfig(over: Partial<ExperimentConfig> = {}): ExperimentConfig {
  const config = defaultConfig();
  config.trialMultiplier = 1;
  config.thinning = [100];
  config.feedbackDurationMs = 0;
  config.itiSeconds = 0;
  config.correction = false;
  config.sampleClicks = 1;
  config.mtsType = 'simultaneous';
  return { ...config, ...over };
}

function choose(session: Session, correct: boolean): void {
  if (session.screen.type === 'iti' || session.screen.type === 'feedback' || session.screen.type === 'delay') {
    session.completeWait();
  }
  if (session.screen.type === 'sample') session.clickSample();
  if (session.screen.type !== 'choice') {
    throw new Error(`Forventet valg, fikk ${session.screen.type}`);
  }
  const placements = session.screen.options;
  // Recover the programmed correct stimulus from the only option that the session
  // will mark correct. We store it on the upcoming record by reading relation.
  const target = correctStimulus(session);
  const option = placements.find((item) => (correct ? item.stimulus === target : item.stimulus !== target));
  if (!option) throw new Error('Fant ikke svaralternativ');
  session.clickComparison(option.stimulus, option.corner);
}

function correctStimulus(session: Session): string {
  const persisted = session.serialize(0);
  const trial = persisted.queue[persisted.cursor];
  if (!trial) throw new Error('Intet aktivt forsøk');
  return trial.correct;
}

function runBlock(session: Session, correctPattern: boolean[]): void {
  for (const correct of correctPattern) {
    if (session.finished) return;
    choose(session, correct);
  }
}

describe('session', () => {
  it('passes a block when every programmed trial is correct and then runs the test', () => {
    const config = tinyConfig();
    let clock = Date.parse('2026-10-20T08:00:00.000Z');
    const session = new Session(config, 10427, mulberry32(4), () => clock);
    session.start();
    runBlock(session, Array.from({ length: 6 }, () => true));
    expect(session.finished).toBe(false);
    expect(session.trials.filter((trial) => trial.fase === 'trening')).toHaveLength(6);
    expect(session.trials.every((trial) => trial.tilbakemelding_gitt === 1)).toBe(true);
    const words = new Set(session.trials.map((trial) => trial.tilbakemeldingsord));
    for (const word of words) expect(['Riktig', 'Bra', 'Supert', 'Korrekt']).toContain(word);

    const testTrials = () => session.trials.filter((trial) => trial.fase === 'test');
    let guard = 0;
    while (!session.finished && guard < 80) {
      choose(session, true);
      clock += 50;
      guard += 1;
    }
    expect(session.finished).toBe(true);
    expect(testTrials().length).toBeGreaterThan(0);
    expect(testTrials().every((trial) => trial.tilbakemelding_gitt === 0)).toBe(true);
    expect(session.screen.type).toBe('done');
  });

  it('repeats the training block with a new draw when mastery is missed', () => {
    const config = tinyConfig({ correction: false });
    let clock = Date.parse('2026-10-20T08:00:00.000Z');
    const session = new Session(config, 10428, mulberry32(8), () => clock);
    session.start();
    runBlock(session, [false, true, true, true, true, true]);
    expect(session.finished).toBe(false);
    const first = session.trials.filter((trial) => trial.blokk_gjentakelse === 1 && trial.fase === 'trening');
    expect(first).toHaveLength(6);
    expect(first.filter((trial) => trial.riktig === 1)).toHaveLength(5);
    runBlock(session, Array.from({ length: 6 }, () => true));
    const second = session.trials.filter((trial) => trial.blokk_gjentakelse === 2 && trial.fase === 'trening');
    expect(second).toHaveLength(6);
    expect(second.every((trial) => trial.riktig === 1)).toBe(true);
    expect(second[0]?.blokk).not.toBe(first[0]?.blokk);
  });

  it('inserts a correction trial and still counts the original error', () => {
    const config = tinyConfig({
      correction: true,
      masteryNumerator: 5,
      masteryDenominator: 6,
    });
    let clock = Date.parse('2026-10-20T08:00:00.000Z');
    const session = new Session(config, 10429, mulberry32(2), () => clock);
    session.start();
    choose(session, false);
    expect(session.trials.at(-1)?.korreksjonsforsøk).toBe(0);
    expect(session.trials.at(-1)?.riktig).toBe(0);
    choose(session, true);
    expect(session.trials.at(-1)?.korreksjonsforsøk).toBe(1);
    expect(session.trials.at(-1)?.relasjon).toBe(session.trials[0]?.relasjon);
    runBlock(session, [true, true, true, true, true]);
    const programmed = session.trials.filter((trial) => trial.fase === 'trening' && trial.korreksjonsforsøk === 0);
    expect(programmed).toHaveLength(6);
    expect(programmed.filter((trial) => trial.riktig === 1)).toHaveLength(5);
    expect(session.trials.some((trial) => trial.fase === 'test' || session.screen.type === 'sample' || session.screen.type === 'choice')).toBe(true);
  });

  it('gives positive feedback on the scheduled share of a thinned block', () => {
    const config = tinyConfig({ thinning: [50], correction: false, masteryNumerator: 1, masteryDenominator: 6 });
    const session = new Session(config, 10430, mulberry32(5), () => Date.parse('2026-10-20T08:00:00.000Z'));
    session.start();
    runBlock(session, Array.from({ length: 6 }, () => true));
    const training = session.trials.filter((trial) => trial.fase === 'trening');
    expect(training).toHaveLength(6);
    expect(training.filter((trial) => trial.tilbakemelding_gitt === 1)).toHaveLength(feedbackCount(6, 50));
  });

  it('logs tab hide and a close attempt', () => {
    const config = tinyConfig();
    let clock = Date.parse('2026-10-20T08:00:00.000Z');
    const session = new Session(config, 10431, mulberry32(6), () => clock);
    session.start();
    session.noteAway('hidden');
    expect(session.screen.type).toBe('pause');
    clock += 400;
    session.noteBack('visible');
    session.resume();
    session.attemptClose();
    expect(session.events.map((event) => event.hendelse)).toEqual(['hidden', 'visible', 'forsøk_på_lukking']);
    expect(session.events[1]?.varighet_ms).toBe(400);
  });
});
