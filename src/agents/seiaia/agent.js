// seiaia_ps_js/agent.js – selvstendig ES-modul (ingen avhengigheter, ingen nettverk).
// JavaScript-port av ../seiaia_ps (Python), som igjen bygger på Mofrad et al. (2020) EPS «positive_h»
// og (valgfritt) E-EPS Network Enhancement (Mofrad et al., 2021; Wang et al., 2018).
// Port opprettet 27.10.2026. Konfigurasjonsnøkler har samme (snake_case) navn som i Python.
//
// Enkelt grensesnitt (agent):
//   const agent = createAgent(config, seed);
//   const pos = agent.choose(trial);   // 1..3 (posisjon i leserekkefølge over de brukte hjørnene)
//   agent.feedback(correct);           // true | false | null (null = ingen tilbakemelding denne trialen)
//   agent.reset();                     // tilbake til starttilstand, samme seed -> samme forløp
// trial = { sample: 'A1' | {id:'A1'}, comparisons: ['B1','B3','B2'] | [{id:'B1', corner:'øv'}, ...],
//           training: true|false (valgfri, standard true) }.  Python-formatet {sample_id, choice_ids} godtas også.
//   training=false betyr «slutt-test uten tilbakemelding og uten læring»; i nedtrappingsblokker uten
//   tilbakemelding sendes training=true og feedback(null).

// ------------------------------------------------------------------ PRNG (mulberry32, identisk med portable.py)
export class Mulberry32 {
  constructor(seed) { this.a = seed >>> 0; }
  random() {
    this.a = (this.a + 0x6D2B79F5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  randint(n) { return Math.floor(this.random() * n); }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.randint(i + 1);
      const x = arr[i]; arr[i] = arr[j]; arr[j] = x;
    }
  }
  choice(seq) { return seq[this.randint(seq.length)]; }
}
export function seedsFor(seed) {
  const s = seed >>> 0;
  return [s, (s ^ 0xA5A5A5A5) >>> 0, (s ^ 0x5BD1E995) >>> 0];   // [tidsplan, agent, hjørner]
}

// ------------------------------------------------------------------ stimuli og standardkonfigurasjon
export const STIMULI = {
  A1: '\u25C6', B1: '\u25A0', C1: '\u25B3',   // ◆ ■ △
  A2: '\u25B2', B2: '\u25E2', C2: '\u25CB',   // ▲ ◢ ○
  A3: '\u25CF', B3: '\u25E4', C3: '\u25A1',   // ● ◤ □
};
export const NODES = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];
const IDX = Object.fromEntries(NODES.map((n, i) => [n, i]));
export const CORNERS = ['øv', 'øh', 'nv', 'nh'];

export const DEFAULT_AGENT = {
  policy: 'standard', beta_h: 0.1, K1: 5.0, K2: 4.0, K3: 2.5, K4: 2.0, gamma: 0.001,
  nodal_theta: 'Not', memory_sharpness: 1.0, gamma_nodal: 0.05,
  memory_mode: 'full', memory_n: 72, test_in_history: true,
  reflexivity: 'none', position_bias: 0.0, bias_position: 1,
  derived_mode: 'path', ne_variant: 'sne', ne_alpha: 0.8, ne_beta_h: 0.07, ne_beta_t: 8.0,
};
export const DEFAULT_PROTOCOL = {
  mastery_need: 17, mastery_consecutive: 1,          // MTS-lab-regelen (Jon 27.10): 17/18 i én blokk
  max_blocks: 20, thinning_levels: [0.75, 0.5, 0.25], thinning_attempts: 3, n_test_blocks: 1, force_test: false,
};
export const DEFAULT_CONFIG = { agent: { ...DEFAULT_AGENT }, protocol: { ...DEFAULT_PROTOCOL } };

