import * as XLSX from 'xlsx';
import { exportProfileOf, feedbackShownMs } from './config';
import { protocolScript, trainingSequence } from './trials';
import type { EventRecord, ExperimentConfig, ExportProfile, ParameterRow, TrialRecord } from './types';

/**
 * Column order for the Data sheet and the CSV copy. `par_` columns follow these.
 * New columns are appended so existing names keep their order.
 */
export const TRIAL_FIELDS = [
  'deltakernr',
  'studie_id',
  'oppsett_versjon',
  'økt_start_utc',
  'fase',
  'blokk',
  'blokk_gjentakelse',
  'nedtrapping_prosent',
  'blokkforsøk_nr',
  'forsøk_nr',
  'relasjon',
  'relasjonstype',
  'utvalg',
  'sammenligninger_og_posisjoner',
  'riktig_stimulus',
  'valgt_stimulus',
  'valgt_posisjon',
  'riktig',
  'tilbakemelding_gitt',
  'tilbakemeldingsord',
  'klikk_på_utvalg',
  'rt_utvalg_ms',
  'rt_sammenligning_ms',
  'iti_ms',
  'forsinkelse_ms',
  'tomt_hjørne',
  's_pluss_hjørne',
  'korreksjonsforsøk',
  'fanebytter_hittil',
  'utvalg_presentasjon_ms',
  'utvalg_av_ms',
  'start_ms',
  'svar_ms',
] as const;

/**
 * English headers for the opt-in `gamle_navn` profile.
 * Units sit in the name (`_ms`). Relation-type values are not translated.
 */
export const ENGLISH_TRIAL_HEADERS = {
  deltakernr: 'Participant',
  studie_id: 'Study_ID',
  oppsett_versjon: 'Version',
  økt_start_utc: 'Session_start_utc',
  fase: 'Training/Test',
  blokk: 'Block',
  blokk_gjentakelse: 'Block_repetition',
  nedtrapping_prosent: 'Consequence probability',
  blokkforsøk_nr: 'Trial_in_block',
  forsøk_nr: 'Trial',
  relasjon: 'Relation',
  relasjonstype: 'Relational type',
  utvalg: 'Sample',
  sammenligninger_og_posisjoner: 'Comparisons_and_positions',
  riktig_stimulus: 'Comparison',
  valgt_stimulus: 'Selected',
  valgt_posisjon: 'Selected_position',
  riktig: 'Correct/Incorrect',
  tilbakemelding_gitt: 'Feedback_given',
  tilbakemeldingsord: 'Programmed consequence',
  klikk_på_utvalg: 'Observing_responses',
  rt_utvalg_ms: 'RT_sample_ms',
  rt_sammenligning_ms: 'RT_comparison_ms',
  iti_ms: 'ITI_ms',
  forsinkelse_ms: 'Delay_comparison_ms',
  tomt_hjørne: 'Empty_corner',
  s_pluss_hjørne: 'S_plus_corner',
  korreksjonsforsøk: 'Repeat',
  fanebytter_hittil: 'Tab_switches',
  utvalg_presentasjon_ms: 'Sample_presentation_ms',
  utvalg_av_ms: 'Sample_off_ms',
  start_ms: 'Trial_start_ms',
  svar_ms: 'Response_timestamp_ms',
} as const satisfies Record<(typeof TRIAL_FIELDS)[number], string>;

/** Position 1–4 are the four corners. Position 5–8 stay empty. */
export const POSITION_COLUMNS = [
  'Position 1',
  'Position 2',
  'Position 3',
  'Position 4',
  'Position 5',
  'Position 6',
  'Position 7',
  'Position 8',
] as const;

/** øv/øh = upper left/right, nv/nh = lower left/right. */
export const CORNER_POSITION: Record<string, 1 | 2 | 3 | 4> = {
  øv: 1,
  øh: 2,
  nv: 3,
  nh: 4,
};

export const EVENT_FIELDS = ['tidspunkt_ms', 'hendelse', 'varighet_ms', 'fase', 'blokk', 'forsøk_nr'] as const;

