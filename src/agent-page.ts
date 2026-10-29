import { stimulusMarkup } from './abstract-symbols';
import './agents/custom';
import { hashCode } from './codes';
import { parseConfig } from './config';
import { buildExport } from './export';
import { agentMetadata, tracesToJsonl } from './agents/meta';
import { createAgentPlugin, type AgentBuild } from './agents/builtin';
import { runAgentSession } from './agents/driver';
import { agentModeAllowed, loadAgentLaunch, type AgentLaunch, type Pace } from './agents/launch';
import type { ObserverSnapshot } from './agents/stats';
import { shell } from './shell';
import {
  downloadBytes,
  downloadText,
  loadSessionToken,
  loadSettings,
  postScript,
  resolveEndpoint,
  uploadResults,
} from './storage';

export function mountAgent(root: HTMLElement): () => void {
  const settings = loadSettings();
  if (!agentModeAllowed(settings.middle)) {
    root.innerHTML = `<div class="setup">${shell('agent', 'MTS-lab · Agent')}
      <section class="card"><h2>Agentmodus er av</h2>
        <p>Agenten kan bare kjøre når lagringsmappen er Boter-AI. Velg den mappen under Oppsett. Menneskeøkter er uendret.</p>
        <p><a href="#/oppsett">Til oppsett</a></p>
      </section></div>`;
    return () => { root.innerHTML = ''; };
  }
  const launch = loadAgentLaunch();
  if (!launch) {
    root.innerHTML = `<div class="setup">${shell('agent', 'MTS-lab · Agent')}
      <section class="card"><h2>Ingen agentøkt er klargjort</h2>
        <p>Velg agent under Oppsett og trykk «Kjør agent i nettleseren».</p>
        <p><a href="#/oppsett">Til oppsett</a></p>
      </section></div>`;
    return () => { root.innerHTML = ''; };
  }
  const config = parseConfig({ ...launch.config, stimulusSet: 'abstrakte' });
  const control = {
    paused: false,
    armedStep: false,
    stopped: false,
    pace: launch.pace,
    wait: null as (() => void) | null,
    notify() {
      this.wait?.();
      this.wait = null;
    },
  };
  let running = false;
  let published = false;
  root.innerHTML = `<div class="agent-lab">${shell('agent', 'MTS-lab · observatør')}
    <p class="hint" id="agent-path"></p>
    <div class="actions">
      <button type="button" class="solid" id="agent-start">Start</button>
      <button type="button" class="ghost" id="agent-pause" hidden>Pause</button>
      <button type="button" class="ghost" id="agent-step" hidden>Steg</button>
      <label class="field">Tempo
        <select id="agent-live-pace">
          <option value="rask" ${launch.pace === 'rask' ? 'selected' : ''}>Rask</option>
          <option value="sanntid" ${launch.pace === 'sanntid' ? 'selected' : ''}>Sanntid</option>
        </select>
      </label>
      <button type="button" class="ghost" id="agent-stop" hidden>Stopp</button>
    </div>
    <p id="agent-status" role="status">Klar. ${esc(launch.agentType)}, seed ${launch.seed}. Mastery ${config.masteryNumerator}/${config.masteryDenominator} i én blokk.</p>
    <div class="agent-grid">
      <section class="card" id="agent-now"></section>
      <section class="card" id="agent-curve"></section>
      <section class="card" id="agent-mastery"></section>
      <section class="card" id="agent-probes"></section>
      <section class="card" id="agent-pos"></section>
    </div>
    <section class="card" id="agent-log"></section>
    <p class="hint" id="agent-note"></p>
  </div>`;
  const path = root.querySelector('#agent-path');
  if (path) path.textContent = `Min disk / Boter-AI / ${config.studyId || 'mts'} / ${launch.participantNumber} /`;
  root.querySelector('#agent-live-pace')?.addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value;
    control.pace = value === 'sanntid' ? 'sanntid' : 'rask';
  });
  root.querySelector('#agent-pause')?.addEventListener('click', () => {
    control.paused = true;
    control.armedStep = false;
    const status = root.querySelector('#agent-status');
    if (status && !status.textContent?.startsWith('Ferdig') && !status.textContent?.startsWith('Ikke')) {
      status.textContent = 'Pause.';
    }
  });
  root.querySelector('#agent-step')?.addEventListener('click', () => {
    control.armedStep = true;
    control.paused = false;
    control.notify();
  });
  root.querySelector('#agent-stop')?.addEventListener('click', () => {
    control.stopped = true;
    control.notify();
  });
  root.querySelector('#agent-start')?.addEventListener('click', () => {
    if (running) return;
    running = true;
    root.querySelector('#agent-start')?.setAttribute('hidden', '');
    root.querySelector('#agent-pause')?.removeAttribute('hidden');
    root.querySelector('#agent-step')?.removeAttribute('hidden');
    root.querySelector('#agent-stop')?.removeAttribute('hidden');
    void run(launch, config, control, root, () => published, (value) => { published = value; });
  });
  return () => {
    control.stopped = true;
    control.notify();
    root.innerHTML = '';
  };
}