export function validateAgentConfig(a) {
  const bad = (m) => { throw new Error('ugyldig konfigurasjon: ' + m); };
  for (const k of Object.keys(a)) if (!(k in DEFAULT_AGENT)) bad('ukjent nøkkel ' + k);
  if (!['standard', 'softmax'].includes(a.policy)) bad('policy');
  if (!['full', 'last_n', 'none'].includes(a.memory_mode)) bad('memory_mode');
  if (!['Not', 'Lin', 'Pow'].includes(a.nodal_theta)) bad('nodal_theta');
  if (!['none', 'network'].includes(a.reflexivity)) bad('reflexivity');
  if (!['path', 'ne'].includes(a.derived_mode)) bad('derived_mode');
  if (!['sne', 'dne'].includes(a.ne_variant)) bad('ne_variant');
  if (!(a.gamma >= 0 && a.gamma < 1)) bad('gamma må være i [0,1)');
  if (!(a.position_bias >= 0 && a.position_bias <= 1) || ![1, 2, 3].includes(a.bias_position)) bad('position_bias');
  if (a.memory_mode === 'last_n' && !(a.memory_n >= 1)) bad('memory_n >= 1');
  if (Math.min(a.K1, a.K2, a.K3, a.K4) < 0) bad('K >= 0');
  if (!(a.ne_alpha >= 0 && a.ne_alpha < 1) || a.ne_beta_h < 0 || a.ne_beta_t < 0) bad('ne-parametre');
}
export function mergeAgentConfig(config) {
  const nested = config && (config.agent !== undefined || config.protocol !== undefined);
  const src = nested ? (config.agent || {}) : (config || {});
  const a = { ...DEFAULT_AGENT, ...src };
  validateAgentConfig(a);
  return a;
}

// ------------------------------------------------------------------ små matrisehjelpere
const zeros = (n) => Array.from({ length: n }, () => new Float64Array(n));
function matmul(A, B) {
  const n = A.length, m = B[0].length, k = B.length, C = zeros(n);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { let s = 0; for (let x = 0; x < k; x++) s += A[i][x] * B[x][j]; C[i][j] = s; }
  return C;
}
const transpose = (A) => A.map((_, j) => Float64Array.from(A, (r) => r[j]));
const sumArr = (v) => { let s = 0; for (const x of v) s += x; return s; };

// ------------------------------------------------------------------ agent
export class PSAgent {
  constructor(cfg, seed = 0) {
    this.c = mergeAgentConfig(cfg);
    this.seed = seed >>> 0;
    this.reset();
  }
  reset() {
    const n = NODES.length;
    this.E = Array.from({ length: n }, () => new Array(n).fill(false));
    this.d = zeros(n);                      // h - 1
    this.hist = [];
    this.window = { full: null, last_n: this.c.memory_n, none: 0 }[this.c.memory_mode];
    this.rng = new Mulberry32(seedsFor(this.seed)[1]);
    this._ver = 0; this._ne = null;
    this._pending = null;                   // { trial, pos, training }
    this.lastProbs = null; this.lastRoute = null;
  }
  h(i, j) { return 1.0 + this.d[i][j]; }