/** Every config field has a row on Parametere. Image bytes are listed by stimulus id only. */
export const CONFIG_PARAMETER_KEYS = {
  version: 'par_versjon',
  studyId: 'par_studie_id',
  groupCode: 'par_gruppekode',
  language: 'par_sprak',
  instructionNo: 'instruksjon_no',
  instructionEn: 'instruksjon_en',
  classes: 'par_klasser',
  members: 'par_medlemmer',
  structure: 'par_struktur',
  trialMultiplier: 'par_trial_multiplikator',
  masteryNumerator: 'par_mestring_teller',
  masteryDenominator: 'par_mestring_nevner',
  thinning: 'par_nedtrapping',
  feedbackWordsNo: 'tilbakemeldingsord',
  feedbackWordsEn: 'tilbakemeldingsord_en',
  feedbackDurationMs: 'par_tilbakemelding_ms',
  wrongFeedback: 'par_feil_svar',
  correction: 'par_korreksjon',
  correctionMaxRepeats: 'par_korreksjon_maks',
  mtsType: 'par_mts_type',
  delaySeconds: 'par_forsinkelse_s',
  itiSeconds: 'par_iti_s',
  sampleClicks: 'par_klikk_utvalg',
  inactivityMinutes: 'par_inaktivitet_min',
  positionBalance: 'par_posisjon',
  maxConsecutiveSPlus: 'par_maks_splus_rad',
  testSymmetry: 'par_test_symmetri',
  testTransitivity: 'par_test_transitivitet',
  testEquivalence: 'par_test_ekvivalens',
  testBaseline: 'par_test_baseline',
  testReflexivity: 'par_test_refleksivitet',
  reflexivityAsPretest: 'par_refleksivitet_forhandstest',
  testMultiplier: 'par_test_multiplikator',
  serialIntroduction: 'par_gradvis_innforing',
  stimulusMode: 'par_stimulusmodus',
  pictureMember: 'par_bildemedlem',
  symbolAssignment: 'symboltilordning',
  customStimuli: 'tilpassede_stimuli',
  excludedSymbols: 'utelatte_symboler',
  exportProfile: 'par_eksportprofil',
} as const satisfies Record<keyof ExperimentConfig, string>;

export function resultFilenameBase(participantNumber: number, config: ExperimentConfig): string {
  const id = String(participantNumber);
  if (config.mtsType === 'delayed') return `DMTS_${config.delaySeconds}_${id}`;
  return `SMTS_0_${id}`;
}

export function parameterColumns(config: ExperimentConfig): Record<string, string | number> {
  return {
    par_studie_id: config.studyId,
    par_gruppekode: config.groupCode,
    par_versjon: config.version,
    par_sprak: config.language,
    par_struktur: config.structure,
    par_klasser: config.classes,
    par_medlemmer: config.members,
    par_trial_multiplikator: config.trialMultiplier,
    par_mestring_teller: config.masteryNumerator,
    par_mestring_nevner: config.masteryDenominator,
    par_nedtrapping: config.thinning.join('/'),
    par_tilbakemelding_ms: config.feedbackDurationMs,
    par_feil_svar: config.wrongFeedback,
    par_korreksjon: config.correction ? 1 : 0,
    par_korreksjon_maks: config.correctionMaxRepeats,
    par_mts_type: config.mtsType,
    par_forsinkelse_s: config.delaySeconds,
    par_iti_s: config.itiSeconds,
    par_klikk_utvalg: config.sampleClicks,
    par_inaktivitet_min: config.inactivityMinutes,
    par_posisjon: config.positionBalance,
    par_maks_splus_rad: config.maxConsecutiveSPlus,
    par_test_symmetri: config.testSymmetry ? 1 : 0,
    par_test_transitivitet: config.testTransitivity ? 1 : 0,
    par_test_ekvivalens: config.testEquivalence ? 1 : 0,
    par_test_baseline: config.testBaseline ? 1 : 0,
    par_test_refleksivitet: config.testReflexivity ? 1 : 0,
    par_refleksivitet_forhandstest: config.reflexivityAsPretest ? 1 : 0,
    par_test_multiplikator: config.testMultiplier,
    par_gradvis_innforing: config.serialIntroduction ? 1 : 0,
    par_stimulusmodus: config.stimulusMode,
    par_bildemedlem: config.pictureMember === null ? '' : config.pictureMember,
    par_mestring: `${config.masteryNumerator}/${config.masteryDenominator}`,
    par_eksportprofil: exportProfileOf(config.exportProfile),
  };
}

export function positionColumns(packed: string): Record<(typeof POSITION_COLUMNS)[number], string> {
  const columns = {
    'Position 1': '',
    'Position 2': '',
    'Position 3': '',
    'Position 4': '',
    'Position 5': '',
    'Position 6': '',
    'Position 7': '',
    'Position 8': '',
  };
  if (!packed) return columns;
  for (const part of packed.split('|')) {
    if (!part || part.startsWith('tom@')) continue;
    const at = part.lastIndexOf('@');
    if (at <= 0) continue;
    const stimulus = part.slice(0, at);
    const corner = part.slice(at + 1);
    const index = CORNER_POSITION[corner];
    if (!stimulus || !index) continue;
    columns[`Position ${index}`] = stimulus;
  }
  return columns;
}

function headerFor(field: (typeof TRIAL_FIELDS)[number], profile: ExportProfile): string {
  return profile === 'gamle_navn' ? ENGLISH_TRIAL_HEADERS[field] : field;
}