async function run(
  launch: AgentLaunch,
  config: ReturnType<typeof parseConfig>,
  control: {
    paused: boolean;
    armedStep: boolean;
    stopped: boolean;
    pace: Pace;
    wait: (() => void) | null;
    notify: () => void;
  },
  root: HTMLElement,
  published: () => boolean,
  setPublished: (value: boolean) => void,
): Promise<void> {
  let agent;
  try {
    agent = createAgentPlugin(launch.agentType, buildFrom(launch));
  } catch (error) {
    const status = root.querySelector('#agent-status');
    if (status) status.textContent = error instanceof Error ? error.message : 'Agenten kunne ikke startes.';
    return;
  }
  const result = await runAgentSession({
    config,
    participantNumber: launch.participantNumber,
    seed: launch.seed,
    agent,
    limits: { maxBlocks: launch.maxBlocks, maxTrials: launch.maxTrials },
    pace: launch.pace,
    revealCorrection: launch.revealCorrection,
    getPace: () => control.pace,
    shouldStop: () => control.stopped,
    beforeTrial: async () => {
      if (control.stopped) return;
      if (control.armedStep) {
        control.armedStep = false;
        control.paused = true;
        return;
      }
      while (control.paused && !control.stopped) {
        await new Promise<void>((resolve) => { control.wait = resolve; });
      }
    },
    onView: (view) => paint(root, view),
    yieldFrame: () => new Promise((resolve) => setTimeout(resolve, 0)),
  });
  if (published()) return;
  setPublished(true);
  await publish(root, config, result);
}

function buildFrom(launch: AgentLaunch): AgentBuild {
  return {
    seed: launch.seed,
    memoryMode: launch.memoryMode,
    memoryN: launch.memoryN,
    gamma: launch.gamma,
    derivedMode: launch.derivedMode,
    neVariant: launch.neVariant,
  };
}

function paint(root: HTMLElement, view: ObserverSnapshot): void {
  const status = root.querySelector('#agent-status');
  if (status) {
    status.textContent = view.finished
      ? endText(view.endReason, view.message)
      : `Blokk ${view.block} av maks ${view.maxBlocks} · ${view.phase || 'start'} · nedtrapping ${view.thinning} % · forsøk ${view.trialNr}`;
  }
  const now = root.querySelector('#agent-now');
  if (now) now.innerHTML = nowHtml(view);
  const curve = root.querySelector('#agent-curve');
  if (curve) curve.innerHTML = `<h2>Læringskurve</h2>${curveSvg(view)}<p class="hint">Glidende andel siste 18 programmerte: ${view.rolling === null ? '–' : `${Math.round(view.rolling * 1000) / 10} %`}. Linje ved ${view.masteryLine} (${view.masteryLabel}).</p>`;
  const mastery = root.querySelector('#agent-mastery');
  if (mastery) mastery.innerHTML = masteryHtml(view);
  const probes = root.querySelector('#agent-probes');
  if (probes) probes.innerHTML = probeHtml(view);
  const pos = root.querySelector('#agent-pos');
  if (pos) pos.innerHTML = posHtml(view);
  const log = root.querySelector('#agent-log');
  if (log) log.innerHTML = logHtml(view);
}