  advance(delta) {
    const g = this.c.gamma, n = NODES.length;
    this._ver++;
    const keep = 1.0 - g;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) this.d[i][j] *= keep;
    if (this.window === 0) return;
    for (const [i, j, v] of delta) this.d[i][j] += v;
    this.hist.push(delta);
    if (this.window !== null && this.hist.length > this.window) {
      const old = this.hist.shift();
      const f = Math.pow(1.0 - g, this.window);
      for (const [i, j, v] of old) this.d[i][j] -= v * f;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (this.d[i][j] < 0) this.d[i][j] = 0;
    }
  }

  _policy(hv) {
    if (this.c.policy === 'standard') { const s = sumArr(hv); return hv.map((x) => x / s); }
    const z = hv.map((x) => this.c.beta_h * x), m = Math.max(...z);
    const e = z.map((x) => Math.exp(x - m)), s = sumArr(e);
    return e.map((x) => x / s);
  }
  _rowProbs() {
    const n = NODES.length, P = zeros(n);
    for (let i = 0; i < n; i++) {
      const idx = []; for (let j = 0; j < n; j++) if (this.E[i][j]) idx.push(j);
      if (!idx.length) continue;
      const p = this._policy(idx.map((j) => this.h(i, j)));
      idx.forEach((j, k) => { P[i][j] = p[k]; });
    }
    return P;
  }
  _hops(src) {
    const dist = new Map([[src, 0]]), q = [src];
    while (q.length) {
      const u = q.shift();
      for (let v = 0; v < NODES.length; v++) if (this.E[u][v] && !dist.has(v)) { dist.set(v, dist.get(u) + 1); q.push(v); }
    }
    return dist;
  }
  _theta(D) {
    const c = this.c;
    if (c.nodal_theta === 'Not') return c.memory_sharpness;
    if (c.nodal_theta === 'Lin') return Math.max(0.0, c.memory_sharpness - D * c.gamma_nodal);
    return c.memory_sharpness * (D > 0 ? Math.pow(D, -c.gamma_nodal) : 1.0);
  }

  // ---- E-EPS Network Enhancement (port av Network_Enhancement / softmax_matrix / marginalized_probability)
  static _softmaxMatrix(W, beta) {
    return W.map((row) => {
      const z = Array.from(row, (x) => beta * x), m = Math.max(...z);
      const e = z.map((x, j) => (row[j] === 0 ? 0 : Math.exp(x - m)));
      const s = sumArr(e);
      return Float64Array.from(e, (x) => x / s);
    });
  }
  networkEnhancement() {
    const c = this.c, n = NODES.length;
    const act = [];
    for (let i = 0; i < n; i++) { let a = false; for (let j = 0; j < n; j++) if (this.E[i][j] || this.E[j][i]) a = true; if (a) act.push(i); }
    const m = act.length;
    const Win = Array.from({ length: m }, (_, a) => Float64Array.from(act, (j) => (this.E[act[a]][j] ? this.h(act[a], j) : 0)));
    for (let a = 0; a < m; a++) Win[a][a] = Math.max(...Win[a]);
    const P = PSAgent._softmaxMatrix(Win, c.ne_beta_h);
    let Tau;
    if (c.ne_variant === 'sne') {
      const cs = Array.from({ length: m }, (_, k) => { let s = 0; for (let i = 0; i < m; i++) s += P[i][k]; return s; });
      const Pn = P.map((row) => Float64Array.from(row, (x, k) => x / cs[k]));
      Tau = matmul(Pn, transpose(P));
    } else Tau = P.map((r) => Float64Array.from(r));
    let Wold = P.map((r) => Float64Array.from(r)), err = 10, it = 0;
    while (err > 0.0001) {
      const T = matmul(matmul(Tau, Wold), Tau);
      const Wnew = T.map((row, i) => Float64Array.from(row, (x, j) => c.ne_alpha * x + (1 - c.ne_alpha) * Tau[i][j]));
      err = 0; for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) err += Math.abs(Wnew[i][j] - Wold[i][j]);
      Wold = Wnew; it++;
    }
    return { act, Win, P, Tau, W: Wold, iterations: it };
  }
  _neProbs(s, comps) {
    if (!this.E.some((r) => r.some(Boolean))) return null;   // ingenting sett ennå: intet nettverk
    if (!this._ne || this._ne.ver !== this._ver) this._ne = { ver: this._ver, r: this.networkEnhancement() };
    const { act, W } = this._ne.r;
    const pos = new Map(act.map((nd, i) => [nd, i]));
    if (!pos.has(s) || comps.some((a) => !pos.has(a))) return null;
    const letter = NODES[comps[0]][0];
    const cols = act.filter((nd) => NODES[nd][0] === letter).map((nd) => pos.get(nd));
    let row = cols.map((j) => W[pos.get(s)][j]);
    const sm = sumArr(row);
    if (sm !== 0) row = row.map((x) => x / sm);
    const z = row.map((x) => this.c.ne_beta_t * x), mx = Math.max(...z);
    const e = z.map((x) => Math.exp(x - mx)), se = sumArr(e);
    const marg = new Map(cols.map((j, k) => [j, e[k] / se]));
    const p = comps.map((a) => marg.get(pos.get(a)));
    const sp = sumArr(p);
    return p.map((x) => x / sp);
  }

  probs(sampleId, choiceIds) {
    const s = IDX[sampleId], comps = choiceIds.map((x) => IDX[x]);
    if (choiceIds.includes(sampleId) && this.c.reflexivity === 'none') return [[1 / 3, 1 / 3, 1 / 3], 'reflexive_uniform'];
    if (comps.every((a) => this.E[s][a])) return [this._policy(comps.map((a) => this.h(s, a))), 'direct'];
    if (this.c.derived_mode === 'ne') {
      const pn = this._neProbs(s, comps);
      if (pn === null) return [[1 / 3, 1 / 3, 1 / 3], 'ne_unseen_uniform'];
      return [pn, 'ne_' + this.c.ne_variant];
    }
    const P = this._rowProbs(), n = NODES.length;
    const cost = P.map((r) => Array.from(r, (x) => (x > 0 ? -Math.log(x) : Infinity)));
    let dist = new Array(n).fill(Infinity); dist[s] = 0;
    for (let it = 0; it < n; it++) {
      const nw = dist.map((dj, j) => { let best = dj; for (let i = 0; i < n; i++) { const v = dist[i] + cost[i][j]; if (v < best) best = v; } return best; });
      if (nw.every((x, i) => x === dist[i])) break;
      dist = nw;
    }
    const p = comps.map((a) => Math.exp(-dist[a])), sp = sumArr(p);
    if (!(sp > 0)) return [[1 / 3, 1 / 3, 1 / 3], 'unreachable_uniform'];
    const pn = p.map((x) => x / sp);
    const hops = this._hops(s).get(comps[0]) ?? 1;
    const theta = this._theta(Math.max(hops - 1, 0));
    return [pn.map((x) => theta * x + (1 - theta) / 3), 'derived'];
  }

  // ---- grensesnitt
  static normalizeTrial(trial) {
    const id = (x) => (typeof x === 'string' ? x : x.id);
    const sample = id(trial.sample ?? trial.sample_id);
    const comps = (trial.comparisons ?? trial.choice_ids).map(id);
    if (comps.length !== 3) throw new Error('agenten støtter nøyaktig 3 sammenligninger');
    return { sample, comps, training: trial.training !== false };
  }
  choose(trial) {
    const { sample, comps, training } = PSAgent.normalizeTrial(trial);
    const s = IDX[sample];
    if (training) { for (const a of comps.map((x) => IDX[x])) { this.E[s][a] = true; this.E[a][s] = true; } this._ver++; }
    if (!training && this.c.test_in_history) this.advance([]);
    let [p, route] = this.probs(sample, comps);
    const b = this.c.position_bias;
    if (b > 0) {
      p = p.map((x, i) => b * (i === this.c.bias_position - 1 ? 1 : 0) + (1 - b) * x);
      route += '+bias';
    }
    const sp = sumArr(p), q = p.map((x) => x / sp);
    const u = this.rng.random();
    let cum = 0, pos = 3;
    for (let i = 0; i < 3; i++) { cum += q[i]; if (u < cum) { pos = i + 1; break; } }
    this.lastProbs = p; this.lastRoute = route;
    this._pending = { sample, comps, pos, training };
    return pos;
  }
  feedback(correct) {
    const pd = this._pending;
    if (!pd) throw new Error('feedback() uten foregående choose()');
    this._pending = null;
    if (!pd.training) return;               // testtrial: ingen læring (tid går i choose())
    const c = this.c, delta = [];
    if (correct === true || correct === false) {
      const s = IDX[pd.sample], ids = pd.comps.map((x) => IDX[x]), chosen = ids[pd.pos - 1];
      if (correct) delta.push([s, chosen, c.K1], [chosen, s, c.K2]);
      else for (const a of ids) if (a !== chosen) delta.push([s, a, c.K3], [a, s, c.K4]);
    }
    this.advance(delta);
  }
  /** h-matrix (9x9) som vanlige tall, til visning/feilsøking. */
  hMatrix() { return this.d.map((r, i) => Array.from(r, (x, j) => (this.E[i][j] ? 1 + x : 0))); }
}
export function createAgent(config, seed = 0) { return new PSAgent(config, seed); }

