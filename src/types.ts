/** Domain types for the MTS lab. Field names that become data columns stay Norwegian. */

export type TrainingStructure = 'LS' | 'OTM' | 'MTO';
export type MtsType = 'simultaneous' | 'delayed';
export type WrongFeedback = 'none' | 'feil' | 'literature';
export type RelationKind =
  | 'baseline'
  | 'symmetri'
  | 'transitivitet'
  | 'ekvivalens'
  | 'refleksivitet';
export type Phase = 'forhåndstest' | 'trening' | 'test';
export type PositionMode = 'constrained' | 'free';
export type Language = 'no' | 'en';
export type StimulusMode = 'builtin' | 'upload';
/** `innebygd` is the human default. `abstrakte` is the nine text glyphs. */
export type StimulusSet = 'innebygd' | 'abstrakte';

/** Four screen corners. øv/øh = upper left/right, nv/nh = lower left/right. */
export const CORNERS = ['øv', 'øh', 'nv', 'nh'] as const;
export type Corner = (typeof CORNERS)[number];

export interface ExperimentConfig {
  version: 1;
  studyId: string;
  groupCode: string;
  language: Language;
  instructionNo: string;
  instructionEn: string;
  classes: number;
  members: number;
  structure: TrainingStructure;
  trialMultiplier: number;
  /** Mastery is numerator/denominator of the programmed block (default 17/18). */
  masteryNumerator: number;
  masteryDenominator: number;
  /** Feedback percentages, in order. Default 100, 75, 50, 0. */
  thinning: number[];
  feedbackWordsNo: string[];
  feedbackWordsEn: string[];
  feedbackDurationMs: number;
  wrongFeedback: WrongFeedback;
  correction: boolean;
  correctionMaxRepeats: number;
  mtsType: MtsType;
  delaySeconds: number;
  itiSeconds: number;
  /** Observing responses on the sample. 0 shows sample and comparisons together. */
  sampleClicks: number;
  /** Minutes without a response before the participant is asked to continue. */
  inactivityMinutes: number;
  positionBalance: PositionMode;
  maxConsecutiveSPlus: number;
  testSymmetry: boolean;
  testTransitivity: boolean;
  testEquivalence: boolean;
  testBaseline: boolean;
  testReflexivity: boolean;
  /** When reflexivity is on, give it as a pretest rather than inside the mixed test. */
  reflexivityAsPretest: boolean;
  testMultiplier: number;
  serialIntroduction: boolean;
  stimulusMode: StimulusMode;
  /** Which pictures the participant sees. Default `innebygd` leaves the SVG set unchanged. */
  stimulusSet: StimulusSet;
  /** Member index (0 = A) that uses uploaded pictures. Null = no picture node. */
  pictureMember: number | null;
  /** Builtin symbol id per stimulus id (A1, B2, …). */
  symbolAssignment: Record<string, string>;
  /** data: URLs that override a cell (uploads or picture nodes). */
  customStimuli: Record<string, string>;
  excludedSymbols: string[];
}

export interface Pair {
  sampleMember: number;
  comparisonMember: number;
}

export interface PlannedTrial {
  phase: Phase;
  relation: string;
  relationLabel: string;
  relationType: RelationKind;
  sample: string;
  correct: string;
  comparisonStimuli: string[];
  feedbackScheduled: boolean;
  thinningPercent: number;
  emptyCorner: Corner | null;
  sPlusCorner: Corner;
  placements: { stimulus: string; corner: Corner }[];
  blockAttempt: number;
  introLabel: string | null;
}

export interface TrialRecord {
  deltakernr: number;
  studie_id: string;
  oppsett_versjon: number;
  økt_start_utc: string;
  fase: Phase;
  blokk: number;
  blokk_gjentakelse: number;
  nedtrapping_prosent: number;
  blokkforsøk_nr: number;
  forsøk_nr: number;
  relasjon: string;
  relasjonstype: RelationKind;
  utvalg: string;
  sammenligninger_og_posisjoner: string;
  riktig_stimulus: string;
  valgt_stimulus: string;
  valgt_posisjon: string;
  riktig: 0 | 1;
  tilbakemelding_gitt: 0 | 1;
  tilbakemeldingsord: string;
  klikk_på_utvalg: number;
  rt_utvalg_ms: number | '';
  rt_sammenligning_ms: number | '';
  iti_ms: number;
  forsinkelse_ms: number;
  tomt_hjørne: string;
  s_pluss_hjørne: string;
  korreksjonsforsøk: 0 | 1;
  fanebytter_hittil: number;
}

export type SessionEventName =
  | 'blur'
  | 'focus'
  | 'hidden'
  | 'visible'
  | 'fullskjerm_av'
  | 'fullskjerm_på'
  | 'forsøk_på_lukking'
  | 'inaktivitet';

export interface EventRecord {
  tidspunkt_ms: number;
  hendelse: SessionEventName;
  varighet_ms: number;
  fase: string;
  blokk: number | '';
  forsøk_nr: number | '';
}

export interface ParameterRow {
  parameter: string;
  verdi: string;
}
