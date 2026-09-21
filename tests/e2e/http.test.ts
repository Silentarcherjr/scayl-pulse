import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SCENARIOS } from '@/data/synthetic/scenarios';
import type { AgentDecision, CaseEvent, CaseEvidence, EmergencyCase, Notification } from '@/core/domain/types';
import type { ScenarioRunResult } from '@/core/demo/demo-runner';
import { assertNotifications, assertTimeline } from '../qa/assert-case';
import { startLocalServer } from './local-server';

type AdmissionResult = { caseId: string; status: string; decision: AgentDecision };
type Detail = {
  case: EmergencyCase;
  evidence: CaseEvidence[];
  notifications: Notification[];
  decisionHistory: { decision: AgentDecision }[];
  aiInteractions: Record<string, unknown>[];
};

describe('Integrations: HTTP real contra Next local', () => {
  let server: Awaited<ReturnType<typeof startLocalServer>>;
  beforeAll(async () => { server = await startLocalServer(); }, 120_000);
  afterAll(async () => { await server?.stop(); }, 15_000);

  async function request(path: string, body?: unknown) {
    const response = await fetch(`${server.baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    return { status: response.status, body: await response.json() };
  }

  async function success<T>(path: string, body?: unknown, status = body === undefined ? 200 : 201): Promise<T> {
    const response = await request(path, body);
    expect(response.status, JSON.stringify(response.body)).toBe(status);
    expect(response.body.ok).toBe(true);
    return response.body.data as T;
  }

  it('expone el catálogo y declara el modo local sin IA real', async () => {
    const health = await success<{ persistence: string; aiProvider: string }>('/api/health');
    expect(health.persistence).toBe('in-memory');
    expect(health.aiProvider).toBe('deterministic-fixture');
    const catalogue = await success<{ scenarios: { id: string }[] }>('/api/demo/scenarios');
    expect(catalogue.scenarios.map((item) => item.id)).toEqual(DEMO_SCENARIOS.map((item) => item.id));
  }, 60_000);

  for (const scenario of DEMO_SCENARIOS) {
    it(`${scenario.id}: ingreso, evidencia, historial y notificación dual`, async () => {
      const initial = await success<AdmissionResult>('/api/admissions', scenario.admission);
      expect(initial.status).toBe(scenario.expectedStatus);
      expect(initial.decision.requiresHuman).toBe(scenario.expectedRequiresHuman);
      expect(initial.decision.source).toBe('DETERMINISTIC');
      let previous = (await success<{ events: CaseEvent[] }>(`/api/cases/${initial.caseId}/events`)).events;
      const statuses = [scenario.expectedStatus];
      for (const followUp of scenario.followUps) {
        const updated = await success<AdmissionResult>(`/api/cases/${initial.caseId}/evidence`, followUp.evidence);
        expect(updated.status).toBe(followUp.expectedStatusAfter);
        statuses.push(followUp.expectedStatusAfter);
        const current = (await success<{ events: CaseEvent[] }>(`/api/cases/${initial.caseId}/events`)).events;
        expect(current.slice(0, previous.length)).toEqual(previous);
        expect(current.slice(previous.length).map((event) => event.type)).toEqual(expect.arrayContaining([
          'NEW_EVIDENCE_RECEIVED', 'REASSESSMENT_STARTED', 'DECISION_UPDATED',
        ]));
        previous = current;
      }
      assertTimeline(previous, initial.caseId);
      const detail = await success<Detail>(`/api/cases/${initial.caseId}`);
      expect(detail.case.status).toBe(statuses.at(-1));
      expect(detail.decisionHistory.map((item) => item.decision.status)).toEqual(statuses);
      expect(detail.evidence).toHaveLength((scenario.admission.attachedDocuments?.length ?? 0) + scenario.followUps.length);
      expect(detail.evidence.every((item) => item.caseId === initial.caseId)).toBe(true);
      assertNotifications(detail.notifications, initial.caseId, statuses.length);
      for (const interaction of detail.aiInteractions) expect(interaction).not.toHaveProperty('rawResponse');
      if (scenario.code === 'YELLOW') {
        expect(initial.decision.missingDocuments.filter((item) => item.severity === 'BLOCKING')
          .map((item) => item.documentType).sort()).toEqual(['COST_ESTIMATE', 'MEDICAL_REPORT']);
      }
    }, 120_000);

    it(`${scenario.id}: runner de demo respeta todos los pasos esperados`, async () => {
      const run = await success<ScenarioRunResult>(`/api/demo/scenarios/${scenario.id}/run`, { applyFollowUps: true });
      expect(run.steps.map((step) => step.status)).toEqual([
        scenario.expectedStatus, ...scenario.followUps.map((step) => step.expectedStatusAfter),
      ]);
      expect(run.matchedExpectation).toBe(true);
      expect(run.finalStatus).toBe(run.steps.at(-1)?.status);
    }, 120_000);
  }

  it('rechaza ingresos inválidos y recursos inexistentes con el envelope documentado', async () => {
    for (const [path, body, status, code] of [
      ['/api/admissions', {}, 422, 'VALIDATION_ERROR'],
      ['/api/cases/00000000-0000-0000-0000-000000000000', undefined, 404, 'NOT_FOUND'],
      ['/api/demo/scenarios/no-existe/run', {}, 404, 'NOT_FOUND'],
    ] as const) {
      const result = await request(path, body);
      expect(result.status).toBe(status);
      expect(result.body).toMatchObject({ ok: false, error: { code } });
      expect(result.body.error).not.toHaveProperty('stack');
    }
  }, 60_000);

  it('el cierre es terminal y los intentos rechazados conservan el timeline', async () => {
    const initial = await success<AdmissionResult>('/api/admissions', DEMO_SCENARIOS[0].admission);
    const resolution = {
      outcome: 'COVERAGE_CONFIRMED', resolvedBy: 'Gestor QA (sintético)',
      reason: 'Cierre simulado para verificar el contrato HTTP.',
    };
    const closed = await success<{ status: string }>(`/api/cases/${initial.caseId}/resolve`, resolution, 200);
    expect(closed.status).toBe('RESOLVED');
    const before = await success<{ events: CaseEvent[] }>(`/api/cases/${initial.caseId}/events`);
    for (const [action, body] of [
      ['resolve', resolution], ['evidence', DEMO_SCENARIOS[1].followUps[0].evidence],
    ] as const) {
      const rejected = await request(`/api/cases/${initial.caseId}/${action}`, body);
      expect(rejected.status).toBe(409);
      expect(rejected.body).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    }
    expect((await success<{ events: CaseEvent[] }>(`/api/cases/${initial.caseId}/events`)).events).toEqual(before.events);
    assertNotifications((await success<Detail>(`/api/cases/${initial.caseId}`)).notifications, initial.caseId, 2);
  }, 120_000);

  it('20 ingresos concurrentes mantienen IDs, evidencia y secuencias aislados', async () => {
    const admissions = Array.from({ length: 20 }, (_, index) => ({
      ...DEMO_SCENARIOS[0].admission,
      admissionReason: `Ingreso QA ${index} (sintético): laceración de antebrazo.`,
    }));
    const results = await Promise.all(admissions.map((admission) => success<AdmissionResult>('/api/admissions', admission)));
    expect(new Set(results.map((result) => result.caseId)).size).toBe(20);
    const allEventIds: string[] = [];
    await Promise.all(results.map(async (result, index) => {
      expect(result.status).toBe('VERIFIED');
      const detail = await success<Detail>(`/api/cases/${result.caseId}`);
      expect(detail.case.admission.admissionReason).toBe(admissions[index].admissionReason);
      expect(detail.evidence).toHaveLength(3);
      expect(detail.evidence.every((item) => item.caseId === result.caseId)).toBe(true);
      const { events } = await success<{ events: CaseEvent[] }>(`/api/cases/${result.caseId}/events`);
      assertTimeline(events, result.caseId);
      assertNotifications(detail.notifications, result.caseId, 1);
      allEventIds.push(...events.map((event) => event.id));
    }));
    expect(new Set(allEventIds).size).toBe(allEventIds.length);
  }, 120_000);
});