// ------------------------------------------------------------------ protokoll (port av protocol.py)
export const PROBE_RELATIONS = ['AA', 'BB', 'CC', 'BA', 'CB', 'AC', 'CA'];
export const FAMILY = { AB: 'baseline', BC: 'baseline', AA: 'reflexivity', BB: 'reflexivity', CC: 'reflexivity',
  BA: 'symmetry', CB: 'symmetry', AC: 'transitivity', CA: 'equivalence' };
export const PROBE_LABEL = { reflexivity: 'R', symmetry: 'S', transitivity: 'T', equivalence: 'EQ', baseline: 'BL' };

export function makeTrial(rel, sampleCls, splusPos, foilFlip, phase, block) {
  const sampleId = rel[0] + sampleCls, correct = rel[1] + sampleCls;
  let foils = [1, 2, 3].filter((c) => c !== sampleCls).map((c) => rel[1] + c);
  if (foilFlip) foils = foils.slice().reverse();
  const slots = [null, null, null]; let fi = 0;
  slots[splusPos - 1] = correct;
  for (let i = 0; i < 3; i++) if (slots[i] === null) slots[i] = foils[fi++];
  return { phase, block, relation_type: rel, family: FAMILY[rel], sample_id: sampleId, sample_text: STIMULI[sampleId],
    choice_ids: slots, choice_texts: slots.map((s) => STIMULI[s]), correct_choice_position: splusPos, correct_id: correct };
}
export function ordered(trials, rng, maxRun = 2) {
  for (let attempt = 0; attempt < 5000; attempt++) {
    const pool = trials.slice(), seq = []; let ok = true;
    rng.shuffle(pool);
    while (pool.length) {
      const cands = [];
      pool.forEach((t, i) => {
        if (seq.length && t.sample_id === seq[seq.length - 1].sample_id) return;
        if (seq.length >= maxRun && seq.slice(-maxRun).every((x) => x.correct_choice_position === t.correct_choice_position)) return;
        cands.push(i);
      });
      if (!cands.length) { ok = false; break; }
      seq.push(pool.splice(rng.choice(cands), 1)[0]);
    }
    if (ok) return seq;
  }
  throw new Error('fant ingen tillatt trialrekkefølge');
}
export function mixedBlock(b, rng, phase) {
  const trials = [];
  ['AB', 'BC'].forEach((rel, ri) => {
    for (let s = 0; s < 3; s++) for (let p = 0; p < 3; p++)
      trials.push(makeTrial(rel, s + 1, (s + p + b + ri) % 3 + 1, (p + b) % 2 === 1, phase, b));
  });
  return ordered(trials, rng);
}
export function testBlock(rng, bOffset = 0) {
  const trials = [];
  PROBE_RELATIONS.forEach((rel, k) => {
    for (let s = 0; s < 3; s++) for (let p = 0; p < 2; p++)
      trials.push(makeTrial(rel, s + 1, (s + p + k) % 3 + 1, (s + p) % 2 === 1, 'test', null));
  });
  for (const t of mixedBlock(bOffset, rng, 'test')) trials.push(t);
  for (const t of trials) t.block = null;
  return ordered(trials, rng);
}
export function feedbackMask(level, n, rng) {
  const k = Math.floor(level * n + 0.5);
  const m = Array.from({ length: n }, (_, i) => i < k);
  rng.shuffle(m);
  return m;
}

