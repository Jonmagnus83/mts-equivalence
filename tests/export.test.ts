import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { expiryFrom, generateCode, generateParticipantNumber, hashCode, isExpired, normalizeCode } from '../src/codes';
import { storageFolder } from '../src/folders';
import { defaultConfig } from '../src/config';
import { buildExport, EVENT_FIELDS, TRIAL_FIELDS, parameterColumns } from '../src/export';
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
    tomt_hjørne: 'nh',
    s_pluss_hjørne: 'øv',
    korreksjonsforsøk: 0,
    fanebytter_hittil: 0,
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
    expect(bundle.filenameBase).toBe('10427');
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
    expect(params.some((row) => row.parameter === 'instruksjon_no' && String(row.verdi).includes('Hjelpemidler'))).toBe(true);

    const eventSheet = XLSX.utils.sheet_to_json<Record<string, string | number>>(book.Sheets.Hendelser ?? {});
    for (const field of EVENT_FIELDS) expect(eventSheet[0]).toHaveProperty(field);
    expect(eventSheet[0]?.hendelse).toBe('hidden');
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
    expect(Date.parse(exp) - now).toBe(24 * 60 * 60 * 1000);
    expect(isExpired(exp, now + 24 * 60 * 60 * 1000)).toBe(true);
    expect(isExpired(exp, now + 1000)).toBe(false);
  });
});
