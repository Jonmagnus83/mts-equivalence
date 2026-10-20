export function shell(current: 'oppsett' | 'deltaker' | 'symboler'): string {
  const link = (hash: string, id: typeof current, label: string) =>
    `<a href="${hash}" ${current === id ? 'aria-current="page"' : ''}>${label}</a>`;
  return `<header class="top">
    <div>
      <h1>MTS-lab</h1>
      <p>Matching-to-sample</p>
    </div>
    <nav class="nav">
      ${link('#/oppsett', 'oppsett', 'Oppsett')}
      ${link('#/deltaker', 'deltaker', 'Deltaker')}
      ${link('#/symboler', 'symboler', 'Symboler')}
    </nav>
  </header>`;
}
