/**
 * Auditoría crítica contra un despliegue real, con navegador.
 *
 * `verify:deployment` comprueba el contrato HTTP; esto comprueba lo que ve una
 * persona: carga anónima sin cookies, móvil, los tres escenarios de extremo a
 * extremo, evidencia con reevaluación, timeline conservado, notificaciones de
 * ambas partes, degradación honesta y —lo que ninguna prueba de API puede ver—
 * que ningún «Cargando…» se quede girando y que no se filtre un stack.
 *
 * Existe porque las sesiones en la nube no alcanzan el despliegue por red:
 * esta auditoría se lanza desde Actions, igual que `verify-production.yml`.
 *
 * Uso: node scripts/audit-production.mjs https://scayl-pulse.vercel.app
 */
import { pathToFileURL } from 'node:url';

// Playwright se instala FUERA del proyecto (ver el workflow): meterlo en el
// árbol que dejó `npm ci` rompe la instalación. Con la variable apuntando a su
// `index.mjs` se carga desde donde esté; sin ella, se resuelve como siempre.
const { chromium } = process.env.AUDIT_PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.AUDIT_PLAYWRIGHT_MODULE).href)
  : await import('playwright');

const BASE = (process.argv[2] ?? process.env.AUDIT_URL ?? '').replace(/\/$/, '');
if (!BASE) {
  console.error('Uso: node scripts/audit-production.mjs <url>');
  process.exit(2);
}
// Producción usa Gemini real: un escenario con seguimientos supera los 40 s.
const SLOW = 240_000;
const results = [];
const ok = (id, msg) => { results.push(['PASS', id, msg]); console.log(`PASS  ${id}  ${msg}`); };
const bad = (id, msg) => { results.push(['FAIL', id, msg]); console.log(`FAIL  ${id}  ${msg}`); };
/** Decide y registra en una sola llamada: un ternario suelto no es una sentencia. */
const judge = (pass, id, good, wrong) => (pass ? ok(id, good) : bad(id, wrong));

/** Nada de esto puede llegar nunca a la pantalla de un evaluador. */
const LEAKS = [
  /\bat\s+\w+.*\(.*:\d+:\d+\)/,
  /TypeError:|ReferenceError:|SyntaxError:/,
  /node_modules[\\/]/,
  /ZodError/i,
  /\[object Object\]/,
  // Valores de credencial, nunca nombres: `/api/health` informa de qué
  // variables existen POR NOMBRE a propósito (contrato), así que buscar
  // «service_role» daría un falso positivo sobre SUPABASE_SERVICE_ROLE_KEY.
  /AIza[0-9A-Za-z_-]{10}/,          // clave de Gemini (formato antiguo)
  /\bAQ\.[0-9A-Za-z_-]{10}/,        // clave de Gemini (formato nuevo)
  /eyJ[A-Za-z0-9_-]{20}/,           // JWT de Supabase
  /sb_secret_[0-9A-Za-z_-]{6}/,     // clave secreta de Supabase
];
async function assertNoLeak(page, id) {
  const text = await page.locator('body').innerText();
  const hit = LEAKS.find((re) => re.test(text));
  judge(!(hit), id, 'sin stack traces, secretos ni objetos crudos', `fuga en pantalla: ${hit}`);
}

const browser = await chromium.launch({ headless: true });
/** Contexto nuevo por bloque = incógnito: sin cookies, sin localStorage. */
async function freshPage(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return { context, page, errors };
}
async function runScenario(page, code, followUps) {
  if (!(await page.locator('.scenario-grid').isVisible()))
    await page.getByRole('button', { name: 'Simular escenario', exact: true }).click();
  await page.getByLabel('Incluir evidencia de seguimiento y reevaluaciones').setChecked(followUps);
  const wait = page.waitForResponse(
    (r) => r.url().includes('/run') && r.request().method() === 'POST', { timeout: SLOW },
  );
  await page.locator('.scenario-card').filter({ has: page.locator(`.code-${code}`) }).first().click();
  const payload = await (await wait).json();
  if (!payload.ok) throw new Error(`escenario ${code}: ${JSON.stringify(payload).slice(0, 200)}`);
  await page.locator('.detail-header h2').filter({ hasText: payload.data.caseNumber })
    .waitFor({ timeout: SLOW });
  return payload.data;
}

