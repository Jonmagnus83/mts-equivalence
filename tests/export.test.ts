import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { expiryFrom, generateCode, generateParticipantNumber, hashCode, isExpired, normalizeCode } from '../src/codes';
import { storageFolder } from '../src/folders';
import { defaultConfig } from '../src/config';
import {
  buildExport,
  CONFIG_PARAMETER_KEYS,
  ENGLISH_TRIAL_HEADERS,
  EVENT_FIELDS,
  POSITION_COLUMNS,
  TRIAL_FIELDS,
  parameterColumns,
  parameterSheet,
  responsesPerMinute,
} from '../src/export';
import { mulberry32 } from '../src/rng';
import type { EventRecord, TrialRecord } from '../src/types';

function sampleTrial(over: Partial<TrialRecord> = {}): TrialRecord {
  return {
    deltakernr: 10427,
    studie_id: 'mts',
    oppsett_versjon: 1,
    økt_start_utc: '2026-10-20T07:00:00.000Z',
    fase: 'trening',
    blokk: 1,
    blokk_gjentakelse: 1,
    nedtrapping_prosent: 100,
    blokkforsøk_nr: 1,
    forsøk_nr: 1,
    relasjon: 'A1-B1',
    relasjonstype: 'baseline',
    utvalg: 'A1',
    sammenligninger_og_posisjoner: 'B1@øv|B2@øh|B3@nv|tom@nh',
    riktig_stimulus: 'B1',
    valgt_stimulus: 'B1',
    valgt_posisjon: 'øv',
    riktig: 1,
    tilbakemelding_gitt: 1,
    tilbakemeldingsord: 'Riktig',
    klikk_på_utvalg: 1,
    rt_utvalg_ms: 320,
    rt_sammenligning_ms: 540,
    iti_ms: 100,
    forsinkelse_ms: 0,
    utvalg_presentasjon_ms: 320,
    utvalg_av_ms: 0,
    tomt_hjørne: 'nh',
    s_pluss_hjørne: 'øv',
    korreksjonsforsøk: 0,
    fanebytter_hittil: 0,
    start_ms: 0,
    svar_ms: 860,
    ...over,
  };
}