function cellValue(value: string | number | undefined | null): string | number {
  if (value === undefined || value === null) return '';
  return value;
}

export function trialRow(record: TrialRecord, config: ExperimentConfig): Record<string, string | number> {
  const profile = exportProfileOf(config.exportProfile);
  const row: Record<string, string | number> = {};
  for (const field of TRIAL_FIELDS) row[headerFor(field, profile)] = cellValue(record[field]);
  Object.assign(row, positionColumns(String(record.sammenligninger_og_posisjoner ?? '')));
  Object.assign(row, parameterColumns(config));
  return row;
}

function customStimulusIds(config: ExperimentConfig): string {
  return Object.keys(config.customStimuli).sort().join(', ');
}

export function parameterSheet(config: ExperimentConfig, participantNumber?: number): ParameterRow[] {
  const columns = parameterColumns(config);
  const rows: ParameterRow[] = Object.entries(columns).map(([parameter, verdi]) => ({
    parameter,
    verdi: String(verdi),
  }));
  rows.push({ parameter: 'instruksjon_no', verdi: config.instructionNo });
  rows.push({ parameter: 'instruksjon_en', verdi: config.instructionEn });
  rows.push({
    parameter: 'tilbakemeldingsord',
    verdi: config.feedbackWordsNo.join(', '),
  });
  rows.push({
    parameter: 'tilbakemeldingsord_en',
    verdi: config.feedbackWordsEn.join(', '),
  });
  rows.push({
    parameter: 'symboltilordning',
    verdi: JSON.stringify(config.symbolAssignment),
  });
  rows.push({
    parameter: 'utelatte_symboler',
    verdi: config.excludedSymbols.join(', '),
  });
  rows.push({
    parameter: 'tilpassede_stimuli',
    verdi: customStimulusIds(config),
  });
  rows.push({ parameter: 'treningsrekkefolge', verdi: trainingSequence(config) });
  rows.push({ parameter: 'manus', verdi: protocolScript(config) });
  if (participantNumber !== undefined) {
    rows.push({
      parameter: 'resultatfil',
      verdi: `${resultFilenameBase(participantNumber, config)}.xlsx`,
    });
  }
  return rows;
}

function csvEscape(value: string | number, separator: string): string {
  const text = String(value);
  if (text.includes('"') || text.includes('\n') || text.includes('\r') || text.includes(separator)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** UTF-8 CSV with BOM and semicolon separators so Norwegian Excel splits columns and keeps æ, ø and å. */
export function toCsv(rows: Record<string, string | number>[], separator = ';'): string {
  if (rows.length === 0) return `\uFEFF`;
  const headers = Object.keys(rows[0] ?? {});
  const lines = [headers.join(separator)];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header] ?? '', separator)).join(separator));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export interface ExportBundle {
  filenameBase: string;
  xlsx: Uint8Array;
  csv: string;
  eventsCsv: string;
  parameters: ParameterRow[];
  rows: Record<string, string | number>[];
}

export function buildExport(
  participantNumber: number,
  config: ExperimentConfig,
  trials: TrialRecord[],
  events: EventRecord[],
): ExportBundle {
  const data = trials.map((trial) => trialRow(trial, config));
  const parameters = parameterSheet(config, participantNumber);
  const eventRows = events.map((event) => {
    const row: Record<string, string | number> = {};
    for (const field of EVENT_FIELDS) row[field] = event[field];
    return row;
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(data.length > 0 ? data : [emptyDataRow(config)]), 'Data');
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(parameters), 'Parametere');
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(eventRows.length > 0 ? eventRows : [{ tidspunkt_ms: '', hendelse: '', varighet_ms: '', fase: '', blokk: '', forsøk_nr: '' }]),
    'Hendelser',
  );
  const summary = summaryRows(participantNumber, config, trials, events);
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(summary), 'Oppsummering');
  const xlsx = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const rows = data.length > 0 ? data : [emptyDataRow(config)];
  return {
    filenameBase: resultFilenameBase(participantNumber, config),
    xlsx: new Uint8Array(xlsx),
    csv: toCsv(rows),
    eventsCsv: toCsv(eventRows),
    parameters,
    rows,
  };
}

function emptyDataRow(config: ExperimentConfig): Record<string, string | number> {
  const blank = { sammenligninger_og_posisjoner: '' } as TrialRecord;
  return trialRow(blank, config);
}

function percent(correct: number, total: number): number | '' {
  if (total <= 0) return '';
  return Math.round((correct / total) * 100000) / 1000;
}

