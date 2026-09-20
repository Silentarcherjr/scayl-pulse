#!/usr/bin/env node
/**
 * Verifies a running SCAYL Pulse deployment end to end.
 *
 *   node scripts/verify-deployment.mjs https://scayl-pulse.vercel.app
 *   node scripts/verify-deployment.mjs            # defaults to localhost:3000
 *
 * Exits non-zero if anything is wrong, so it can gate a demo or run in CI.
 */

const baseUrl = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');

const results = [];
let failed = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed += 1;
  const mark = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`${mark} ${name}${detail ? `\n    ${detail}` : ''}`);
}

async function call(path, init) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

console.log(`\nSCAYL Pulse — verificación de despliegue\n${baseUrl}\n`);

// --- 1. Health ---------------------------------------------------------------
let health;
try {
  const { status, body } = await call('/api/health');
  health = body?.data;
  record('/api/health responde', status === 200 && body?.ok === true, `HTTP ${status}`);
  if (health) {
    console.log(`    persistencia : ${health.persistence}`);
    console.log(`    analizador   : ${health.aiProvider}${health.geminiModel ? ` (${health.geminiModel})` : ''}`);
    console.log(`    realtime     : ${health.realtimeAvailable ? 'disponible' : 'no disponible'}`);
    if (health.persistenceNote) console.log(`    \x1b[33maviso\x1b[0m        : ${health.persistenceNote}`);
  }
} catch (error) {
  record('/api/health responde', false, String(error));
  console.error('\nNo se pudo contactar el servicio. ¿Es correcta la URL?\n');
  process.exit(1);
}

// --- 2. Scenario catalogue ---------------------------------------------------
const { body: catalogue } = await call('/api/demo/scenarios');
const scenarios = catalogue?.data?.scenarios ?? [];
record('catálogo de escenarios disponible', scenarios.length >= 3, `${scenarios.length} escenarios`);

// --- 3. Every scenario, through the real pipeline -----------------------------
let sampleCaseId = null;
for (const scenario of scenarios) {
  const { status, body } = await call(`/api/demo/scenarios/${scenario.id}/run`, {
    method: 'POST',
    body: JSON.stringify({ applyFollowUps: scenario.followUps.length > 0 }),
  });
  const data = body?.data;
  const ok = status === 201 && body?.ok === true && data?.matchedExpectation === true;
  const detail = data
    ? data.steps.map((s) => `${s.label}: ${s.status}${s.matchedExpectation ? '' : ` (esperado ${s.expectedStatus})`}`).join(' → ')
    : `HTTP ${status} ${JSON.stringify(body?.error ?? {})}`;
  record(`escenario ${scenario.code} · ${scenario.id}`, ok, detail);
  if (!sampleCaseId && data?.caseId) sampleCaseId = data.caseId;
}

// --- 4. Timeline -------------------------------------------------------------
if (sampleCaseId) {
  const { body } = await call(`/api/cases/${sampleCaseId}/events`);
  const events = body?.data?.events ?? [];
  const seqOk = events.every((e, i) => e.seq === i + 1);
  record('el timeline existe y su secuencia es monótona', events.length > 0 && seqOk, `${events.length} eventos`);

  const types = new Set(events.map((e) => e.type));
  const notified = types.has('HOSPITAL_NOTIFIED') && types.has('INSURER_NOTIFIED');
  record('se notificó a hospital y aseguradora', notified);
  record('el Safety Gate dejó rastro', types.has('SAFETY_GATE_APPLIED'));
}

// --- 5. Input validation -----------------------------------------------------
const { status: badStatus, body: badBody } = await call('/api/admissions', {
  method: 'POST',
  body: JSON.stringify({ hospitalCode: 'X' }),
});
record(
  'un ingreso inválido se rechaza con 422 y no con 500',
  badStatus === 422 && badBody?.error?.code === 'VALIDATION_ERROR',
  `HTTP ${badStatus}`,
);

const { status: missingStatus } = await call('/api/cases/00000000-0000-0000-0000-000000000000');
record('un caso inexistente devuelve 404', missingStatus === 404, `HTTP ${missingStatus}`);

// --- Summary -----------------------------------------------------------------
console.log(`\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${results.length - failed}/${results.length} comprobaciones correctas\x1b[0m`);

if (health?.persistence === 'in-memory') {
  console.log(
    '\n\x1b[33mNota:\x1b[0m el despliegue usa el repositorio en memoria. Los casos no sobreviven a un\n' +
      'reinicio ni se comparten entre instancias serverless. Para la demo funciona; para\n' +
      'persistencia real configura NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.',
  );
}
if (health?.aiProvider === 'deterministic-fixture') {
  console.log(
    '\n\x1b[33mNota:\x1b[0m no hay GEMINI_API_KEY configurada. Las decisiones salen del analizador\n' +
      'determinístico y se marcan como tal (source: AI_UNAVAILABLE). Nunca se falsifica\n' +
      'una llamada a Gemini.',
  );
}
console.log('');

process.exit(failed === 0 ? 0 : 1);
