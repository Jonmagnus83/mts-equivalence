import { expect, test } from '@playwright/test';

test('runs a full perfect-learner session in the browser without human guards', async ({ page }) => {
  const fullscreenCalls: number[] = [];
  await page.addInitScript(() => {
    const mark = { n: 0 };
    (window as unknown as { __fullscreenCalls: { n: number } }).__fullscreenCalls = mark;
    Element.prototype.requestFullscreen = () => {
      mark.n += 1;
      return Promise.reject(new Error('fullscreen skal ikke brukes i agentmodus'));
    };
  });
  await page.goto('/#/oppsett');
  await page.getByRole('button', { name: 'Fortsett uten nett' }).click();
  await expect(page.locator('#run-agent')).toBeDisabled();
  await page.getByRole('button', { name: 'Boter-AI' }).click();
  await expect(page.locator('#run-agent')).toBeEnabled();
  await page.locator('#agent-type').selectOption('perfekt');
  await page.locator('#agent-pace').selectOption('rask');
  await page.locator('#run-agent').click();
  await expect(page).toHaveURL(/#\/agent/);
  await page.locator('#agent-start').click();
  await expect(page.locator('#agent-status')).toContainText('Ferdig', { timeout: 90_000 });
  for (const label of ['S', 'T', 'EQ']) {
    const text = await page.locator(`[data-probe="${label}"]`).innerText();
    const [correct, total] = text.split('/').map((part) => Number(part));
    expect(total).toBeGreaterThan(0);
    expect(correct).toBe(total);
  }
  await expect(page.locator('#agent-path')).toContainText('Boter-AI');
  const calls = await page.evaluate(() => (window as unknown as { __fullscreenCalls: { n: number } }).__fullscreenCalls.n);
  fullscreenCalls.push(calls);
  expect(fullscreenCalls[0]).toBe(0);
});