// ------------------------------------------------------------------ analyse (port av analysis.py)
export function wilson(k, n, z = 1.96) {
  if (n === 0) return [NaN, NaN];
  const ph = k / n, den = 1 + z * z / n, centre = (ph + z * z / (2 * n)) / den;
  const half = z * Math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n)) / den;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}
export function scoreTest(testLogs) {
  const c = (xs) => xs.filter((t) => t.correct).length;
  const fam = (f) => testLogs.filter((t) => t.family === f);
  const rel = (r) => testLogs.filter((t) => t.relation_type === r);
  const derived = testLogs.filter((t) => ['symmetry', 'transitivity', 'equivalence'].includes(t.family));
  const byPos = {}; for (const p of [1, 2, 3]) { const v = derived.filter((t) => t.correct_choice_position === p); byPos[p] = [c(v), v.length]; }
  const byFamily = {}; for (const f of ['baseline', 'reflexivity', 'symmetry', 'transitivity', 'equivalence']) byFamily[f] = [c(fam(f)), fam(f).length];
  const byRelation = {}; for (const r of ['AA', 'BB', 'CC', 'BA', 'CB', 'AC', 'CA', 'AB', 'BC']) byRelation[r] = [c(rel(r)), rel(r).length];
  const crit = {
    baseline_in_test: byFamily.baseline[0] >= 16,
    symmetry: byFamily.symmetry[0] >= 11 && byRelation.BA[0] >= 5 && byRelation.CB[0] >= 5,
    transitivity: byRelation.AC[0] >= 5, equivalence: byRelation.CA[0] >= 5,
    position_control: Object.values(byPos).every((v) => v[0] >= 7),
  };
  crit.equivalence_demonstrated = Object.values(crit).every(Boolean);
  return { by_family: byFamily, by_relation: byRelation, derived_by_splus_position: byPos, criterion: crit };
}

