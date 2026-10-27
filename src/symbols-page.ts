import { parseConfig } from './config';
import { shell } from './shell';
import { SYMBOLS, symbolSvg } from './symbols';
import { loadSavedConfig, saveConfig } from './storage';

/** Preview so the experimenter can reject shapes that look like letters, digits or familiar signs. */
export function mountSymbols(root: HTMLElement): () => void {
  const config = parseConfig(loadSavedConfig() ?? undefined);
  const excluded = new Set(config.excludedSymbols);

  const render = () => {
    const cards = SYMBOLS.map((symbol) => {
      const off = excluded.has(symbol.id);
      return `<label class="symbol-card">
        <div class="figure">${symbolSvg(symbol.id)}</div>
        <strong>${symbol.id}</strong>
        <span class="check"><input type="checkbox" data-id="${symbol.id}" ${off ? 'checked' : ''}/> Utelat</span>
      </label>`;
    }).join('');
    root.innerHTML = `${shell('symboler')}
      <div class="page">
        <h2>Innebygde symboler</h2>
        <p>Settet har ${SYMBOLS.length} abstrakte svart-hvite figurer. De er tegnet for ikke å ligne bokstaver, tall, piler, stjerner eller andre kjente tegn. Se gjennom dem og utelat dem som likevel gjør det. Valget lagres i oppsettet på denne maskinen. Et annet, valgbart sett er de ni tegnene ◆ ▲ ● ■ ◢ ◤ △ ○ □ (A1–C3). Det endrer ikke disse figurene. Standard for menneskeøkter er fortsatt dette settet.</p>
        <div class="actions">
          <button type="button" class="solid" id="save-symbols">Lagre utvalget</button>
        </div>
        <p id="symbol-note"></p>
        <div class="symbol-grid">${cards}</div>
      </div>`;
    root.querySelector('#save-symbols')?.addEventListener('click', () => {
      excluded.clear();
      root.querySelectorAll<HTMLInputElement>('[data-id]').forEach((input) => {
        if (input.checked && input.dataset.id) excluded.add(input.dataset.id);
      });
      config.excludedSymbols = [...excluded];
      saveConfig(parseConfig(config));
      const note = root.querySelector('#symbol-note');
      if (note) note.textContent = excluded.size === 0
        ? 'Alle symbolene kan brukes.'
        : `${excluded.size} symboler er utelatt.`;
    });
  };

  render();
  return () => {
    root.innerHTML = '';
  };
}