// ─────────── Identidad del despliegue y salud ───────────
{
  const health = await (await fetch(`${BASE}/api/health`)).json();
  const d = health.data ?? {};
  judge('persistenceError' in d, 'PROD.build',
    `sirve el build auditado (status=${d.status}, persistencia=${d.persistence})`,
    'el despliegue NO incluye las correcciones auditadas');
  judge(d.persistence === 'supabase', 'PROD.supabase', 'persistencia real: Supabase', `persistencia=${d.persistence}`);
  judge(Boolean(d.aiProvider) && !String(d.aiProvider).includes('deterministic'), 'PROD.gemini',
    `proveedor de IA real: ${d.aiProvider}${d.geminiModel ? ` · ${d.geminiModel}` : ''}`,
    `proveedor=${d.aiProvider} (sin modelo real)`);
  const raw = JSON.stringify(health);
  judge(!(LEAKS.some((re) => re.test(raw))), 'PROD.health.secretos', '/api/health no expone ningún valor de credencial', '/api/health filtra algo sensible');
}

// ─────────── Escritorio: anónimo, cold start, flujo completo ───────────
{
  const { context, page, errors } = await freshPage({ width: 1440, height: 1000 });
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Cada ingreso, una historia completa.' }).waitFor({ timeout: 60_000 });
  ok('PROD.anonimo', `carga en ${Date.now() - t0} ms sin cookies ni sesión previa`);

  const store = await page.evaluate(() => ({ l: localStorage.length, s: sessionStorage.length, c: document.cookie.length }));
  judge(store.l === 0 && store.s === 0 && store.c === 0, 'PROD.sin-estado',
    'no depende de cookies ni localStorage', JSON.stringify(store));

  for (const [label, text] of [['entorno', 'Comprobando entorno'], ['expedientes', 'Cargando expedientes']]) {
    await page.waitForFunction((t) => !document.body.innerText.includes(t), text, { timeout: 45_000 })
      .then(() => ok(`PROD.loader.${label}`, `"${text}" se resuelve`))
      .catch(() => bad(`PROD.loader.${label}`, `"${text}" sigue girando`));
  }

  await page.getByRole('button', { name: 'Simular escenario', exact: true }).click();
  await page.locator('.scenario-card').first().waitFor({ timeout: 45_000 });
  const n = await page.locator('.scenario-card').count();
  judge(n >= 5, 'PROD.escenarios', `${n} escenarios sin configurar nada`, `${n} escenarios`);

  const green = await runScenario(page, 'GREEN', false);
  judge(green.finalStatus === 'VERIFIED', 'PROD.GREEN', 'GREEN → Verificación completada', `GREEN → ${green.finalStatus}`);
  const checks = await page.locator('.checks .check').count();
  judge(checks === 12, 'PROD.IDEA-006', '12 comprobaciones con su evidencia', `${checks} comprobaciones`);

  const yellow = await runScenario(page, 'YELLOW', false);
  judge(yellow.finalStatus === 'DOCUMENTS_REQUIRED', 'PROD.YELLOW', 'YELLOW → Documentación requerida', `YELLOW → ${yellow.finalStatus}`);

  // Evidencia nueva + reevaluación, con el timeline conservado.
  const before = (await page.getByRole('tab', { name: /^Timeline/ }).innerText()).trim();
  await page.getByRole('tab', { name: /^Evidencia/ }).click();
  const form = page.locator('.evidence-form');
  await form.getByLabel('Tipo de documento').selectOption('MEDICAL_REPORT');
  await form.getByLabel('Título', { exact: true }).fill('Informe médico (sintético)');
  await form.getByLabel('Contenido sintético').fill('Informe sintético para la auditoría de producción.');
  await form.getByLabel('Quién aporta el documento').fill('Auditoría (sintético)');
  const ev = page.waitForResponse((r) => r.url().endsWith('/evidence') && r.request().method() === 'POST', { timeout: SLOW });
  await form.getByRole('button', { name: 'Adjuntar y reevaluar' }).click();
  judge((await (await ev).json()).ok, 'PROD.evidencia', 'evidencia aceptada y caso reevaluado', 'la evidencia no fue aceptada');
  await form.getByRole('button', { name: 'Adjuntar y reevaluar' }).waitFor({ timeout: SLOW })
    .then(() => ok('PROD.loader.evidencia', '"Guardando evidencia y reevaluando" termina'))
    .catch(() => bad('PROD.loader.evidencia', 'el botón se queda en "Guardando…"'));
  let after = before;
  for (let i = 0; i < 60 && after === before; i++) {
    after = (await page.getByRole('tab', { name: /^Timeline/ }).innerText()).trim();
    if (after === before) await page.waitForTimeout(1000);
  }
  judge(after !== before, 'PROD.timeline', `timeline conservado y ampliado: ${before} → ${after}`, 'el timeline no creció tras la evidencia');

  const red = await runScenario(page, 'RED', true);
  judge(red.finalStatus === 'VERIFIED', 'PROD.RED', 'RED → Revisión humana → Verificación completada', `RED → ${red.finalStatus}`);
  await page.getByRole('tab', { name: /^Timeline/ }).click();
  const moments = await page.getByText('Ver decisión de este momento').count();
  judge(moments >= 2, 'PROD.historial', `${moments} decisiones anteriores conservadas, ninguna borrada`, `solo ${moments} decisiones conservadas`);

  // Notificaciones diferenciadas por destinatario.
  await page.getByRole('tab', { name: /^Notificaciones/ }).click();
  const hospital = await page.locator('.case-detail').innerText();
  await page.getByRole('button', { name: 'Aseguradora', exact: true }).click();
  await page.waitForTimeout(1500);
  const insurer = await page.locator('.case-detail').innerText();
  judge(/admisiones|hospital/i.test(hospital) && /aseguradora|gestor/i.test(insurer) && hospital !== insurer,
    'PROD.notificaciones', 'hospital y aseguradora reciben avisos distintos',
    'las dos vistas no se diferencian');
  await page.getByRole('button', { name: 'Hospital', exact: true }).click();

  // Ingreso libre.
  await page.getByRole('button', { name: '+ Nuevo ingreso', exact: true }).click();
  await page.locator('form').filter({ has: page.getByLabel(/hospital/i) }).first().waitFor({ timeout: 30_000 })
    .then(() => ok('PROD.ingreso-libre', 'el formulario de ingreso libre está disponible'))
    .catch(() => bad('PROD.ingreso-libre', 'no se pudo abrir el formulario de ingreso'));

  await assertNoLeak(page, 'PROD.fugas.escritorio');
  const url = page.url();
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (!url.includes('case=')) bad('PROD.refresh', 'el expediente no tiene URL propia');
  else
    await page.locator('.detail-header h2').waitFor({ timeout: 60_000 })
      .then(() => ok('PROD.refresh', 'el refresh directo reabre el expediente'))
      .catch(() => bad('PROD.refresh', 'el refresh directo no reabre el expediente'));
  judge(errors.length === 0, 'PROD.consola', 'sin errores de JavaScript', errors.slice(0, 3).join(' | '));
  await context.close();
}