describe('export', () => {
  it('writes Data, Parametere and Hendelser, with par_ columns on every trial', () => {
    const config = defaultConfig();
    const trials = [
      sampleTrial(),
      sampleTrial({
        forsøk_nr: 2,
        blokkforsøk_nr: 2,
        riktig: 0,
        tilbakemelding_gitt: 1,
        tilbakemeldingsord: 'Feil',
        valgt_stimulus: 'B2',
        valgt_posisjon: 'øh',
        korreksjonsforsøk: 0,
        relasjon: 'B2-C2',
        utvalg: 'B2',
        riktig_stimulus: 'C2',
      }),
    ];
    const events: EventRecord[] = [
      {
        tidspunkt_ms: 1200,
        hendelse: 'hidden',
        varighet_ms: 0,
        fase: 'trening',
        blokk: 1,
        forsøk_nr: 2,
      },
    ];
    const bundle = buildExport(10427, config, trials, events);
    expect(bundle.filenameBase).toBe('SMTS_0_10427');
    expect(bundle.csv.charCodeAt(0)).toBe(0xfeff);
    expect(bundle.csv.includes('deltakernr;studie_id;')).toBe(true);
    expect(bundle.csv.includes('Riktig')).toBe(true);
    expect(bundle.csv.includes('par_struktur;LS') || bundle.csv.includes('par_struktur')).toBe(true);

    const book = XLSX.read(bundle.xlsx, { type: 'array' });
    expect(book.SheetNames).toEqual(['Data', 'Parametere', 'Hendelser', 'Oppsummering']);
    const data = XLSX.utils.sheet_to_json<Record<string, string | number>>(book.Sheets.Data ?? {});
    expect(data).toHaveLength(2);
    for (const field of TRIAL_FIELDS) expect(data[0]).toHaveProperty(field);
    for (const field of Object.keys(parameterColumns(config))) expect(data[0]).toHaveProperty(field);
    expect(data[0]?.par_nedtrapping).toBe('100/75/50/0');
    expect(data[0]?.par_mestring_teller).toBe(17);
    expect(data[1]?.tilbakemeldingsord).toBe('Feil');

    const params = XLSX.utils.sheet_to_json<Record<string, string>>(book.Sheets.Parametere ?? {});
    expect(params.some((row) => row.parameter === 'par_struktur' && row.verdi === 'LS')).toBe(true);
    expect(params.some((row) => row.parameter === 'par_mestring' && row.verdi === '17/18')).toBe(true);
    expect(params.some((row) => row.parameter === 'instruksjon_no' && String(row.verdi).includes('Hjelpemidler'))).toBe(true);
    expect(data[0]?.['Position 1']).toBe('B1');
    const headers = XLSX.utils.sheet_to_json<string[]>(book.Sheets.Data ?? {}, { header: 1 })[0] ?? [];
    for (const column of POSITION_COLUMNS) expect(headers).toContain(column);

    const eventSheet = XLSX.utils.sheet_to_json<Record<string, string | number>>(book.Sheets.Hendelser ?? {});
    for (const field of EVENT_FIELDS) expect(eventSheet[0]).toHaveProperty(field);
    expect(eventSheet[0]?.hendelse).toBe('hidden');
  });

  it('writes every config value, the training order and the script on Parametere', () => {
    const config = defaultConfig();
    config.serialIntroduction = true;
    config.groupCode = 'syntetisk';
    config.excludedSymbols = ['sym-01'];
    config.customStimuli = { A1: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' };
    config.feedbackWordsEn = ['Right', 'Good'];
    const params = parameterSheet(config, 90001);
    const byName = new Map(params.map((row) => [row.parameter, row.verdi]));
    for (const key of Object.keys(CONFIG_PARAMETER_KEYS) as (keyof typeof CONFIG_PARAMETER_KEYS)[]) {
      expect(byName.has(CONFIG_PARAMETER_KEYS[key]), key).toBe(true);
    }
    expect(byName.get('par_mestring')).toBe('17/18');
    expect(byName.get('par_mestring_teller')).toBe('17');
    expect(byName.get('par_mestring_nevner')).toBe('18');
    expect(byName.get('par_mts_type')).toBe('simultaneous');
    expect(byName.get('par_forsinkelse_s')).toBe(String(config.delaySeconds));
    expect(byName.get('tilbakemeldingsord_en')).toBe('Right, Good');
    expect(byName.get('utelatte_symboler')).toBe('sym-01');
    expect(byName.get('tilpassede_stimuli')).toBe('A1');
    expect(byName.get('tilpassede_stimuli')).not.toContain('data:');
    expect(byName.get('treningsrekkefolge')).toContain('AB@100');
    expect(byName.get('treningsrekkefolge')).toContain('BC@100');
    expect(byName.get('treningsrekkefolge')).toContain('blandet:AB+BC@100');
    const script = byName.get('manus') ?? '';
    expect(script).toContain('begin experiment');
    expect(script).toContain('mastery 17/18');
    expect(script).toContain('block intro AB');
    expect(script).toContain('relation_codes baseline, symmetri, transitivitet, ekvivalens, refleksivitet');
    expect(script).toContain('end experiment');
    expect(byName.get('resultatfil')).toBe('SMTS_0_90001.xlsx');
    const packed = JSON.stringify(params);
    expect(packed).not.toContain('data:image');
  });

  it('fills Position 1–8 from the corner map and keeps 5–8 empty', () => {
    const config = defaultConfig();
    const bundle = buildExport(
      10427,
      config,
      [
        sampleTrial({
          sammenligninger_og_posisjoner: 'C2@nh|C1@øv|C3@nv|tom@øh',
        }),
      ],
      [],
    );
    const book = XLSX.read(bundle.xlsx, { type: 'array' });
    const data = XLSX.utils.sheet_to_json<Record<string, string>>(book.Sheets.Data ?? {}, { defval: '' });
    expect(data[0]?.['Position 1']).toBe('C1');
    expect(data[0]?.['Position 2']).toBe('');
    expect(data[0]?.['Position 3']).toBe('C3');
    expect(data[0]?.['Position 4']).toBe('C2');
    for (const column of POSITION_COLUMNS.slice(4)) expect(data[0]?.[column]).toBe('');
    expect(data[0]?.sammenligninger_og_posisjoner).toBe('C2@nh|C1@øv|C3@nv|tom@øh');
  });

  it('summarises accuracy and responses per minute for each block', () => {
    const config = defaultConfig();
    config.feedbackDurationMs = 500;
    config.wrongFeedback = 'feil';
    const trials = [
      sampleTrial({ blokk: 1, fase: 'trening', riktig: 1, start_ms: 0, svar_ms: 1000, iti_ms: 500, tilbakemeldingsord: 'Riktig', tilbakemelding_gitt: 1 }),
      sampleTrial({
        blokk: 1,
        fase: 'trening',
        forsøk_nr: 2,
        riktig: 0,
        start_ms: 2000,
        svar_ms: 3000,
        iti_ms: 500,
        tilbakemeldingsord: 'Feil',
        tilbakemelding_gitt: 1,
        korreksjonsforsøk: 0,
      }),
      sampleTrial({
        blokk: 2,
        fase: 'test',
        relasjonstype: 'symmetri',
        riktig: 1,
        start_ms: 10000,
        svar_ms: 11000,
        iti_ms: 0,
        tilbakemelding_gitt: 0,
        tilbakemeldingsord: '',
      }),
      sampleTrial({
        blokk: 2,
        fase: 'test',
        relasjonstype: 'ekvivalens',
        forsøk_nr: 4,
        riktig: 0,
        start_ms: 12000,
        svar_ms: 13000,
        iti_ms: 0,
        tilbakemelding_gitt: 0,
        tilbakemeldingsord: '',
      }),
    ];
    const bundle = buildExport(10427, config, trials, []);
    const book = XLSX.read(bundle.xlsx, { type: 'array' });
    const summary = XLSX.utils.sheet_to_json<Record<string, string | number>>(book.Sheets.Oppsummering ?? {});
    const byName = new Map(summary.map((row) => [String(row.maal), row.verdi]));
    expect(byName.get('mestringskriterium')).toBe('17/18');
    expect(byName.get('blokk_1_trening_riktige')).toBe('1/2');
    expect(byName.get('blokk_1_trening_prosent')).toBe(50);
    expect(byName.get('blokk_1_trening_responser_per_minutt')).toBe(responsesPerMinute(trials.slice(0, 2), config));
    expect(byName.get('blokk_1_trening_responser_per_minutt')).toBeGreaterThan(0);
    expect(byName.get('blokk_2_test_riktige')).toBe('1/2');
    expect(byName.get('blokk_2_test_prosent')).toBe(50);
    expect(typeof byName.get('blokk_2_test_responser_per_minutt')).toBe('number');
    expect(byName.get('blokk_2_test_symmetri')).toBe('1/1');
    expect(byName.get('blokk_2_test_ekvivalens')).toBe('0/1');
    expect(byName.get('test_symmetri')).toBe('1/1');
    expect(byName.get('test_ekvivalens')).toBe('0/1');
  });

  it('names delayed files DMTS_<seconds>_<participant> and simultaneous files SMTS_0_<participant>', () => {
    const delayed = defaultConfig();
    delayed.mtsType = 'delayed';
    delayed.delaySeconds = 0;
    expect(buildExport(13400, delayed, [], []).filenameBase).toBe('DMTS_0_13400');
    delayed.delaySeconds = 5;
    expect(buildExport(13400, delayed, [], []).filenameBase).toBe('DMTS_5_13400');
    const simultaneous = defaultConfig();
    simultaneous.delaySeconds = 1;
    expect(buildExport(13400, simultaneous, [], []).filenameBase).toBe('SMTS_0_13400');
  });

  it('uses the old English column names only when that profile is selected', () => {
    const config = defaultConfig();
    config.exportProfile = 'gamle_navn';
    config.mtsType = 'delayed';
    config.delaySeconds = 2;
    const trial = sampleTrial({
      relasjonstype: 'symmetri',
      forsinkelse_ms: 2000,
      utvalg_presentasjon_ms: 450,
      utvalg_av_ms: 2000,
      rt_utvalg_ms: 450,
      rt_sammenligning_ms: 880,
      iti_ms: 500,
      riktig: 1,
    });
    const bundle = buildExport(10427, config, [trial], []);
    expect(bundle.filenameBase).toBe('DMTS_2_10427');
    const book = XLSX.read(bundle.xlsx, { type: 'array' });
    const data = XLSX.utils.sheet_to_json<Record<string, string | number>>(book.Sheets.Data ?? {});
    const row = data[0] ?? {};
    expect(row.Block).toBe(1);
    expect(row.Trial).toBe(1);
    expect(row['Training/Test']).toBe('trening');
    expect(row.Sample).toBe('A1');
    expect(row.Comparison).toBe('B1');
    expect(row.Selected).toBe('B1');
    expect(row['Correct/Incorrect']).toBe(1);
    expect(row['Relational type']).toBe('symmetri');
    expect(row['Relational type']).not.toBe('Scripting');
    expect(row['Relational type']).not.toBe('Mixed');
    expect(row.RT_sample_ms).toBe(450);
    expect(row.RT_comparison_ms).toBe(880);
    expect(row.Delay_comparison_ms).toBe(2000);
    expect(row.ITI_ms).toBe(500);
    expect(row.Sample_presentation_ms).toBe(450);
    expect(row.Sample_off_ms).toBe(2000);
    expect(row['Position 1']).toBe('B1');
    expect(row['Programmed consequence']).toBe('Riktig');
    expect(row['Consequence probability']).toBe(100);
    expect(row.Repeat).toBe(0);
    expect(row.par_struktur).toBe('LS');
    expect(row.par_mestring).toBe('17/18');
    expect(row).not.toHaveProperty('deltakernr');
    expect(row).not.toHaveProperty('forsinkelse_ms');
    expect(typeof row.Delay_comparison_ms).toBe('number');
    expect(typeof row['Correct/Incorrect']).toBe('number');
    for (const field of TRIAL_FIELDS) {
      expect(row).toHaveProperty(ENGLISH_TRIAL_HEADERS[field]);
      expect(row).not.toHaveProperty(field);
    }
    const standard = buildExport(10427, defaultConfig(), [sampleTrial()], []);
    const standardBook = XLSX.read(standard.xlsx, { type: 'array' });
    const standardRow = XLSX.utils.sheet_to_json<Record<string, string | number>>(standardBook.Sheets.Data ?? {})[0];
    expect(standardRow).toHaveProperty('deltakernr');
    expect(standardRow).toHaveProperty('relasjonstype');
    expect(standardRow).not.toHaveProperty('Relational type');
  });
});

describe('storage folder', () => {
  it('keeps the experimenter choice of Mennesker or Boter-AI', () => {
    expect(storageFolder('Boter-AI')).toBe('Boter-AI');
    expect(storageFolder('Mennesker')).toBe('Mennesker');
    expect(storageFolder('noe-annet')).toBe('Mennesker');
    expect(storageFolder(undefined)).toBe('Mennesker');
  });
});

describe('codes', () => {
  it('issues unique codes, hashes them, and expires them after 24 hours', async () => {
    const rng = mulberry32(9);
    const used = new Set<number>();
    const numbers = Array.from({ length: 20 }, () => {
      const n = generateParticipantNumber(rng, used);
      used.add(n);
      return n;
    });
    expect(new Set(numbers).size).toBe(20);
    for (const n of numbers) expect(n).toBeGreaterThanOrEqual(10000);

    const code = generateCode(rng);
    expect(normalizeCode(code)).toHaveLength(8);
    const hash = await hashCode(code);
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe(normalizeCode(code));
    expect(await hashCode(` ${code.toLowerCase()} `)).toBe(hash);

    const now = Date.parse('2026-10-20T12:00:00.000Z');
    const exp = expiryFrom(now);
    expect(Date.parse(exp) - now).toBe(6 * 60 * 60 * 1000);
    expect(isExpired(exp, now + 6 * 60 * 60 * 1000)).toBe(true);
    expect(isExpired('', now)).toBe(false);
    expect(isExpired(exp, now + 1000)).toBe(false);
  });
});