function endText(reason: string | null, message: string): string {
  const label = reason === 'ferdig' ? 'Ferdig.'
    : reason === 'ikke_mestret' ? 'Ikke mestret.'
      : reason === 'avbrutt' ? 'Avbrutt.'
        : 'Agentfeil.';
  return message ? `${label} ${message}` : label;
}

function nowHtml(view: ObserverSnapshot): string {
  const current = view.current;
  if (!current) return '<h2>Nå-trial</h2><p class="hint">Venter på første forsøk.</p>';
  const corners = ['øv', 'øh', 'nv', 'nh'].map((corner) => {
    const slot = current.slots.find((item) => item.corner === corner);
    if (!slot) return `<div class="corner ${cornerClass(corner)} empty"><span>tomt</span></div>`;
    const mark = slot.chosen ? (current.correct === true ? 'hit' : current.correct === false ? 'miss' : 'picked') : '';
    return `<div class="corner ${cornerClass(corner)} ${mark}">${figure(slot.id)}<small>${slot.position}</small></div>`;
  }).join('');
  const feedback = current.feedbackGiven ? esc(current.feedbackWord) : 'ingen tilbakemelding';
  return `<h2>Nå-trial</h2>
    <div class="agent-board">
      <div class="agent-sample">${figure(current.sampleId)}</div>
      ${corners}
    </div>
    <p>${esc(current.relation)} · ${esc(current.phase)} · blokk ${current.block} · ${current.thinning} % · ${esc(current.relationType)}${current.correction ? ' · korreksjon' : ''}</p>
    <p>${feedback}${current.latencyMs !== null ? ` · ${current.latencyMs} ms` : ''}${current.route ? ` · ${esc(current.route)}` : ''}</p>`;
}

function curveSvg(view: ObserverSnapshot): string {
  const points = view.curve;
  const width = 420;
  const height = 180;
  const left = 28;
  const bottom = 24;
  const plotW = width - left - 8;
  const plotH = height - bottom - 16;
  const yMax = Math.max(view.masteryLine, ...points.map((point) => point.n), 1);
  const lineY = height - bottom - (view.masteryLine / yMax) * plotH;
  const step = points.length > 1 ? plotW / (points.length - 1) : plotW;
  const coords = points.map((point, index) => {
    const x = left + (points.length === 1 ? plotW / 2 : index * step);
    const y = height - bottom - (point.correct / yMax) * plotH;
    return `${x},${y}`;
  });
  return `<svg class="curve" viewBox="0 0 ${width} ${height}" role="img" aria-label="Læringskurve">
    <line x1="${left}" y1="${lineY}" x2="${width - 8}" y2="${lineY}" stroke="#7a1f1f" stroke-dasharray="4 3"/>
    <line x1="${left}" y1="12" x2="${left}" y2="${height - bottom}" stroke="#141414"/>
    <line x1="${left}" y1="${height - bottom}" x2="${width - 8}" y2="${height - bottom}" stroke="#141414"/>
    ${coords.length ? `<polyline fill="none" stroke="#141414" stroke-width="2" points="${coords.join(' ')}"/>` : ''}
  </svg>`;
}

