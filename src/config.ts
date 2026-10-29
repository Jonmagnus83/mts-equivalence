import { allStimulusIds } from './relations';
import type { ExperimentConfig, Language, StimulusMode, StimulusSet, TrainingStructure, WrongFeedback } from './types';
import { SYMBOLS } from './symbols';

export const DEFAULT_INSTRUCTION_NO = `Du skal gjøre en oppgave på denne skjermen.

En figur vises midt på skjermen. Klikk på figuren. Deretter vises flere figurer. Klikk på en av dem.

Ikke lukk denne fanen, og ikke bytt til andre vinduer eller programmer, før oppgaven er ferdig. Nettleseren kan ikke hindre at fanen lukkes. Den kan bare varsle, og programmet kan bare registrere at det skjedde.

Hjelpemidler er ikke tillatt. Ikke bruk mobiltelefon, notater, skriving eller andre personer.

Klikk hvor som helst for å starte.`;

export const DEFAULT_INSTRUCTION_EN = `You will do a task on this screen.

A figure appears in the centre. Click it. More figures then appear. Click one of them.

Do not close this tab, and do not switch to other windows or programs, before the task is finished. A browser cannot stop the tab from being closed. It can only warn you, and the program can only record that it happened.

No aids are allowed. Do not use a phone, notes, writing, or other people.

Click anywhere to start.`;

export function defaultConfig(): ExperimentConfig {
  const config: ExperimentConfig = {
    version: 1,
    studyId: 'mts',
    groupCode: '',
    language: 'no',
    instructionNo: DEFAULT_INSTRUCTION_NO,
    instructionEn: DEFAULT_INSTRUCTION_EN,
    classes: 3,
    members: 3,
    structure: 'LS',
    trialMultiplier: 3,
    masteryNumerator: 17,
    masteryDenominator: 18,
    thinning: [100, 75, 50, 0],
    feedbackWordsNo: ['Riktig', 'Bra', 'Supert', 'Korrekt'],
    feedbackWordsEn: ['Right', 'Good', 'Great', 'Correct'],
    feedbackDurationMs: 2000,
    wrongFeedback: 'literature',
    correction: true,
    correctionMaxRepeats: 10,
    mtsType: 'simultaneous',
    delaySeconds: 1,
    itiSeconds: 0.1,
    sampleClicks: 1,
    inactivityMinutes: 10,
    positionBalance: 'constrained',
    maxConsecutiveSPlus: 2,
    testSymmetry: true,
    testTransitivity: true,
    testEquivalence: true,
    testBaseline: false,
    testReflexivity: false,
    reflexivityAsPretest: true,
    testMultiplier: 3,
    serialIntroduction: false,
    stimulusMode: 'builtin',
    stimulusSet: 'innebygd',
    pictureMember: null,
    symbolAssignment: {},
    customStimuli: {},
    excludedSymbols: [],
  };
  config.symbolAssignment = assignSymbols(config);
  return config;
}