function asMs(value: number | '' | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Comparison responses per minute, from first trial onset through the last feedback and ITI. */
export function responsesPerMinute(trials: TrialRecord[], config: ExperimentConfig): number | '' {
  if (trials.length === 0) return '';
  let start = Infinity;
  let end = -Infinity;
  let last: TrialRecord | null = null;
  for (const trial of trials) {
    const started = asMs(trial.start_ms);
    const answered = asMs(trial.svar_ms);
    if (started === null || answered === null) return '';
    if (started < start) start = started;
    if (answered >= end) {
      end = answered;
      last = trial;
    }
  }
  if (!last) return '';
  const tail = feedbackShownMs(config, last.riktig === 1, last.tilbakemeldingsord) + (asMs(last.iti_ms) ?? 0);
  const minutes = (end + tail - start) / 60000;
  if (minutes <= 0) return '';
  return Math.round((trials.length / minutes) * 1000) / 1000;
}

function summaryRows(
  participantNumber: number,
  config: ExperimentConfig,
  trials: TrialRecord[],
  events: EventRecord[],
): Record<string, string | number>[] {
  const programmed = trials.filter((trial) => trial.korreksjonsforsøk === 0);
  const byType = new Map<string, { n: number; correct: number }>();
  for (const trial of programmed.filter((item) => item.fase === 'test' || item.fase === 'forhåndstest')) {
    const key = trial.relasjonstype;
    const bucket = byType.get(key) ?? { n: 0, correct: 0 };
    bucket.n += 1;
    bucket.correct += trial.riktig;
    byType.set(key, bucket);
  }
  const rows: Record<string, string | number>[] = [
    { maal: 'deltakernr', verdi: participantNumber },
    { maal: 'studie_id', verdi: config.studyId },
    { maal: 'mestringskriterium', verdi: `${config.masteryNumerator}/${config.masteryDenominator}` },
    { maal: 'antall_forsok', verdi: trials.length },
    { maal: 'antall_programmerte', verdi: programmed.length },
    { maal: 'korreksjonsforsok', verdi: trials.length - programmed.length },
    { maal: 'fanebytter', verdi: events.filter((event) => event.hendelse === 'hidden').length },
    { maal: 'fullskjerm_av', verdi: events.filter((event) => event.hendelse === 'fullskjerm_av').length },
    { maal: 'forsok_pa_lukking', verdi: events.filter((event) => event.hendelse === 'forsøk_på_lukking').length },
  ];
  for (const [kind, bucket] of byType) {
    rows.push({
      maal: `test_${kind}`,
      verdi: `${bucket.correct}/${bucket.n}`,
    });
  }
  const corners = ['øv', 'øh', 'nv', 'nh'];
  for (const corner of corners) {
    const subset = programmed.filter((trial) => trial.s_pluss_hjørne === corner);
    const correct = subset.filter((trial) => trial.riktig === 1).length;
    rows.push({
      maal: `riktig_nar_splus_${corner}`,
      verdi: subset.length === 0 ? '' : `${correct}/${subset.length}`,
    });
  }
  const blocks: { fase: string; blokk: number; trials: TrialRecord[] }[] = [];
  const seen = new Map<string, { fase: string; blokk: number; trials: TrialRecord[] }>();
  for (const trial of trials) {
    const key = `${trial.fase}:${trial.blokk}`;
    let bucket = seen.get(key);
    if (!bucket) {
      bucket = { fase: trial.fase, blokk: trial.blokk, trials: [] };
      seen.set(key, bucket);
      blocks.push(bucket);
    }
    bucket.trials.push(trial);
  }
  for (const block of blocks) {
    const prefix = `blokk_${block.blokk}_${block.fase}`;
    const programmedBlock = block.trials.filter((trial) => trial.korreksjonsforsøk === 0);
    const correct = programmedBlock.filter((trial) => trial.riktig === 1).length;
    rows.push({ maal: `${prefix}_riktige`, verdi: `${correct}/${programmedBlock.length}` });
    rows.push({ maal: `${prefix}_prosent`, verdi: percent(correct, programmedBlock.length) });
    rows.push({ maal: `${prefix}_responser_per_minutt`, verdi: responsesPerMinute(block.trials, config) });
    if (block.fase === 'trening') continue;
    const kinds = new Map<string, { n: number; correct: number }>();
    for (const trial of programmedBlock) {
      const kind = kinds.get(trial.relasjonstype) ?? { n: 0, correct: 0 };
      kind.n += 1;
      kind.correct += trial.riktig;
      kinds.set(trial.relasjonstype, kind);
    }
    for (const [kind, bucket] of kinds) {
      rows.push({ maal: `${prefix}_${kind}`, verdi: `${bucket.correct}/${bucket.n}` });
    }
  }
  return rows;
}

export function placementsToCell(placements: { stimulus: string; corner: string }[], empty: string | null): string {
  const parts = placements.map((item) => `${item.stimulus}@${item.corner}`);
  if (empty) parts.push(`tom@${empty}`);
  return parts.join('|');
}