// ------------------------------------------------------------------ økt (port av portable.py / session.py)
/** Generator: yield én loggpost per trial (etter at agenten har svart og fått tilbakemelding). Retur = meta. */
export function* sessionGen(config, seed = 1, runId = 'PS-JS') {
  const aCfg = mergeAgentConfig(config);
  const P = { ...DEFAULT_PROTOCOL, ...((config && config.protocol) || {}) };
  const [sSched, , sLay] = seedsFor(seed);
  const rng = new Mulberry32(sSched), lrng = new Mulberry32(sLay);
  const agent = new PSAgent(aCfg, seed);
  const logs = [], nBlocks = {};
  const rid = `${runId}-s${seed}`;
  function* doTrial(t, fb, training, blockInfo) {
    const empty = lrng.randint(4);
    const used = CORNERS.filter((_, i) => i !== empty);
    const pos = agent.choose({ sample: t.sample_id, comparisons: t.choice_ids, training });
    const ok = pos === t.correct_choice_position;
    agent.feedback(training && fb ? ok : null);
    const rec = { run_id: rid, trial_index: logs.length + 1, ...t, empty_corner: CORNERS[empty], corners: used,
      feedback_given: fb, agent_choice_position: pos, chosen_corner: used[pos - 1], correct: ok, route: agent.lastRoute,
      p_choice: agent.lastProbs.slice(), memory_mode: aCfg.memory_mode, memory_n: aCfg.memory_mode === 'last_n' ? aCfg.memory_n : null,
      gamma: aCfg.gamma, derived_mode: aCfg.derived_mode, seed, ...(blockInfo || {}) };
    logs.push(rec);
    return rec;
  }
  const blockEvents = [];       // {stage, level, attempt, correct, n, passed}
  let mastered = false, streak = 0;
  for (let b = 1; b <= P.max_blocks; b++) {
    nBlocks.train = b;
    const tr = mixedBlock(b, rng, 'train'); let k = 0;
    for (let i = 0; i < tr.length; i++) { const r = yield* doTrial(tr[i], true, true, { block_trial: i + 1, stage: 'train' }); if (r.correct) k++; yield r; }
    streak = k >= P.mastery_need ? streak + 1 : 0;
    const passed = streak >= P.mastery_consecutive;
    blockEvents.push({ stage: 'train', block: b, correct: k, n: 18, passed });
    yield { _event: 'block', ...blockEvents[blockEvents.length - 1] };
    if (passed) { mastered = true; break; }
  }
  const forced = [];
  if (!mastered) {
    if (!P.force_test) return { run_id: rid, seed, status: 'failed_training', n_trials: logs.length, n_blocks: nBlocks, config: { agent: aCfg, protocol: P }, logs, blockEvents };
    forced.push('training_mixed');
  }
  const nTrain = nBlocks.train;
  for (const level of P.thinning_levels) {
    let passed = false;
    for (let att = 1; att <= P.thinning_attempts; att++) {
      nBlocks.thin = (nBlocks.thin || 0) + 1;
      const tr = mixedBlock(nTrain + nBlocks.thin, rng, 'thinning');
      const mask = feedbackMask(level, tr.length, rng); let k = 0;
      for (let i = 0; i < tr.length; i++) { const r = yield* doTrial(tr[i], mask[i], true, { block_trial: i + 1, stage: 'thin', thin_level: level }); if (r.correct) k++; yield r; }
      const okb = k >= P.mastery_need;
      blockEvents.push({ stage: 'thin', level, attempt: att, correct: k, n: 18, passed: okb });
      yield { _event: 'block', ...blockEvents[blockEvents.length - 1] };
      if (okb) { passed = true; break; }
    }
    if (!passed) {
      if (!P.force_test) return { run_id: rid, seed, status: 'failed_thinning', n_trials: logs.length, n_blocks: nBlocks, config: { agent: aCfg, protocol: P }, logs, blockEvents };
      forced.push('thinning_' + level);
    }
  }
  const testLogs = [];
  for (let tb = 0; tb < P.n_test_blocks; tb++) {
    const tr = testBlock(rng, tb);
    for (let i = 0; i < tr.length; i++) { const r = yield* doTrial(tr[i], false, false, { block_trial: i + 1, stage: 'test' }); testLogs.push(r); yield r; }
  }
  return { run_id: rid, seed, status: forced.length ? 'completed_forced' : 'completed', mastery_failures: forced, n_trials: logs.length,
    n_blocks: nBlocks, n_train_blocks: nTrain, score: scoreTest(testLogs), config: { agent: aCfg, protocol: P }, logs, blockEvents };
}
/** Kjør en hel økt synkront. Returnerer meta (inkl. logs). */
export function runSession(config, seed = 1, runId = 'PS-JS') {
  const g = sessionGen(config, seed, runId);
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}

// ------------------------------------------------------------------ eksport
export function toJSONL(logs) { return logs.map((l) => JSON.stringify(l)).join('\n') + '\n'; }
export function toCSV(logs) {
  const cols = ['run_id', 'trial_index', 'phase', 'stage', 'block', 'thin_level', 'relation_type', 'family', 'sample_id', 'sample_text',
    'choice_ids', 'choice_texts', 'correct_choice_position', 'empty_corner', 'corners', 'feedback_given', 'agent_choice_position',
    'chosen_corner', 'correct', 'route', 'p_choice', 'memory_mode', 'memory_n', 'gamma', 'derived_mode', 'seed'];
  const esc = (v) => { if (v === undefined || v === null) return ''; const s = Array.isArray(v) ? v.join('|') : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(',')].concat(logs.map((l) => cols.map((c) => esc(l[c])).join(','))).join('\n') + '\n';
}
