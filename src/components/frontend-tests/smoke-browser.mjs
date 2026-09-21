import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// Install Playwright outside the repository and point to its index.mjs.
// Only a local, in-memory, deterministic server is permitted for this check.
const { chromium } = await import(pathToFileURL(process.env.FRONTEND_PLAYWRIGHT_MODULE).href);
const base = process.env.FRONTEND_TEST_URL ?? 'http://localhost:3100';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const health = await fetch(`${base}/api/health`).then((response) => response.json());
assert.equal(health.data.persistence, 'in-memory');
assert.match(health.data.aiProvider, /deterministic/);

const browser = await chromium.launch({
  channel: process.env.FRONTEND_BROWSER_CHANNEL ?? 'msedge',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let summaries = 0;
page.on('request', (request) => {
  if (request.url().includes('/summary')) summaries++;
});
const waitText = (text) => page.getByText(text, { exact: true }).first().waitFor();
async function scenario(code, followUps = false) {
  if (!(await page.locator('.scenario-grid').isVisible()))
    await page.getByRole('button', { name: 'Simular escenario', exact: true }).click();
  await page.getByLabel('Incluir evidencia de seguimiento y reevaluaciones').setChecked(followUps);
  const response = page.waitForResponse(
    (response) => response.url().includes('/run') && response.request().method() === 'POST',
  );
  await page
    .locator('.scenario-card')
    .filter({ has: page.locator(`.code-${code}`) })
    .first()
    .click();
  const payload = await (await response).json();
  assert.equal(payload.ok, true);
  await page.locator('.detail-header h2').filter({ hasText: payload.data.caseNumber }).waitFor();
  return payload.data;
}
async function evidence(type, title, content) {
  const form = page.locator('.evidence-form');
  await form.getByLabel('Tipo de documento').selectOption(type);
  await form.getByLabel('Título', { exact: true }).fill(title);
  await form.getByLabel('Contenido sintético').fill(content);
  await form.getByLabel('Quién aporta el documento').fill('Carlos (sintético)');
  const response = page.waitForResponse(
    (response) => response.url().endsWith('/evidence') && response.request().method() === 'POST',
  );
  await form.getByRole('button', { name: 'Adjuntar y reevaluar' }).click();
  assert.equal((await (await response).json()).ok, true);
  await form.getByRole('button', { name: 'Adjuntar y reevaluar' }).waitFor();
}
try {
  await page.goto(base);
  await page.getByRole('heading', { name: 'Cada ingreso, una historia completa.' }).waitFor();
  const green = await scenario('GREEN');
  assert.equal(green.finalStatus, 'VERIFIED');
  await page.getByText('¿Por qué tomó esta decisión?', { exact: false }).first().waitFor();
  assert.equal(await page.locator('.checks .check').count(), 12);
  await page.screenshot({ path: '.next/frontend-desktop.png', fullPage: true });

  const yellow = await scenario('YELLOW');
  assert.equal(yellow.finalStatus, 'DOCUMENTS_REQUIRED');
  await page.getByRole('tab', { name: /^Evidencia/ }).click();
  await evidence(
    'MEDICAL_REPORT',
    'Informe médico (sintético)',
    'Informe sintético de evaluación de emergencias.',
  );
  await page.locator('.detail-status .status-DOCUMENTS_REQUIRED').waitFor();
  await evidence(
    'COST_ESTIMATE',
    'Estimado (sintético)',
    'Estimado sintético de costos de B/. 6800.',
  );
  await page.locator('.detail-status .status-VERIFIED').waitFor();
  await page.getByRole('tab', { name: /^Timeline/ }).click();
  await page.locator('.timeline .historical-decision').nth(2).waitFor();
  assert.equal(await page.locator('.historical-decision').count(), 3);
  const seq = await page.locator('.timeline-seq').allTextContents();
  assert.deepEqual(
    seq.map(Number),
    [...seq.map(Number)].sort((a, b) => a - b),
  );
  await page.screenshot({ path: '.next/frontend-timeline.png', fullPage: true });

  const red = await scenario('RED', true);
  assert.equal(red.finalStatus, 'VERIFIED');
  await page.getByRole('tab', { name: /^Timeline/ }).click();
  await page.locator('.historical-decision').first().locator('summary').first().click();
  await waitText('Se necesita revisión humana');
  await page.getByRole('button', { name: 'Aseguradora', exact: true }).click();
  assert.equal(summaries, 0);
  await page.getByRole('button', { name: 'Preparar resumen', exact: true }).click();
  await page.locator('.summary-content').waitFor();
  assert.equal(summaries, 1);
  await page.locator('.resolve-form > summary').click();
  await page.getByLabel('Resultado administrativo').selectOption('COVERAGE_CONFIRMED');
  await page.getByLabel('Quién cierra', { exact: true }).fill('Carlos (sintético)');
  await page
    .getByLabel('Motivo del cierre')
    .fill('Evidencia sintética revisada y cobertura confirmada.');
  await page.getByLabel('He revisado la evidencia').check();
  await page.getByRole('button', { name: 'Registrar cierre definitivo' }).click();
  await page.locator('.detail-status .status-RESOLVED').waitFor();
  assert.equal(await page.locator('.resolve-form').count(), 0);
  await page.getByRole('tab', { name: /^Evidencia/ }).click();
  assert.equal(await page.locator('.evidence-form').count(), 0);
  await page.reload();
  await page.locator('.detail-header h2').filter({ hasText: red.caseNumber }).waitFor();

  await page.getByRole('button', { name: 'Hospital', exact: true }).click();
  await page.getByRole('button', { name: '+ Nuevo ingreso', exact: true }).click();
  const form = page.locator('#entry-panel form');
  await form.getByLabel('Código del hospital').fill('HOSP-PTY-01');
  await form.getByLabel('Cédula sintética').fill('no-existe-sintetico');
  await form.getByLabel('Triaje registrado').selectOption('GREEN');
  await form.getByLabel('Motivo del ingreso').fill('Ingreso de prueba exclusivamente sintético.');
  await form.getByRole('button', { name: '+ Adjuntar texto de documento' }).click();
  await form.getByLabel('Tipo de documento').selectOption('ADMISSION_FORM');
  await form.getByLabel('Título', { exact: true }).fill('Ingreso (sintético)');
  await form.getByLabel('Contenido sintético').fill('Documento sintético de ingreso de prueba.');
  const admissionResponse = page.waitForResponse(
    (response) => response.url().endsWith('/admissions') && response.request().method() === 'POST',
  );
  await form.getByRole('button', { name: 'Registrar ingreso sintético' }).click();
  const admission = await (await admissionResponse).json();
  assert.equal(admission.ok, true);
  assert.equal(admission.data.status, 'HUMAN_REVIEW');
  await page.locator('.detail-header h2').filter({ hasText: admission.data.caseNumber }).waitFor();
  await waitText('Se necesita revisión humana');
  await page.getByRole('button', { name: 'Cerrar panel', exact: true }).click();

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    assert.equal(overflow, false, `Horizontal overflow at ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#case-detail').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.next/frontend-mobile.png', fullPage: true });
  await page.getByRole('tab', { name: /^Decisión/ }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(
    await page.getByRole('tab', { name: /^Timeline/ }).getAttribute('aria-selected'),
    'true',
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: GREEN; YELLOW with two evidence submissions; RED history and summary; human closure; admission form; reload; keyboard tabs; responsive 390/768/1440; no browser errors.',
  );
} finally {
  await browser.close();
}
