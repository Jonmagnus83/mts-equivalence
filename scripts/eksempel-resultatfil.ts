/**
 * Writes docs/eksempel-resultatfil.xlsx from a short simulated session.
 * The participant, answers and times are synthetic. Nothing is read from old result files.
 */
import { writeFileSync } from 'node:fs';
import { defaultConfig } from '../src/config';
import { buildExport } from '../src/export';
import { mulberry32 } from '../src/rng';
import { Session } from '../src/session';
import type { Corner } from '../src/types';

const config = defaultConfig();
config.studyId = 'eksempel';
config.groupCode = 'syntetisk';
config.trialMultiplier = 1;
config.testMultiplier = 1;
config.thinning = [100];
config.serialIntroduction = true;
config.mtsType = 'delayed';
config.delaySeconds = 2;
config.feedbackDurationMs = 800;
config.itiSeconds = 0.4;
config.correction = false;
config.sampleClicks = 1;
config.masteryNumerator = 17;
config.masteryDenominator = 18;
config.exportProfile = 'standard';

let clock = Date.parse('2026-11-12T09:00:00.000Z');
const session = new Session(config, 90001, mulberry32(12), () => clock);

function flushWaits(): void {
  for (let step = 0; step < 4; step++) {
    const wait = session.pendingWaitMs();
    if (wait === null) return;
    clock += wait;
    session.completeWait();
  }
}

function answer(correct: boolean): void {
  if (session.finished) return;
  flushWaits();
  if (session.screen.type === 'sample') {
    clock += 380;
    session.clickSample();
    flushWaits();
  }
  if (session.screen.type !== 'choice') {
    throw new Error(`Forventet valg, fikk ${session.screen.type}`);
  }
  const saved = session.serialize(0);
  const trial = saved.queue[saved.cursor];
  if (!trial) throw new Error('Intet forsøk');
  const option = session.screen.options.find((item) =>
    correct ? item.stimulus === trial.correct : item.stimulus !== trial.correct,
  );
  if (!option) throw new Error('Fant ikke svaralternativ');
  clock += 720;
  session.clickComparison(option.stimulus, option.corner as Corner);
  flushWaits();
}

session.start();
const pattern = [
  false, true, true,
  true, true, true,
  true, true, true,
  true, true, true, true, true, true,
  true, false, true, true, true, true, true, true, true, true, true, true, true,
];
pattern.forEach((correct, index) => {
  answer(correct);
  if (index === 0) {
    session.noteAway('hidden');
    clock += 1_500;
    session.noteBack('visible');
    session.resume();
  }
});
if (!session.finished) throw new Error('Den syntetiske økten ble ikke ferdig');

const bundle = buildExport(90001, config, session.trials, session.events);
writeFileSync(new URL('../docs/eksempel-resultatfil.xlsx', import.meta.url), bundle.xlsx);
console.log(`${bundle.filenameBase} trials=${session.trials.length} bytes=${bundle.xlsx.length}`);
