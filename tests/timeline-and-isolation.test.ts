import { describe, expect, it } from 'vitest';
import { CaseOrchestrator } from '@/core/orchestrator/case-orchestrator';
import { findScenario } from '@/data/synthetic/scenarios';
import { InMemoryCaseRepository } from '@/core/repository/in-memory-repository';
import { newRepository } from './helpers';

const green = findScenario('green-verified')!;
const yellow = findScenario('yellow-documents-required')!;
const red = findScenario('red-human-review')!;

describe('Timeline inmutable', () => {
  it('el puerto de persistencia no expone ninguna forma de modificar o borrar eventos', () => {
    const repository = new InMemoryCaseRepository();
    const surface = [
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(repository)),
      ...Object.keys(repository),
    ];
    for (const forbidden of ['updateEvent', 'deleteEvent', 'removeEvent', 'editEvent', 'deleteEvents']) {
      expect(surface).not.toContain(forbidden);
    }
  });

  it('los eventos previos no cambian al añadir nuevos y la secuencia es monótona', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });

    const first = await orchestrator.processAdmission(yellow.admission);
    const before = await repository.listEvents(first.case.id);
    const snapshot = JSON.stringify(before);

    await orchestrator.submitEvidence(first.case.id, yellow.followUps[0].evidence);
    const after = await repository.listEvents(first.case.id);

    expect(after.length).toBeGreaterThan(before.length);
    expect(JSON.stringify(after.slice(0, before.length))).toBe(snapshot);
    expect(after.map((e) => e.seq)).toEqual(after.map((_, i) => i + 1));
  });

  it('mutar el array devuelto por listEvents no afecta el almacenamiento', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });
    const result = await orchestrator.processAdmission(green.admission);

    const events = await repository.listEvents(result.case.id);
    const originalLength = events.length;
    events.pop();
    events[0].message = 'TAMPERED';

    const fresh = await repository.listEvents(result.case.id);
    expect(fresh).toHaveLength(originalLength);
    expect(fresh[0].message).not.toBe('TAMPERED');
  });

  it('el timeline conserva todas las decisiones anteriores tras la reevaluación', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });

    const first = await orchestrator.processAdmission(red.admission);
    expect(first.decision.status).toBe('HUMAN_REVIEW');

    const second = await orchestrator.submitEvidence(first.case.id, red.followUps[0].evidence);
    expect(second.decision.status).toBe('VERIFIED');

    const events = await repository.listEvents(first.case.id);
    const decisions = events
      .filter((e) => e.type === 'CASE_CLASSIFIED' || e.type === 'DECISION_UPDATED')
      .map((e) => (e.payload.decision as { status: string }).status);

    expect(decisions).toEqual(['HUMAN_REVIEW', 'VERIFIED']);
    expect(events.some((e) => e.type === 'NEW_EVIDENCE_RECEIVED')).toBe(true);
    expect(events.some((e) => e.type === 'REASSESSMENT_STARTED')).toBe(true);
    // The superseded decision is still readable in the audit trail.
    expect(events.find((e) => e.type === 'CASE_CLASSIFIED')?.statusAfter).toBe('HUMAN_REVIEW');
  });

  it('registra el recorrido completo que la UI necesita mostrar', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });
    const result = await orchestrator.processAdmission(green.admission);
    const types = (await repository.listEvents(result.case.id)).map((e) => e.type);

    for (const expected of [
      'ADMISSION_RECEIVED',
      'PATIENT_IDENTIFIED',
      'POLICY_RETRIEVED',
      'POLICY_VALIDATED',
      'HISTORY_RETRIEVED',
      'AI_ANALYSIS_STARTED',
      'SAFETY_GATE_APPLIED',
      'CASE_CLASSIFIED',
      'HOSPITAL_NOTIFIED',
      'INSURER_NOTIFIED',
    ]) {
      expect(types, `falta el evento ${expected}`).toContain(expected);
    }
  });
});

describe('Reevaluación por nueva evidencia', () => {
  it('la nueva evidencia dispara REASSESSING y una decisión actualizada', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });

    const first = await orchestrator.processAdmission(yellow.admission);
    expect(first.decision.status).toBe('DOCUMENTS_REQUIRED');

    await orchestrator.submitEvidence(first.case.id, yellow.followUps[0].evidence);
    const second = await orchestrator.submitEvidence(first.case.id, yellow.followUps[1].evidence);

    expect(second.decision.status).toBe('VERIFIED');
    const events = await repository.listEvents(first.case.id);
    expect(events.filter((e) => e.type === 'REASSESSMENT_STARTED')).toHaveLength(2);
    expect(events.filter((e) => e.type === 'DECISION_UPDATED')).toHaveLength(2);
  });

  it('un caso inexistente devuelve NOT_FOUND', async () => {
    const orchestrator = new CaseOrchestrator({ repository: newRepository() });
    await expect(
      orchestrator.submitEvidence('00000000-0000-0000-0000-000000000000', {
        documentType: 'MEDICAL_REPORT',
        title: 'x',
        content: 'y',
        submittedBy: 'test',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('Aislamiento entre casos', () => {
  it('cada caso solo ve su propia evidencia, timeline y notificaciones', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });

    const caseA = await orchestrator.processAdmission(green.admission);
    const caseB = await orchestrator.processAdmission(red.admission);

    await orchestrator.submitEvidence(caseB.case.id, red.followUps[0].evidence);

    const evidenceA = await repository.listEvidence(caseA.case.id);
    const evidenceB = await repository.listEvidence(caseB.case.id);
    expect(evidenceA.every((e) => e.caseId === caseA.case.id)).toBe(true);
    expect(evidenceB.every((e) => e.caseId === caseB.case.id)).toBe(true);
    expect(evidenceA.some((e) => e.documentType === 'SPECIALIST_REPORT')).toBe(false);

    const eventsA = await repository.listEvents(caseA.case.id);
    expect(eventsA.every((e) => e.caseId === caseA.case.id)).toBe(true);
    expect(eventsA.some((e) => e.type === 'REASSESSMENT_STARTED')).toBe(false);

    const notificationsA = await repository.listNotifications(caseA.case.id);
    expect(notificationsA.every((n) => n.caseId === caseA.case.id)).toBe(true);
    expect(notificationsA.some((n) => n.body.includes(caseB.case.caseNumber))).toBe(false);

    // Decisions stay independent.
    expect(caseA.decision.status).toBe('VERIFIED');
    expect((await repository.getCase(caseB.case.id))?.status).toBe('VERIFIED');
    expect((await repository.getCase(caseA.case.id))?.currentDecision?.status).toBe('VERIFIED');
    expect(caseA.case.id).not.toBe(caseB.case.id);
  });
});

describe('Notificación simultánea a ambos destinatarios', () => {
  it('notifica a admisiones del hospital y al gestor de casos de la aseguradora', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });
    const result = await orchestrator.processAdmission(green.admission);

    const notifications = await repository.listNotifications(result.case.id);
    expect(notifications.map((n) => n.channel).sort()).toEqual(['HOSPITAL_ADMISSIONS', 'INSURER_CASE_MANAGER']);
    for (const n of notifications) {
      expect(n.status).toBe('SENT');
      expect(n.body).toContain('no interrumpe la atención de emergencia');
    }
  });
});