function masteryHtml(view: ObserverSnapshot): string {
  const rows = view.mastery.map((row) => `<tr><td>${row.percent} %</td><td>${row.passed ? 'nådd' : row.attempts ? 'pågår' : '–'}</td><td>${row.attempts ? `${row.bestCorrect}/${row.bestN}` : '–'}</td><td>${row.currentN ? `${row.currentCorrect}/${row.currentN}` : '–'}</td></tr>`).join('');
  return `<h2>Mastery</h2><table class="codes"><thead><tr><th>Nedtrapping</th><th></th><th>Beste blokk</th><th>Siste</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function probeHtml(view: ObserverSnapshot): string {
  const rows = view.probes.map((row) => {
    const ratio = row.n === 0 ? '–/–' : `${row.correct}/${row.n}`;
    const p = row.p === null ? '–' : row.p < 0.001 ? row.p.toExponential(1) : row.p.toFixed(3);
    return `<tr><td>${row.label}</td><td>${esc(row.kind)}</td><td data-probe="${row.label}">${ratio}</td><td>${p}</td></tr>`;
  }).join('');
  return `<h2>Prober</h2><table class="codes"><thead><tr><th></th><th>Familie</th><th>Riktig</th><th>p mot sjanse</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function posHtml(view: ObserverSnapshot): string {
  const answers = view.positions.map((row) => `${row.position}: ${row.n}`).join(' · ');
  const corners = view.sPlus.map((row) => `${row.corner} ${row.n ? `${row.correct}/${row.n}` : '–'}`).join(' · ');
  return `<h2>Posisjon</h2><p>Svar posisjon ${answers || '–'}</p><p>Riktig når S+ i ${corners}</p>`;
}

function logHtml(view: ObserverSnapshot): string {
  const rows = [...view.log].reverse().map((row) => `<tr><td>${row.nr}</td><td>${esc(row.relation)}</td><td>${row.position ?? '–'}</td><td>${esc(row.chosen || '–')}</td><td>${row.invalid ? 'ugyldig' : row.correct ? 'riktig' : 'feil'}</td><td>${row.feedback ? esc(row.feedback) : '–'}</td><td>${row.correction ? 'ja' : ''}</td></tr>`).join('');
  return `<h2>Siste forsøk</h2><table class="codes"><thead><tr><th>Nr</th><th>Relasjon</th><th>Pos</th><th>Valgt</th><th></th><th>Tilbakemelding</th><th>Korr.</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function publish(
  root: HTMLElement,
  config: ReturnType<typeof parseConfig>,
  result: Awaited<ReturnType<typeof runAgentSession>>,
): Promise<void> {
  const note = root.querySelector('#agent-note');
  const bundle = buildExport(result.exportMeta.participantNumber, config, result.session.trials, result.session.events, result.exportMeta);
  const base = `${bundle.filenameBase}`;
  downloadBytes(`${base}.xlsx`, bundle.xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  window.setTimeout(() => downloadText(`${base}.csv`, bundle.csv, 'text/csv;charset=utf-8'), 400);
  window.setTimeout(() => downloadText(`${base}_hendelser.csv`, bundle.eventsCsv, 'text/csv;charset=utf-8'), 800);
  window.setTimeout(() => downloadText(`${base}_agent.json`, JSON.stringify(agentMetadata(result.exportMeta), null, 2), 'application/json'), 1200);
  window.setTimeout(() => downloadText(`${base}_agentspor.jsonl`, tracesToJsonl(result.exportMeta.traces), 'application/jsonl'), 1600);
  const token = loadSessionToken();
  const endpoint = await resolveEndpoint();
  if (!token || !endpoint.scriptUrl) {
    if (note) note.textContent = 'Lastet ned på denne maskinen. Filen er merket Boter-AI. Drive krever innlogging, og Apps Script er ikke endret i denne versjonen.';
    return;
  }
  try {
    const registered = await postScript(endpoint.scriptUrl, {
      action: 'register',
      token,
      project: config.studyId,
      middle: 'Boter-AI',
      config,
    });
    if (registered.ok !== true || typeof registered.code !== 'string') {
      if (note) note.textContent = `Nedlastet. Drive avslo registrering (${String(registered.error ?? 'ukjent')}).`;
      return;
    }
    const hash = await hashCode(registered.code);
    const uploaded = await uploadResults({
      scriptUrl: endpoint.scriptUrl,
      hash,
      project: config.studyId,
      middle: 'Boter-AI',
      participantNumber: result.exportMeta.participantNumber,
      config,
      trials: result.session.trials,
      events: result.session.events,
      final: true,
      agent: result.exportMeta,
    });
    if (note) {
      note.textContent = uploaded.ok
        ? 'Lagret i Boter-AI. En kopi er også lastet ned. Agentspor ligger i Excel-fanen Agent og i jsonl-filen.'
        : `Nedlastet. Drive lagret ikke filen (${uploaded.detail}).`;
    }
  } catch (error) {
    if (note) note.textContent = error instanceof Error ? error.message : 'Nedlastet. Opplasting feilet.';
  }
}

function figure(id: string): string {
  return stimulusMarkup(id, { stimulusSet: 'abstrakte', symbolAssignment: {}, customStimuli: {} });
}

function cornerClass(corner: string): string {
  if (corner === 'øv') return 'ov';
  if (corner === 'øh') return 'oh';
  if (corner === 'nv') return 'nv';
  return 'nh';
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
