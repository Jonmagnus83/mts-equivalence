export function shell(current: 'oppsett' | 'deltaker' | 'symboler' | 'agent', heading = 'MTS-lab'): string {
  const link = (hash: string, id: typeof current, label: string) =>
    `<a href="${hash}" ${current === id ? 'aria-current="page"' : ''}>${label}</a>`;
  return `<header class="top">
    <h1>${heading}</h1>
    <nav class="nav">
      ${link('#/oppsett', 'oppsett', 'Oppsett')}
      ${link('#/deltaker', 'deltaker', 'Deltaker')}
      ${link('#/symboler', 'symboler', 'Symboler')}
      ${link('#/agent', 'agent', 'Agent')}
    </nav>
  </header>`;
}
