import { hashCode, isExpired, normalizeCode } from './codes';
import { instructionText, parseConfig } from './config';
import { buildExport } from './export';
import { cryptoSeed, mulberry32 } from './rng';
import { Session } from './session';
import type { Screen } from './session';
import { stimulusSvg } from './symbols';
import {
  clearActiveSession,
  clearLocalRun,
  downloadBytes,
  downloadText,
  getScript,
  loadActiveSession,
  loadCodes,
  loadLocalRun,
  resolveEndpoint,
  saveActiveSession,
  saveCodes,
  uploadResults,
} from './storage';
import type { ExperimentConfig } from './types';
import { shell } from './shell';

type Phase = 'code' | 'instruction' | 'run';

export function mountParticipant(root: HTMLElement): () => void {
  const configHolder: { config: ExperimentConfig | null; number: number; hash: string } = {
    config: null,
    number: 0,
    hash: '',
  };
  let session: Session | null = null;
  let timer = 0;
  let phase: Phase = 'code';
  let uiLanguage: 'no' | 'en' = 'no';
  let languageChosen = false;
  let downloaded = false;
  let uploadNote = '';
  let codeError = '';
  const listeners: Array<[EventTarget, string, EventListener]> = [];

  const on = (target: EventTarget, type: string, listener: EventListener) => {
    target.addEventListener(type, listener);
    listeners.push([target, type, listener]);
  };

  const clock = () => {
    const epoch = Date.now();
    const mark = performance.now();
    return () => epoch + (performance.now() - mark);
  };

  const persist = () => {
    if (!session || !configHolder.config) return;
    saveActiveSession(session.serialize(Date.now()));
  };

  const arm = () => {
    window.clearTimeout(timer);
    const wait = session?.pendingWaitMs();
    if (wait === null || wait === undefined) return;
    timer = window.setTimeout(() => session?.completeWait(), wait);
  };

  const finishIfNeeded = () => {
    if (!session?.finished || !configHolder.config || downloaded) return;
    downloaded = true;
    const bundle = buildExport(configHolder.number, configHolder.config, session.trials, session.events);
    downloadBytes(
      `${bundle.filenameBase}.xlsx`,
      bundle.xlsx,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    window.setTimeout(() => {
      downloadText(`${bundle.filenameBase}.csv`, bundle.csv, 'text/csv;charset=utf-8');
    }, 400);
    window.setTimeout(() => {
      if (bundle.eventsCsv.trim()) {
        downloadText(`${bundle.filenameBase}_hendelser.csv`, bundle.eventsCsv, 'text/csv;charset=utf-8');
      }
    }, 800);
    const codes = loadCodes();
    const local = codes.find((item) => item.hash === configHolder.hash);
    if (local) {
      local.completed = true;
      saveCodes(codes);
    }
    void (async () => {
      const endpoint = await resolveEndpoint();
      if (!endpoint.scriptUrl || !configHolder.hash || !configHolder.config || !session) {
        uploadNote = configHolder.config?.language === 'en'
          ? 'A copy was downloaded to this computer.'
          : 'En kopi er lastet ned til denne maskinen.';
        render();
        return;
      }
      const result = await uploadResults({
        scriptUrl: endpoint.scriptUrl,
        hash: configHolder.hash,
        project: configHolder.config.studyId,
        middle: endpoint.middle,
        participantNumber: configHolder.number,
        config: configHolder.config,
        trials: session.trials,
        events: session.events,
        final: true,
      });
      uploadNote = result.ok
        ? (configHolder.config.language === 'en'
          ? 'Saved. A copy was also downloaded to this computer.'
          : 'Lagret. En kopi er også lastet ned til denne maskinen.')
        : (configHolder.config.language === 'en'
          ? `The server did not store the file (${result.detail}). Use the downloaded copy.`
          : `Tjeneren lagret ikke filen (${result.detail}). Bruk den nedlastede kopien.`);
      render();
    })();
    clearActiveSession();
    clearLocalRun();
  };

  const sync = () => {
    persist();
    arm();
    finishIfNeeded();
    render();
  };

  const wireGuards = () => {
    on(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') session?.noteAway('hidden');
      else session?.noteBack('visible');
    });
    on(window, 'blur', () => {
      const left = document.visibilityState === 'hidden' || !document.fullscreenElement;
      session?.noteAway('blur', left);
    });
    on(window, 'focus', () => session?.noteBack('focus'));
    on(document, 'fullscreenchange', () => {
      if (!document.fullscreenElement) session?.noteAway('fullskjerm_av');
      else session?.noteBack('fullskjerm_på');
    });
    on(window, 'beforeunload', (event) => {
      if (!session || session.finished) return;
      session.attemptClose();
      persist();
      event.preventDefault();
      (event as BeforeUnloadEvent).returnValue = '';
    });
  };

  const begin = async (resume: boolean) => {
    if (!configHolder.config) return;
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch {
      codeError = configHolder.config.language === 'en'
        ? 'Fullscreen is required. Click again and allow fullscreen.'
        : 'Fullskjerm er nødvendig. Klikk igjen og godta fullskjerm.';
      render();
      return;
    }
    const now = clock();
    phase = 'run';
    const saved = loadActiveSession();
    if (resume && saved && saved.participantNumber === configHolder.number && !saved.finished) {
      session = Session.restore(saved, mulberry32(cryptoSeed()), now, sync);
    } else {
      clearActiveSession();
      session = new Session(configHolder.config, configHolder.number, mulberry32(cryptoSeed()), now, sync);
      session.start();
    }
    wireGuards();
    sync();
  };

  const renderFigure = (stimulus: string) => {
    const config = configHolder.config;
    if (!config) return '';
    return `<div class="figure">${stimulusSvg(stimulus, config.symbolAssignment, config.customStimuli)}</div>`;
  };

  const renderScreen = (screen: Screen) => {
    const config = configHolder.config;
    if (!config) return;
    const en = config.language === 'en';
    if (screen.type === 'sample') {
      root.innerHTML = `<div class="stage sample-only">${renderFigure(screen.stimulus).replace(
        'class="figure"',
        'class="figure sample-slot"',
      )}</div>`;
      root.querySelector('.sample-slot')?.addEventListener('click', () => session?.clickSample());
      return;
    }
    if (screen.type === 'choice') {
      const corners = screen.options
        .map((option) => {
          const css = option.corner === 'øv' ? 'ov' : option.corner === 'øh' ? 'oh' : option.corner === 'nv' ? 'nv' : 'nh';
          return `<div class="corner ${css}"><button type="button" data-stimulus="${option.stimulus}" data-corner="${option.corner}">${renderFigure(option.stimulus)}</button></div>`;
        })
        .join('');
      const sample = screen.sample
        ? renderFigure(screen.sample).replace('class="figure"', 'class="figure sample-slot"')
        : '';
      root.innerHTML = `<div class="stage choice">${sample}${corners}</div>`;
      if (screen.sample) {
        root.querySelector('.sample-slot')?.addEventListener('click', () => session?.clickSample());
      }
      root.querySelectorAll<HTMLButtonElement>('.corner button').forEach((button) => {
        button.addEventListener('click', () => {
          const stimulus = button.dataset.stimulus ?? '';
          const corner = button.dataset.corner as 'øv' | 'øh' | 'nv' | 'nh';
          session?.clickComparison(stimulus, corner);
        });
      });
      return;
    }
    if (screen.type === 'feedback') {
      root.innerHTML = `<div class="stage"><div class="feedback-word">${escapeText(screen.text)}</div></div>`;
      return;
    }
    if (screen.type === 'delay' || screen.type === 'iti') {
      root.innerHTML = `<div class="stage blank"></div>`;
      return;
    }
    if (screen.type === 'pause') {
      const message = screen.reason === 'fullscreen'
        ? (en ? 'Go back to fullscreen. Click anywhere.' : 'Gå tilbake til fullskjerm. Klikk hvor som helst.')
        : (en ? 'Come back to this tab. Click anywhere to continue.' : 'Gå tilbake til fanen. Klikk hvor som helst for å fortsette.');
      root.innerHTML = `<div class="stage"><div class="pause-screen"><h1>${message}</h1></div></div>`;
      root.querySelector('.stage')?.addEventListener('click', () => {
        void (async () => {
          if (!document.fullscreenElement) {
            try {
              await document.documentElement.requestFullscreen();
            } catch {
              return;
            }
          }
          session?.resume();
        })();
      });
      return;
    }
    if (screen.type === 'done') {
      root.innerHTML = `<div class="stage"><div class="done-screen">
        <h1>${en ? 'Thank you. The task is finished.' : 'Takk. Oppgaven er ferdig.'}</h1>
        <p>${escapeText(uploadNote || (en ? 'A copy is being downloaded to this computer.' : 'En kopi lastes ned til denne maskinen.'))}</p>
        <div class="row-buttons">
          <button type="button" class="solid" id="again-xlsx">${en ? 'Download Excel' : 'Last ned Excel'}</button>
          <button type="button" class="ghost" id="again-csv">${en ? 'Download CSV' : 'Last ned CSV'}</button>
        </div>
      </div></div>`;
      const bundle = () => buildExport(configHolder.number, config, session?.trials ?? [], session?.events ?? []);
      root.querySelector('#again-xlsx')?.addEventListener('click', () => {
        const file = bundle();
        downloadBytes(file.filenameBase + '.xlsx', file.xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      });
      root.querySelector('#again-csv')?.addEventListener('click', () => {
        const file = bundle();
        downloadText(file.filenameBase + '.csv', file.csv, 'text/csv;charset=utf-8');
      });
    }
  };

  const render = () => {
    if (phase === 'run' && session) {
      renderScreen(session.screen);
      return;
    }
    const config = configHolder.config;
    const en = (config?.language ?? uiLanguage) === 'en';
    if (phase === 'instruction' && config) {
      const saved = loadActiveSession();
      const canResume = Boolean(saved && saved.participantNumber === configHolder.number && !saved.finished);
      root.innerHTML = `<div class="stage" id="start-stage">
        <div class="lang">
          <button type="button" data-lang="no" aria-pressed="${config.language === 'no'}">Norsk</button>
          <button type="button" data-lang="en" aria-pressed="${config.language === 'en'}">English</button>
        </div>
        <div class="instruction" id="instruction"></div>
        ${canResume ? `<div class="row-buttons" style="position:absolute;bottom:8vh;left:0;right:0;justify-content:center">
          <button type="button" class="ghost" id="resume">${en ? 'Continue the unfinished session' : 'Fortsett den uferdige økten'}</button>
        </div>` : ''}
        ${codeError ? `<p class="warn" style="position:absolute;bottom:4vh;left:0;right:0;text-align:center">${escapeText(codeError)}</p>` : ''}
      </div>`;
      const text = root.querySelector('#instruction');
      if (text) text.textContent = instructionText(config);
      root.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          config.language = button.dataset.lang === 'en' ? 'en' : 'no';
          uiLanguage = config.language;
          languageChosen = true;
          render();
        });
      });
      root.querySelector('#resume')?.addEventListener('click', (event) => {
        event.stopPropagation();
        void begin(true);
      });
      root.querySelector('#start-stage')?.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        if (target.closest('button')) return;
        void begin(false);
      });
      return;
    }
    root.innerHTML = `${shell('deltaker')}<div class="stage loose"><div class="code-screen">
      <div class="lang">
        <button type="button" data-lang="no" aria-pressed="${uiLanguage === 'no'}">Norsk</button>
        <button type="button" data-lang="en" aria-pressed="${uiLanguage === 'en'}">English</button>
      </div>
      <h1>${en ? 'Enter your code' : 'Skriv inn koden'}</h1>
      <form id="code-form">
        <input id="code" name="code" autocomplete="off" autocapitalize="characters" inputmode="text" />
        <div class="row-buttons" style="justify-content:center">
          <button class="solid" type="submit">${en ? 'Continue' : 'Fortsett'}</button>
        </div>
      </form>
      ${codeError ? `<p class="warn">${escapeText(codeError)}</p>` : ''}
    </div></div>`;
    root.querySelector('#code-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = (root.querySelector('#code') as HTMLInputElement | null)?.value ?? '';
      void resolve(value);
    });
    root.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((button) => {
      button.addEventListener('click', () => {
        uiLanguage = button.dataset.lang === 'en' ? 'en' : 'no';
        languageChosen = true;
        render();
      });
    });
  };

  const resolve = async (raw: string) => {
    const normalized = normalizeCode(raw);
    if (normalized.length < 6) {
      codeError = 'Koden er ikke gyldig.';
      render();
      return;
    }
    const hash = await hashCode(normalized);
    const local = loadCodes().find((item) => item.hash === hash);
    if (local) {
      if (isExpired(local.expiresAt, Date.now())) {
        codeError = 'Koden er utløpt.';
        render();
        return;
      }
      if (local.completed) {
        codeError = 'Koden er allerede brukt.';
        render();
        return;
      }
      configHolder.config = parseConfig(local.config);
      if (languageChosen) configHolder.config.language = uiLanguage;
      configHolder.number = local.participantNumber;
      configHolder.hash = hash;
      phase = 'instruction';
      codeError = '';
      render();
      return;
    }
    const endpoint = await resolveEndpoint();
    if (!endpoint.scriptUrl) {
      codeError = 'Koden finnes ikke på denne maskinen, og ingen lagringstjener er satt opp.';
      render();
      return;
    }
    try {
      const result = await getScript(endpoint.scriptUrl, { action: 'redeem', hash });
      if (result.ok !== true) {
        codeError = String(result.error ?? 'Koden ble ikke godtatt.');
        render();
        return;
      }
      configHolder.config = parseConfig(result.config);
      if (languageChosen) configHolder.config.language = uiLanguage;
      configHolder.number = Number(result.participantNumber);
      configHolder.hash = hash;
      phase = 'instruction';
      codeError = '';
      render();
    } catch (error) {
      codeError = error instanceof Error ? error.message : 'Kunne ikke kontakte lagringstjeneren.';
      render();
    }
  };

  const boot = () => {
    const hash = location.hash;
    if (hash.startsWith('#/deltaker/lokal')) {
      const run = loadLocalRun();
      if (run) {
        configHolder.config = parseConfig(run.config);
        configHolder.number = run.participantNumber;
        phase = 'instruction';
        render();
        return;
      }
    }
    const match = hash.match(/#\/kode\/([A-Za-z0-9-]+)/);
    const query = new URLSearchParams(location.search).get('kode');
    const code = match?.[1] ?? query ?? '';
    if (code) {
      void resolve(code);
      return;
    }
    render();
  };

  boot();
  return () => {
    window.clearTimeout(timer);
    for (const [target, type, listener] of listeners) target.removeEventListener(type, listener);
    root.innerHTML = '';
  };
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
