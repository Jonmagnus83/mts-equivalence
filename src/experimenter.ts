import { formatCode, generateParticipantNumber, hashCode, participantLink } from './codes';
import { storageFolder } from './folders';
import { assignSymbols, parseConfig } from './config';
import { formatRatio, jonTestRequired, literatureRequired, requiredCorrect } from './criteria';
import { cryptoSeed, mulberry32 } from './rng';
import { shell } from './shell';
import { stimulusSvg } from './symbols';
import { planSizes } from './trials';
import {
  clearSessionToken,
  downloadText,
  loadCodes,
  loadEndpointFile,
  loadSavedConfig,
  loadSessionToken,
  loadSettings,
  loginExperimenter,
  postScript,
  resolveEndpoint,
  saveCodes,
  saveConfig,
  saveLocalRun,
  saveSettings,
  type StoredCode,
} from './storage';
import type { ExperimentConfig } from './types';
import { memberLetter } from './relations';

export function mountExperimenter(root: HTMLElement): () => void {
  let config = parseConfig(loadSavedConfig() ?? undefined);
  let settings = loadSettings();
  let message = '';
  let readyLink = '';
  let loginError = '';
  let offlineUnlocked = location.protocol === 'file:';

  const persist = () => {
    saveConfig(config);
    saveSettings(settings);
  };

  const read = () => {
    const value = (id: string) => (root.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null)?.value ?? '';
    const checked = (id: string) => (root.querySelector(`#${id}`) as HTMLInputElement | null)?.checked ?? false;
    const thinning = value('thinning')
      .split(/[^0-9]+/)
      .filter(Boolean)
      .map((part) => Number(part));
    const picture = value('pictureMember');
    config = parseConfig({
      ...config,
      studyId: value('studyId'),
      groupCode: value('groupCode'),
      language: value('language') === 'en' ? 'en' : 'no',
      instructionNo: value('instructionNo'),
      instructionEn: value('instructionEn'),
      stimulusMode: value('stimulusMode') === 'upload' ? 'upload' : 'builtin',
      classes: Number(value('classes')),
      members: Number(value('members')),
      pictureMember: picture === '' ? null : Number(picture),
      structure: value('structure'),
      trialMultiplier: Number(value('trialMultiplier')),
      masteryNumerator: Number(value('masteryNumerator')),
      masteryDenominator: Number(value('masteryDenominator')),
      thinning,
      serialIntroduction: checked('serialIntroduction'),
      feedbackWordsNo: value('feedbackWordsNo').split(',').map((word) => word.trim()).filter(Boolean),
      feedbackDurationMs: Number(value('feedbackDurationMs')),
      wrongFeedback: value('wrongFeedback'),
      correction: checked('correction'),
      correctionMaxRepeats: Number(value('correctionMaxRepeats')),
      mtsType: value('mtsType') === 'delayed' ? 'delayed' : 'simultaneous',
      delaySeconds: Number(value('delaySeconds')),
      itiSeconds: Number(value('itiSeconds')),
      sampleClicks: Number(value('sampleClicks')),
      positionBalance: value('positionBalance') === 'free' ? 'free' : 'constrained',
      maxConsecutiveSPlus: Number(value('maxConsecutiveSPlus')),
      testSymmetry: checked('testSymmetry'),
      testTransitivity: checked('testTransitivity'),
      testEquivalence: checked('testEquivalence'),
      testBaseline: checked('testBaseline'),
      testReflexivity: checked('testReflexivity'),
      reflexivityAsPretest: checked('reflexivityAsPretest'),
      testMultiplier: Number(value('testMultiplier')),
      customStimuli: config.customStimuli,
      excludedSymbols: config.excludedSymbols,
      symbolAssignment: config.symbolAssignment,
    });
    config.symbolAssignment = assignSymbols(config);
    const pressed = root.querySelector<HTMLButtonElement>('.folder-toggle [aria-pressed="true"]');
    settings = {
      scriptUrl: value('scriptUrl').trim(),
      secret: settings.secret,
      middle: storageFolder(pressed?.dataset.folder ?? settings.middle),
    };
    persist();
  };

  const summary = () => {
    const plan = planSizes(config);
    const need = requiredCorrect(plan.trialsPerTrainingBlock, config.masteryNumerator, config.masteryDenominator);
    const lines = [
      `Baselinerelasjoner: ${plan.trainingRelations}.`,
      `Treningsblokk: ${plan.trialsPerTrainingBlock} forsøk. Kriterium ${formatRatio(need, plan.trialsPerTrainingBlock)}.`,
      `Blokken gjentas med ny rekkefølge og nye posisjoner til kriteriet er nådd.`,
      `Nedtrapping: ${config.thinning.join(' → ')} %. Avrunding: 75 % av 18 er 14 forsøk.`,
    ];
    const labels: Record<string, string> = {
      baseline: 'Baseline i test',
      symmetri: 'Symmetri',
      transitivitet: 'Transitivitet',
      ekvivalens: 'Ekvivalens',
      refleksivitet: 'Refleksivitet',
    };
    for (const kind of ['symmetri', 'transitivitet', 'ekvivalens', 'baseline', 'refleksivitet'] as const) {
      const n = plan.testCounts[kind];
      if (!n) continue;
      const where = kind === 'refleksivitet' && config.reflexivityAsPretest ? 'forhåndstest' : 'blandet test';
      lines.push(
        `${labels[kind]} (${where}): ${n} forsøk. > 95 % = ${jonTestRequired(n)}/${n}. Litteratur 17/18 = ${literatureRequired(n)}/${n}.`,
      );
    }
    lines.push(`Testblokk uten tilbakemelding: ${plan.testTotal} forsøk.`);
    if (config.classes !== 3) {
      lines.push('Med tre klasser står sammenligningene i tre av fire hjørner. Med to klasser er to hjørner tomme. Med fire klasser er alle hjørner i bruk.');
    }
    return lines.map((line) => `<p>${line}</p>`).join('');
  };

  const stimuli = () => {
    const cells: string[] = [];
    for (let member = 0; member < config.members; member++) {
      for (let classIndex = 0; classIndex < config.classes; classIndex++) {
        const id = `${memberLetter(member)}${classIndex + 1}`;
        const picture = config.pictureMember === member;
        cells.push(`<div class="cell">
          <strong>${id}${picture ? ' · bilde' : ''}</strong>
          <div class="figure">${stimulusSvg(id, config.symbolAssignment, config.customStimuli)}</div>
          <input type="file" accept="image/*" data-upload="${id}" />
        </div>`);
      }
    }
    return cells.join('');
  };

  const codesTable = () => {
    const codes = loadCodes().filter((item) => item.config.studyId === config.studyId);
    if (codes.length === 0) return '<p>Ingen koder på denne maskinen ennå.</p>';
    const rows = codes
      .slice()
      .reverse()
      .map((item) => `<tr>
        <td><code>${formatCode(item.code)}</code></td>
        <td>${item.participantNumber}</td>
        <td>${new Date(item.expiresAt).toLocaleString('nb-NO')}</td>
        <td>${item.completed ? 'ferdig' : 'aktiv'}</td>
      </tr>`)
      .join('');
    return `<table class="codes"><thead><tr><th>Kode</th><th>Nummer</th><th>Utløper</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  };

  const renderLogin = () => {
    root.innerHTML = `<div class="setup">${shell('oppsett', 'MTS-lab · Eksperimentoppsett')}
      <form class="cards" id="login-form">
        <section class="card">
          <h2><span class="num">·</span> Innlogging</h2>
          <p class="hint">Brukernavn og passord sjekkes i Apps Script. Den statiske siden lagrer ikke passordet. Deltakerlenken trenger ikke dette passordet.</p>
          <div class="fields">
            ${field('scriptUrl', 'Apps Script-adresse (/exec)', settings.scriptUrl)}
            ${field('username', 'Brukernavn', '')}
            <label class="field">Passord
              <input id="password" type="password" autocomplete="current-password" />
            </label>
          </div>
          <div class="actions">
            <button class="solid" type="submit">Logg inn</button>
            <button class="ghost" type="button" id="offline-only">Fortsett uten nett</button>
          </div>
          <p class="warn">${escapeText(loginError)}</p>
          <p class="hint">Uten nett virker bare «Start økt på denne maskinen». Lenken til en annen PC krever innlogging og Apps Script.</p>
        </section>
      </form>
    </div>`;
    root.querySelector('#login-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const url = (root.querySelector('#scriptUrl') as HTMLInputElement | null)?.value.trim() ?? '';
      const username = (root.querySelector('#username') as HTMLInputElement | null)?.value.trim() ?? '';
      const password = (root.querySelector('#password') as HTMLInputElement | null)?.value ?? '';
      settings.scriptUrl = url;
      saveSettings(settings);
      void loginExperimenter(url, username, password)
        .then(() => {
          loginError = '';
          render();
        })
        .catch((error: unknown) => {
          loginError = error instanceof Error ? error.message : 'Innlogging feilet.';
          renderLogin();
        });
    });
    root.querySelector('#offline-only')?.addEventListener('click', () => {
      offlineUnlocked = true;
      render();
    });
  };

  const render = () => {
    if (!loadSessionToken() && !offlineUnlocked) {
      renderLogin();
      return;
    }
    const pictureOptions = ['<option value="">Ingen bilder</option>']
      .concat(
        Array.from({ length: config.members }, (_, index) => {
          const selected = config.pictureMember === index ? 'selected' : '';
          return `<option value="${index}" ${selected}>${memberLetter(index)} som bilder</option>`;
        }),
      )
      .join('');
    const folder = storageFolder(settings.middle);
    root.innerHTML = `<div class="setup">${shell('oppsett', 'MTS-lab · Eksperimentoppsett')}
      <form class="cards" id="form">
        <section class="card">
          <h2><span class="num">1</span> Stimuli</h2>
          <div class="fields">
            <label class="field">Stimulussett
              <select id="stimulusMode">
                <option value="builtin" ${config.stimulusMode === 'builtin' ? 'selected' : ''}>Innebygd svart-hvitt</option>
                <option value="upload" ${config.stimulusMode === 'upload' ? 'selected' : ''}>Opplastede bilder</option>
              </select>
            </label>
            ${num('classes', 'Klasser (2–4)', config.classes, 2, 4)}
            ${num('members', 'Medlemmer per klasse (3–8)', config.members, 3, 8)}
            <label class="field">Bilder som ett medlemssett
              <select id="pictureMember">${pictureOptions}</select>
            </label>
          </div>
          <div class="stimuli" id="stimuli">${stimuli()}</div>
          <p class="hint"><a href="#/symboler">Se gjennom symbolene</a> og utelat dem som ligner kjente tegn.</p>
        </section>
        <section class="card">
          <h2><span class="num">2</span> Trening</h2>
          <div class="fields">
            <label class="field">Treningsstruktur
              <select id="structure">
                <option value="LS" ${config.structure === 'LS' ? 'selected' : ''}>Lineær serie (LS)</option>
                <option value="OTM" ${config.structure === 'OTM' ? 'selected' : ''}>One-to-many (OTM)</option>
                <option value="MTO" ${config.structure === 'MTO' ? 'selected' : ''}>Many-to-one (MTO)</option>
              </select>
            </label>
            ${num('trialMultiplier', 'Trial-multiplikator', config.trialMultiplier, 1, 20)}
            ${num('masteryNumerator', 'Mestringskriterium, teller', config.masteryNumerator, 1, 500)}
            ${num('masteryDenominator', 'Mestringskriterium, nevner', config.masteryDenominator, 1, 500)}
            ${field('thinning', 'Nedtrapping, prosent', config.thinning.join(', '))}
            ${field('feedbackWordsNo', 'Ord ved riktig svar, trekkes tilfeldig', config.feedbackWordsNo.join(', '))}
            ${num('feedbackDurationMs', 'Varighet, millisekunder', config.feedbackDurationMs, 0, 10000)}
            <label class="field">Ved feil svar
              <select id="wrongFeedback">
                <option value="none" ${config.wrongFeedback === 'none' ? 'selected' : ''}>Ingenting</option>
                <option value="feil" ${config.wrongFeedback === 'feil' ? 'selected' : ''}>«Feil»</option>
                <option value="literature" ${config.wrongFeedback === 'literature' ? 'selected' : ''}>Litteraturstandard: «Feil» i 2 s</option>
              </select>
            </label>
            <label class="check"><input id="correction" type="checkbox" ${config.correction ? 'checked' : ''}/> Korreksjonsprosedyre</label>
            ${num('correctionMaxRepeats', 'Maks gjentakelser per feil', config.correctionMaxRepeats, 1, 30)}
            <label class="check"><input id="serialIntroduction" type="checkbox" ${config.serialIntroduction ? 'checked' : ''}/> Gradvis innføring, én relasjon om gangen</label>
          </div>
          <p class="hint">Nedtrappingen gjelder tilbakemelding etter riktig svar. Tekst etter feil følger valget over.</p>
        </section>
        <section class="card">
          <h2><span class="num">3</span> Presentasjon og test</h2>
          <div class="fields">
            <label class="field">MTS-type
              <select id="mtsType">
                <option value="simultaneous" ${config.mtsType === 'simultaneous' ? 'selected' : ''}>Simultan</option>
                <option value="delayed" ${config.mtsType === 'delayed' ? 'selected' : ''}>Forsinket</option>
              </select>
            </label>
            ${num('delaySeconds', 'Forsinkelse, sekunder', config.delaySeconds, 0, 60)}
            ${num('itiSeconds', 'ITI, sekunder', config.itiSeconds, 0, 30, '0.1')}
            ${num('sampleClicks', 'Klikk på utvalg (0 = vises samtidig)', config.sampleClicks, 0, 10)}
            <label class="field">Posisjoner
              <select id="positionBalance">
                <option value="constrained" ${config.positionBalance === 'constrained' ? 'selected' : ''}>Begrenset, ett hjørne tomt</option>
                <option value="free" ${config.positionBalance === 'free' ? 'selected' : ''}>Fri</option>
              </select>
            </label>
            ${num('maxConsecutiveSPlus', 'Maks ganger S+ i samme hjørne på rad', config.maxConsecutiveSPlus, 1, 10)}
            ${check('testSymmetry', 'Symmetri', config.testSymmetry)}
            ${check('testTransitivity', 'Transitivitet', config.testTransitivity)}
            ${check('testEquivalence', 'Ekvivalens', config.testEquivalence)}
            ${check('testBaseline', 'Baseline i test', config.testBaseline)}
            ${check('testReflexivity', 'Refleksivitet', config.testReflexivity)}
            ${check('reflexivityAsPretest', 'Refleksivitet som forhåndstest', config.reflexivityAsPretest)}
            ${num('testMultiplier', 'Test-multiplikator', config.testMultiplier, 1, 20)}
          </div>
          <div class="summary" id="summary">${summary()}</div>
        </section>
        <section class="card">
          <h2><span class="num">4</span> Deltakerkoder</h2>
          <p class="hint">Lagring oppretter en kode i Apps Script. Lenken virker på en annen PC i 24 timer. Bare en hash lagres. Flere deltakere kan kjøre samtidig, hver med sin kode.</p>
          <div class="actions">
            <button type="button" class="solid" id="make-code">Lagre eksperiment og hent lenke</button>
            <button type="button" class="ghost" id="start-here">Start økt på denne maskinen</button>
            <button type="button" class="ghost" id="list-results">Hent resultatliste</button>
          </div>
          <p id="message">${escapeText(message)}</p>
          <label class="field wide">Deltakerlenke
            <input id="ready-link" type="text" readonly value="${escapeAttr(readyLink)}" />
          </label>
          <div id="result-list"></div>
          <div id="codes">${codesTable()}</div>
        </section>
        <section class="card">
          <h2><span class="num">5</span> Lagring og deltakerkontroll</h2>
          <div class="folder-toggle" role="group" aria-label="Lagringsmappe">
            <span class="folder-label">Lagringsmappe</span>
            <button type="button" data-folder="Mennesker" aria-pressed="${folder === 'Mennesker'}">Mennesker</button>
            <span class="pipe" aria-hidden="true">|</span>
            <button type="button" data-folder="Boter-AI" aria-pressed="${folder === 'Boter-AI'}">Boter-AI</button>
          </div>
          <p class="hint" id="folder-path">Min disk / ${folder} / ${escapeText(config.studyId || 'mts')} / &lt;deltakernummer&gt; /</p>
          <div class="fields">
            ${field('studyId', 'Studie-ID / prosjektmappe', config.studyId)}
            ${field('groupCode', 'Gruppekode (valgfri, ingen persondata)', config.groupCode)}
            <label class="field">Språk for deltaker
              <select id="language">
                <option value="no" ${config.language === 'no' ? 'selected' : ''}>Norsk</option>
                <option value="en" ${config.language === 'en' ? 'selected' : ''}>Engelsk</option>
              </select>
            </label>
            ${field('scriptUrl', 'Apps Script-adresse (/exec)', settings.scriptUrl)}
            <label class="field wide">Instruksjon, norsk
              <textarea id="instructionNo">${escapeText(config.instructionNo)}</textarea>
            </label>
            <label class="field wide">Instruksjon, engelsk
              <textarea id="instructionEn">${escapeText(config.instructionEn)}</textarea>
            </label>
          </div>
          <div class="note">
            <p>Forsøket går i fullskjerm. Nettleseren varsler ved lukking, men kan ikke hindre det. Programmet logger fanebytte, tapt fokus og avsluttet fullskjerm. Hjelpemidler utenfor maskinen kan ikke oppdages.</p>
          </div>
          <div class="actions">
            <button type="button" class="solid" id="save-json">Lagre oppsett (JSON)</button>
            <button type="button" class="ghost" id="load-json">Last oppsett</button>
            <input id="json-file" type="file" accept="application/json,.json" hidden />
            <button type="button" class="ghost" id="ping">Test tilkobling</button>
            <button type="button" class="ghost" id="endpoint-file">Last ned lagring.json</button>
            <button type="button" class="ghost" id="logout">Logg ut</button>
          </div>
        </section>
      </form>
    </div>`;
    bind();
  };

  const refreshBits = () => {
    const box = root.querySelector('#summary');
    if (box) box.innerHTML = summary();
    const grid = root.querySelector('#stimuli');
    if (grid) grid.innerHTML = stimuli();
    bindUploads();
    const codes = root.querySelector('#codes');
    if (codes) codes.innerHTML = codesTable();
    const messageNode = root.querySelector('#message');
    if (messageNode) messageNode.textContent = message;
    const linkNode = root.querySelector('#ready-link') as HTMLInputElement | null;
    if (linkNode) linkNode.value = readyLink;
  };

  const bindUploads = () => {
    root.querySelectorAll<HTMLInputElement>('[data-upload]').forEach((input) => {
      input.addEventListener('change', () => {
        const id = input.dataset.upload;
        const file = input.files?.[0];
        if (!id || !file) return;
        const reader = new FileReader();
        reader.onload = () => {
          config.customStimuli[id] = String(reader.result ?? '');
          persist();
          refreshBits();
        };
        reader.readAsDataURL(file);
      });
    });
  };

  const bind = () => {
    root.querySelector('#form')?.addEventListener('change', (event) => {
      const id = (event.target as HTMLElement | null)?.id ?? '';
      read();
      if (id === 'classes' || id === 'members' || id === 'pictureMember') render();
      else refreshBits();
    });
    root.querySelector('#form')?.addEventListener('input', (event) => {
      const target = event.target as HTMLElement;
      if (target.id === 'instructionNo' || target.id === 'instructionEn' || target.id === 'studyId') {
        read();
        refreshBits();
      }
    });
    root.querySelector('#save-json')?.addEventListener('click', () => {
      read();
      downloadText(`${config.studyId || 'mts'}-oppsett.json`, JSON.stringify(config, null, 2), 'application/json');
    });
    root.querySelector('#load-json')?.addEventListener('click', () => {
      (root.querySelector('#json-file') as HTMLInputElement | null)?.click();
    });
    root.querySelector('#json-file')?.addEventListener('change', () => {
      const file = (root.querySelector('#json-file') as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        config = parseConfig(JSON.parse(String(reader.result ?? '{}')));
        persist();
        render();
      };
      reader.readAsText(file);
    });
    root.querySelector('#make-code')?.addEventListener('click', () => {
      read();
      void issueCode();
    });
    root.querySelector('#list-results')?.addEventListener('click', () => {
      read();
      void listResults();
    });
    root.querySelector('#logout')?.addEventListener('click', () => {
      clearSessionToken();
      offlineUnlocked = location.protocol === 'file:';
      render();
    });
    root.querySelector('#start-here')?.addEventListener('click', () => {
      read();
      const used = new Set(loadCodes().map((item) => item.participantNumber));
      const participantNumber = generateParticipantNumber(mulberry32(cryptoSeed()), used);
      saveLocalRun({ config, participantNumber });
      location.hash = '#/deltaker/lokal';
    });
    root.querySelector('#ping')?.addEventListener('click', () => {
      read();
      void ping();
    });
    root.querySelector('#endpoint-file')?.addEventListener('click', () => {
      read();
      downloadText(
        'lagring.json',
        JSON.stringify({ scriptUrl: settings.scriptUrl, middle: settings.middle }, null, 2),
        'application/json',
      );
      message = 'Legg filen i public/ og bygg på nytt, slik at deltakere på andre maskiner finner Apps Script-adressen. Hemmeligheten ligger ikke i filen.';
      refreshBits();
    });
    root.querySelectorAll<HTMLButtonElement>('[data-folder]').forEach((button) => {
      button.addEventListener('click', () => {
        settings.middle = storageFolder(button.dataset.folder);
        persist();
        root.querySelectorAll<HTMLButtonElement>('[data-folder]').forEach((item) => {
          item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
        });
        const path = root.querySelector('#folder-path');
        if (path) path.textContent = `Min disk / ${settings.middle} / ${config.studyId || 'mts'} / <deltakernummer> /`;
      });
    });
    bindUploads();
  };

  const issueCode = async () => {
    const endpoint = await resolveEndpoint();
    const token = loadSessionToken();
    if (!endpoint.scriptUrl || !token) {
      readyLink = '';
      message = 'Logg inn mot Apps Script for å lagre eksperimentet. Lenken virker da på en annen PC. Uten nett bruker du «Start økt på denne maskinen».';
      if (!token && location.protocol !== 'file:') {
        offlineUnlocked = false;
        render();
        return;
      }
      refreshBits();
      return;
    }
    try {
      const result = await postScript(endpoint.scriptUrl, {
        action: 'register',
        token,
        project: config.studyId,
        middle: endpoint.middle,
        config,
      });
      if (result.ok !== true || typeof result.code !== 'string') {
        const error = String(result.error ?? 'Kunne ikke lagre eksperimentet.');
        if (error.includes('Logg inn')) {
          clearSessionToken();
          loginError = error;
          render();
          return;
        }
        message = error;
        refreshBits();
        return;
      }
      const code = result.code;
      const participantNumber = Number(result.participantNumber);
      const expiresAt = String(result.expiresAt ?? '');
      const hash = await hashCode(code);
      const stored: StoredCode = {
        code: code.replace('-', ''),
        hash,
        participantNumber,
        expiresAt,
        createdAt: new Date().toISOString(),
        completed: false,
        config,
      };
      const codes = loadCodes();
      codes.push(stored);
      saveCodes(codes);
      readyLink = participantLink(code);
      message = `Kode ${formatCode(code)}. Deltakernummer ${participantNumber}. Utløper ${expiresAt ? new Date(expiresAt).toLocaleString('nb-NO') : 'om 24 timer'}.`;
      refreshBits();
    } catch (error) {
      message = error instanceof Error ? error.message : 'Kunne ikke lagre eksperimentet.';
      refreshBits();
    }
  };

  const listResults = async () => {
    const endpoint = await resolveEndpoint();
    const token = loadSessionToken();
    if (!endpoint.scriptUrl || !token) {
      message = 'Logg inn for å hente resultater.';
      refreshBits();
      return;
    }
    try {
      const result = await postScript(endpoint.scriptUrl, { action: 'list', token });
      if (result.ok !== true || !Array.isArray(result.rows)) {
        message = String(result.error ?? 'Kunne ikke hente listen.');
        refreshBits();
        return;
      }
      const rows = result.rows as Array<Record<string, unknown>>;
      const html = rows.length
        ? `<table class="codes"><thead><tr><th>Nummer</th><th>Prosjekt</th><th>Mappe</th><th>Status</th><th></th></tr></thead><tbody>${rows
            .map((row) => `<tr>
              <td>${escapeText(String(row.participantNumber ?? ''))}</td>
              <td>${escapeText(String(row.project ?? ''))}</td>
              <td>${escapeText(String(row.middle ?? ''))}</td>
              <td>${row.completed ? 'ferdig' : 'aktiv'}</td>
              <td><button type="button" class="ghost" data-download="${escapeAttr(String(row.participantNumber ?? ''))}">CSV</button></td>
            </tr>`)
            .join('')}</tbody></table>`
        : '<p>Ingen deltakere ennå.</p>';
      const box = root.querySelector('#result-list');
      if (box) box.innerHTML = html;
      box?.querySelectorAll<HTMLButtonElement>('[data-download]').forEach((button) => {
        button.addEventListener('click', () => {
          void downloadResult(button.dataset.download ?? '');
        });
      });
    } catch (error) {
      message = error instanceof Error ? error.message : 'Kunne ikke hente listen.';
      refreshBits();
    }
  };

  const downloadResult = async (participantNumber: string) => {
    const endpoint = await resolveEndpoint();
    const token = loadSessionToken();
    if (!endpoint.scriptUrl || !token) return;
    const result = await postScript(endpoint.scriptUrl, { action: 'download', token, participantNumber });
    if (result.ok !== true || typeof result.csv !== 'string') {
      message = String(result.error ?? 'Ingen fil.');
      refreshBits();
      return;
    }
    downloadText(`${participantNumber}.csv`, result.csv, 'text/csv;charset=utf-8');
  };

  const ping = async () => {
    const endpoint = await resolveEndpoint();
    if (!endpoint.scriptUrl) {
      message = 'Ingen Apps Script-adresse er fylt inn.';
      refreshBits();
      return;
    }
    try {
      const result = await postScript(endpoint.scriptUrl, { action: 'ping' });
      message = result.ok === true
        ? (result.experimenterConfigured ? 'Tilkoblingen virker. Eksperimentator er satt opp.' : 'Tilkoblingen virker. Kjør installerEksperimentator i Apps Script.')
        : String(result.error ?? 'Tilkoblingen svarte ikke som ventet.');
    } catch (error) {
      message = error instanceof Error ? error.message : 'Tilkoblingen feilet.';
    }
    refreshBits();
  };

  void loadEndpointFile().then((file) => {
    if (!settings.scriptUrl && file.scriptUrl) settings.scriptUrl = file.scriptUrl;
    render();
  });
  render();
  return () => {
    root.innerHTML = '';
  };
}

function field(id: string, label: string, value: string | number): string {
  return `<label class="field">${label}<input id="${id}" type="text" value="${escapeAttr(String(value))}" /></label>`;
}

function num(id: string, label: string, value: number, min: number, max: number, step?: string): string {
  const stepAttr = step ? ` step="${step}"` : '';
  return `<label class="field">${label}<input id="${id}" type="number" min="${min}" max="${max}"${stepAttr} value="${value}" /></label>`;
}

function check(id: string, label: string, on: boolean): string {
  return `<label class="check"><input id="${id}" type="checkbox" ${on ? 'checked' : ''}/> ${label}</label>`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(value: string): string {
  return escapeAttr(value).replace(/\n/g, '&#10;');
}