export function assignSymbols(config: Pick<ExperimentConfig, 'classes' | 'members' | 'excludedSymbols' | 'symbolAssignment'>): Record<string, string> {
  const available = SYMBOLS.map((symbol) => symbol.id).filter((id) => !config.excludedSymbols.includes(id));
  if (available.length === 0) throw new Error('Alle symbolene er utelatt.');
  const ids = allStimulusIds(config.classes, config.members);
  const next: Record<string, string> = {};
  ids.forEach((id, index) => {
    const kept = config.symbolAssignment[id];
    next[id] = kept && available.includes(kept) ? kept : (available[index % available.length] as string);
  });
  return next;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

const STRUCTURES: TrainingStructure[] = ['LS', 'OTM', 'MTO'];
const WRONG: WrongFeedback[] = ['none', 'feil', 'literature'];

/** Accepts a saved JSON file and fills anything missing with the current defaults. */
export function parseConfig(raw: unknown): ExperimentConfig {
  const base = defaultConfig();
  if (!raw || typeof raw !== 'object') return base;
  const input = raw as Partial<ExperimentConfig>;
  const structure = STRUCTURES.includes(input.structure as TrainingStructure)
    ? (input.structure as TrainingStructure)
    : base.structure;
  const wrong = WRONG.includes(input.wrongFeedback as WrongFeedback)
    ? (input.wrongFeedback as WrongFeedback)
    : base.wrongFeedback;
  const language: Language = input.language === 'en' ? 'en' : 'no';
  const stimulusMode: StimulusMode = input.stimulusMode === 'upload' ? 'upload' : 'builtin';
  const stimulusSet: StimulusSet = input.stimulusSet === 'abstrakte' ? 'abstrakte' : 'innebygd';
  const thinning = Array.isArray(input.thinning)
    ? input.thinning.map((n) => clampInt(n, 0, 100, 0)).filter((_, i, arr) => arr.length > 0)
    : base.thinning;
  const config: ExperimentConfig = {
    ...base,
    studyId: asString(input.studyId, base.studyId).slice(0, 80) || base.studyId,
    groupCode: asString(input.groupCode, '').slice(0, 40),
    language,
    instructionNo: asString(input.instructionNo, base.instructionNo),
    instructionEn: asString(input.instructionEn, base.instructionEn),
    classes: clampInt(input.classes, 2, 4, base.classes),
    members: clampInt(input.members, 3, 8, base.members),
    structure,
    trialMultiplier: clampInt(input.trialMultiplier, 1, 20, base.trialMultiplier),
    masteryNumerator: clampInt(input.masteryNumerator, 1, 500, base.masteryNumerator),
    masteryDenominator: clampInt(input.masteryDenominator, 1, 500, base.masteryDenominator),
    thinning: thinning.length > 0 ? thinning : base.thinning,
    feedbackWordsNo: stringList(input.feedbackWordsNo, base.feedbackWordsNo),
    feedbackWordsEn: stringList(input.feedbackWordsEn, base.feedbackWordsEn),
    feedbackDurationMs: clampInt(input.feedbackDurationMs, 0, 10000, base.feedbackDurationMs),
    wrongFeedback: wrong,
    correction: asBool(input.correction, base.correction),
    correctionMaxRepeats: clampInt(input.correctionMaxRepeats, 1, 30, base.correctionMaxRepeats),
    mtsType: input.mtsType === 'delayed' ? 'delayed' : 'simultaneous',
    delaySeconds: clampInt(input.delaySeconds, 0, 60, base.delaySeconds),
    itiSeconds: clampNumber(input.itiSeconds, 0, 30, base.itiSeconds),
    sampleClicks: clampInt(input.sampleClicks, 0, 10, base.sampleClicks),
    inactivityMinutes: clampInt(input.inactivityMinutes, 1, 180, base.inactivityMinutes),
    positionBalance: input.positionBalance === 'free' ? 'free' : 'constrained',
    maxConsecutiveSPlus: clampInt(input.maxConsecutiveSPlus, 1, 10, base.maxConsecutiveSPlus),
    testSymmetry: asBool(input.testSymmetry, base.testSymmetry),
    testTransitivity: asBool(input.testTransitivity, base.testTransitivity),
    testEquivalence: asBool(input.testEquivalence, base.testEquivalence),
    testBaseline: asBool(input.testBaseline, base.testBaseline),
    testReflexivity: asBool(input.testReflexivity, base.testReflexivity),
    reflexivityAsPretest: asBool(input.reflexivityAsPretest, base.reflexivityAsPretest),
    testMultiplier: clampInt(input.testMultiplier, 1, 20, base.testMultiplier),
    serialIntroduction: asBool(input.serialIntroduction, base.serialIntroduction),
    stimulusMode,
    stimulusSet,
    pictureMember:
      input.pictureMember === null || input.pictureMember === undefined
        ? null
        : clampInt(input.pictureMember, 0, 7, 0),
    symbolAssignment: isStringRecord(input.symbolAssignment) ? { ...input.symbolAssignment } : {},
    customStimuli: isStringRecord(input.customStimuli) ? { ...input.customStimuli } : {},
    excludedSymbols: Array.isArray(input.excludedSymbols)
      ? input.excludedSymbols.filter((id): id is string => typeof id === 'string')
      : [],
  };
  if (config.pictureMember !== null && config.pictureMember >= config.members) {
    config.pictureMember = config.members - 1;
  }
  config.symbolAssignment = assignSymbols(config);
  return config;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback.slice();
  const list = value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
  return list.length > 0 ? list : fallback.slice();
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((item) => typeof item === 'string');
}

export function feedbackWords(config: ExperimentConfig): string[] {
  return config.language === 'en' ? config.feedbackWordsEn : config.feedbackWordsNo;
}

export function wrongWord(config: ExperimentConfig): string {
  return config.language === 'en' ? 'Wrong' : 'Feil';
}

export function instructionText(config: ExperimentConfig): string {
  return config.language === 'en' ? config.instructionEn : config.instructionNo;
}