// ─────────── Móvil 390 px ───────────
{
  const { context, page, errors } = await freshPage({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Cada ingreso, una historia completa.' }).waitFor({ timeout: 60_000 });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  judge(over <= 1, 'PROD.movil', 'sin desbordamiento horizontal a 390 px', `desborda ${over} px`);
  const g = await runScenario(page, 'GREEN', false);
  judge(g.finalStatus === 'VERIFIED', 'PROD.movil.flujo', 'flujo completo operable en móvil', `GREEN → ${g.finalStatus}`);
  const over2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  judge(over2 <= 1, 'PROD.movil.detalle', 'el detalle tampoco desborda', `desborda ${over2} px`);
  await assertNoLeak(page, 'PROD.fugas.movil');
  judge(errors.length === 0, 'PROD.movil.consola', 'sin errores de JavaScript en móvil', errors.slice(0, 3).join(' | '));
  await context.close();
}

// ─────────── Degradación: backend caído o colgado ───────────
{
  const { context, page } = await freshPage({ width: 1440, height: 1000 });
  await page.route('**/api/health', (route) => route.abort('failed'));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Cada ingreso, una historia completa.' }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(16_000);
  judge(!(await page.locator('body').innerText()).includes('Comprobando entorno'),
    'PROD.degradado.health', 'con /api/health caído, el entorno degrada a un mensaje terminal',
    '"Comprobando entorno…" persiste con /api/health caído');
  await assertNoLeak(page, 'PROD.fugas.degradado');
  await context.close();
}
{
  const { context, page } = await freshPage({ width: 1440, height: 1000 });
  // Una petición que nunca responde: Supabase o Gemini colgados.
  await page.route('**/api/cases?**', async () => {});
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Cada ingreso, una historia completa.' }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(22_000);
  judge(!(await page.locator('body').innerText()).includes('Cargando expedientes'),
    'PROD.degradado.colgado', 'una petición colgada termina en mensaje, no en espera infinita',
    '"Cargando expedientes…" gira sin límite');
  await context.close();
}

await browser.close();
const fails = results.filter((r) => r[0] === 'FAIL');
console.log(`\n===== ${results.length - fails.length}/${results.length} comprobaciones correctas =====`);
for (const f of fails) console.log(`  FALLO · ${f[1]} — ${f[2]}`);
process.exit(fails.length ? 1 : 0);
