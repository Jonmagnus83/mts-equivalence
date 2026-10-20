import { expiryFrom, formatCode, generateCode, generateParticipantNumber, hashCode } from './codes';
import { assignSymbols, parseConfig } from './config';
import { formatRatio, jonTestRequired, literatureRequired, requiredCorrect } from './criteria';
import { cryptoSeed, mulberry32 } from './rng';
import { shell } from './shell';
import { stimulusSvg } from './symbols';
import { planSizes } from './trials';
import {
  downloadText,
  loadCodes,
  loadEndpointFile,
  loadSavedConfig,
  loadSettings,
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
    settings = {
      scriptUrl: value('scriptUrl').trim(),
      secret: value('secret'),
      middle: value('middle').trim() || 'Mennesker',
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

  const render = () => {
    const pictureOptions = ['<option value="">Ingen bilder</option>']
      .concat(
        Array.from({ length: config.members }, (_, index) => {
          const selected = config.pictureMember === index ? 'selected' : '';
          return `<option value="${index}" ${selected}>${memberLetter(index)} som bilder</option>`;
        }),
      )
      .join('');
    root.innerHTML = `${shell('oppsett')}
      <div class="layout">
        <form class="form" id="form">
          <section>
            <h2>Studie</h2>
            <div class="fields">
              ${field('studyId', 'Studie-ID / prosjektmappe', config.studyId)}
              ${field('groupCode', 'Gruppekode (valgfri, ingen persondata)', config.groupCode)}
              <label class="field">Språk for deltaker
                <select id="language">
                  <option value="no" ${config.language === 'no' ? 'selected' : ''}>Norsk</option>
                  <option value="en" ${config.language === 'en' ? 'selected' : ''}>Engelsk</option>
                </select>
              </label>
              <label class="field wide">Instruksjon, norsk
                <textarea id="instructionNo">${escapeText(config.instructionNo)}</textarea>
              </label>
              <label class="field wide">Instruksjon, engelsk
                <textarea id="instructionEn">${escapeText(config.instructionEn)}</textarea>
              </label>
            </div>
          </section>
          <section>
            <h2>Stimuli</h2>
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
          </section>
          <section>
            <h2>Trening</h2>
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
              <label class="check"><input id="serialIntroduction" type="checkbox" ${config.serialIntroduction ? 'checked' : ''}/> Gradvis innføring, én relasjon om gangen før nedtrapping</label>
            </div>
          </section>
          <section>
            <h2>Tilbakemelding</h2>
            <div class="fields">
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
            </div>
            <p class="field">Nedtrappingen gjelder tilbakemelding etter riktig svar. Tekst etter feil følger valget over og trappes ikke ned.</p>
          </section>
          <section>
            <h2>Presentasjon</h2>
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
                  <option value="constrained" ${config.positionBalance === 'constrained' ? 'selected' : ''}>Begrenset</option>
                  <option value="free" ${config.positionBalance === 'free' ? 'selected' : ''}>Fri</option>
                </select>
              </label>
              ${num('maxConsecutiveSPlus', 'Maks ganger S+ i samme hjørne på rad', config.maxConsecutiveSPlus, 1, 10)}
            </div>
          </section>
          <section>
            <h2>Test</h2>
            <div class="fields">
              ${check('testSymmetry', 'Symmetri', config.testSymmetry)}
              ${check('testTransitivity', 'Transitivitet', config.testTransitivity)}
              ${check('testEquivalence', 'Ekvivalens', config.testEquivalence)}
              ${check('testBaseline', 'Baseline i test', config.testBaseline)}
              ${check('testReflexivity', 'Refleksivitet', config.testReflexivity)}
              ${check('reflexivityAsPretest', 'Refleksivitet som forhåndstest', config.reflexivityAsPretest)}
              ${num('testMultiplier', 'Test-multiplikator', config.testMultiplier, 1, 20)}
            </div>
          </section>
          <section>
            <h2>Koder og lagring</h2>
            <div class="fields">
              ${field('scriptUrl', 'Apps Script-adresse', settings.scriptUrl)}
              <label class="field">Hemmelighet (lagres bare i denne nettleseren)
                <input id="secret" type="password" value="${escapeAttr(settings.secret)}" autocomplete="off" />
              </label>
              ${field('middle', 'Mappe under Min disk', settings.middle)}
            </div>
            <div class="actions">
              <button type="button" class="solid" id="save-json">Lagre oppsett (JSON)</button>
              <button type="button" class="ghost" id="load-json">Last oppsett</button>
              <input id="json-file" type="file" accept="application/json,.json" hidden />
              <button type="button" class="solid" id="make-code">Generer deltakerkode</button>
              <button type="button" class="ghost" id="start-here">Start økt på denne maskinen</button>
              <button type="button" class="ghost" id="ping">Test tilkobling</button>
              <button type="button" class="ghost" id="endpoint-file">Last ned lagring.json</button>
            </div>
            <p id="message">${escapeText(message)}</p>
            <div id="codes">${codesTable()}</div>
          </section>
        </form>
        <aside class="side">
          <div class="summary" id="summary"><h2>Denne økten</h2>${summary()}</div>
          <div class="note">
            <h2>Fanen</h2>
            <p>Forsøket går i fullskjerm. Nettleseren varsler hvis deltakeren lukker eller laster siden på nytt. Programmet logger skifte av fane, tapt fokus og avsluttet fullskjerm, og setter økten på pause.</p>
            <p>En nettleser kan ikke hindre at fanen lukkes, og den kan ikke oppdage mobil, notater eller en annen skjerm. Instruksjonen sier det.</p>
          </div>
        </aside>
      </div>`;
    bind();
  };

  const refreshBits = () => {
    const box = root.querySelector('#summary');
    if (box) box.innerHTML = `<h2>Denne økten</h2>${summary()}`;
    const grid = root.querySelector('#stimuli');
    if (grid) grid.innerHTML = stimuli();
    bindUploads();
    const codes = root.querySelector('#codes');
    if (codes) codes.innerHTML = codesTable();
    const messageNode = root.querySelector('#message');
    if (messageNode) messageNode.textContent = message;
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
    bindUploads();
  };

  const issueCode = async () => {
    const rng = mulberry32(cryptoSeed());
    const code = generateCode(rng);
    const hash = await hashCode(code);
    const used = new Set(loadCodes().map((item) => item.participantNumber));
    let participantNumber = generateParticipantNumber(rng, used);
    const createdAt = new Date().toISOString();
    const expiresAt = expiryFrom(Date.now());
    const endpoint = await resolveEndpoint();
    if (endpoint.scriptUrl) {
      if (!endpoint.secret) {
        message = 'Skriv inn hemmeligheten fra Apps Script før koden kan lagres i Drive.';
        refreshBits();
        return;
      }
      try {
        const result = await postScript(endpoint.scriptUrl, {
          action: 'register',
          secret: endpoint.secret,
          hash,
          participantNumber,
          project: config.studyId,
          middle: endpoint.middle,
          expiresAt,
          config,
        });
        if (result.ok !== true) {
          message = String(result.error ?? 'Koden ble ikke registrert.');
          refreshBits();
          return;
        }
        if (typeof result.participantNumber === 'number') participantNumber = result.participantNumber;
      } catch (error) {
        message = error instanceof Error ? error.message : 'Kunne ikke registrere koden.';
        refreshBits();
        return;
      }
    }
    const stored: StoredCode = {
      code: code.replace('-', ''),
      hash,
      participantNumber,
      expiresAt,
      createdAt,
      completed: false,
      config,
    };
    const codes = loadCodes();
    codes.push(stored);
    saveCodes(codes);
    const link = `${location.origin}${location.pathname}#/kode/${formatCode(stored.code)}`;
    message = endpoint.scriptUrl
      ? `Kode ${formatCode(stored.code)}. Deltakernummer ${participantNumber}. Utløper om 24 timer. Lenke: ${link}`
      : `Kode ${formatCode(stored.code)}. Deltakernummer ${participantNumber}. Uten Apps Script virker koden bare i denne nettleseren. Lenke: ${link}`;
    refreshBits();
  };

  const ping = async () => {
    const endpoint = await resolveEndpoint();
    if (!endpoint.scriptUrl) {
      message = 'Ingen Apps Script-adresse er fylt inn.';
      refreshBits();
      return;
    }
    try {
      const result = await postScript(endpoint.scriptUrl, { action: 'ping', secret: endpoint.secret });
      message = result.ok === true ? 'Tilkoblingen virker.' : String(result.error ?? 'Tilkoblingen svarte ikke som ventet.');
    } catch (error) {
      message = error instanceof Error ? error.message : 'Tilkoblingen feilet.';
    }
    refreshBits();
  };

  void loadEndpointFile().then((file) => {
    if (!settings.scriptUrl && file.scriptUrl) settings.scriptUrl = file.scriptUrl;
    if (settings.middle === 'Mennesker' && file.middle) settings.middle = file.middle;
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
