import { mountExperimenter } from './experimenter';
import { mountParticipant } from './participant';
import { mountSymbols } from './symbols-page';
import './styles.css';

const root = document.querySelector('#app');
if (!root) throw new Error('Mangler #app');

let cleanup: () => void = () => undefined;

function route(): void {
  cleanup();
  const hash = location.hash;
  if (hash.startsWith('#/deltaker') || hash.startsWith('#/kode/') || hash.startsWith('#/delta')) {
    cleanup = mountParticipant(root as HTMLElement);
  }
  else if (hash.startsWith('#/symboler')) cleanup = mountSymbols(root as HTMLElement);
  else cleanup = mountExperimenter(root as HTMLElement);
}

window.addEventListener('hashchange', route);
route();
