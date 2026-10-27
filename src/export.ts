import * as XLSX from 'xlsx';
import { agentParameterColumns, type AgentExportData } from './agents/meta';
import type { EventRecord, ExperimentConfig, ParameterRow, TrialRecord } from './types';

/** Column order for the Data sheet and the CSV copy. `par_` columns follow these. */
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
] as const;

export const EVENT_FIELDS = ['tidspunkt_ms', 'hendelse', 'varighet_ms', 'fase', 'blokk', 'forsøk_nr'] as const;

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
    par_stimulussett: config.stimulusSet,
    par_bildemedlem: config.pictureMember === null ? '' : config.pictureMember,
  };
}

export function trialRow(record: TrialRecord, config: ExperimentConfig): Record<string, string | number> {
  const row: Record<string, string | number> = {};
  for (const field of TRIAL_FIELDS) row[field] = record[field];
  Object.assign(row, parameterColumns(config));
  return row;
}

export function parameterSheet(config: ExperimentConfig): ParameterRow[] {
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
    parameter: 'symboltilordning',
    verdi: JSON.stringify(config.symbolAssignment),
  });
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
  agent: AgentExportData | null = null,
): ExportBundle {
  const data = trials.map((trial) => annotateAgent(trialRow(trial, config), trial, agent));
  const parameters = parameterSheet(config);
  if (agent) {
    for (const [parameter, verdi] of Object.entries(agentParameterColumns(agent))) {
      parameters.push({ parameter, verdi: String(verdi) });
    }
    parameters.push({ parameter: 'par_agent_parametre', verdi: JSON.stringify(agent.parameters) });
  }
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
  if (agent) {
    summary.push({ maal: 'agenttype', verdi: agent.agentType });
    summary.push({ maal: 'avslutning', verdi: agent.endReason });
    summary.push({ maal: 'seed', verdi: agent.seed });
    summary.push({ maal: 'mappe', verdi: agent.folder });
  }
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(summary), 'Oppsummering');
  if (agent) {
    const agentRows = agent.traces.map((trace) => ({
      forsøk_nr: trace.forsøk_nr,
      agent_valg_posisjon: trace.position ?? '',
      agent_latens_ms: trace.latencyMs,
      agent_ugyldig: trace.invalid,
      agent_forsok_nr: trace.attempts,
      trial_request: JSON.stringify(trace.request),
      trial_response: trace.response ? JSON.stringify(trace.response) : '',
    }));
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.json_to_sheet(agentRows.length > 0 ? agentRows : [{ forsøk_nr: '' }]),
      'Agent',
    );
  }
  const xlsx = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const rows = data.length > 0 ? data : [emptyDataRow(config)];
  return {
    filenameBase: String(participantNumber),
    xlsx: new Uint8Array(xlsx),
    csv: toCsv(rows),
    eventsCsv: toCsv(eventRows),
    parameters,
    rows,
  };
}

const AGENT_TRIAL_FIELDS = ['agent_valg_posisjon', 'agent_latens_ms', 'agent_ugyldig', 'agent_forsok_nr'] as const;

function annotateAgent(
  row: Record<string, string | number>,
  trial: TrialRecord,
  agent: AgentExportData | null,
): Record<string, string | number> {
  if (!agent) return row;
  const trace = agent.traces.find((item) => item.forsøk_nr === trial.forsøk_nr);
  row.agent_valg_posisjon = trace?.position ?? '';
  row.agent_latens_ms = trace?.latencyMs ?? '';
  row.agent_ugyldig = trace?.invalid ?? '';
  row.agent_forsok_nr = trace?.attempts ?? '';
  Object.assign(row, agentParameterColumns(agent));
  return row;
}

export { AGENT_TRIAL_FIELDS };

function emptyDataRow(config: ExperimentConfig): Record<string, string | number> {
  const row: Record<string, string | number> = {};
  for (const field of TRIAL_FIELDS) row[field] = '';
  Object.assign(row, parameterColumns(config));
  return row;
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
  return rows;
}

export function placementsToCell(placements: { stimulus: string; corner: string }[], empty: string | null): string {
  const parts = placements.map((item) => `${item.stimulus}@${item.corner}`);
  if (empty) parts.push(`tom@${empty}`);
  return parts.join('|');
}
