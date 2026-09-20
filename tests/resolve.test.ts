import { describe, expect, it } from 'vitest';
import { CaseOrchestrator } from '@/core/orchestrator/case-orchestrator';
import { findScenario } from '@/data/synthetic/scenarios';
import { newRepository } from './helpers';

const green = findScenario('green-verified')!;
const red = findScenario('red-human-review')!;
const yellow = findScenario('yellow-documents-required')!;

describe('Cierre humano del caso', () => {
  it('cierra un caso verificado y registra quién y por qué', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });
    const { case: caseRecord } = await orchestrator.processAdmission(green.admission);

    const { case: closed, resolution } = await orchestrator.resolveCase(caseRecord.id, {
      outcome: 'COVERAGE_CONFIRMED',
      resolvedBy: 'Gestora de casos: L. Ramírez',
      reason: 'Cobertura verificada por el sistema y confirmada tras revisar el expediente.',
    });

    expect(closed.status).toBe('RESOLVED');
    expect(resolution.resolvedBy).toBe('Gestora de casos: L. Ramírez');
    expect(resolution.statusAtResolution).toBe('VERIFIED');
    expect(resolution.overrodeSystemRecommendation).toBe(false);
    expect(closed.resolution?.outcome).toBe('COVERAGE_CONFIRMED');
  });

  it('marca cuando una persona confirma cobertura que el sistema NO verificó', async () => {
    // This is legitimate — it is what human-in-the-loop is for — but it is
    // the first thing an auditor looks for, so it is recorded explicitly.
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });
    const { case: caseRecord, decision } = await orchestrator.processAdmission(red.admission);
    expect(decision.status).toBe('HUMAN_REVIEW');

    const { resolution } = await orchestrator.resolveCase(caseRecord.id, {
      outcome: 'COVERAGE_CONFIRMED',
      resolvedBy: 'Gestor de casos: J. Ortega',
      reason: 'Hablé con cardiología: el antecedente fue declarado en la suscripción y está cubierto.',
    });

    expect(resolution.overrodeSystemRecommendation).toBe(true);
    expect(resolution.statusAtResolution).toBe('HUMAN_REVIEW');
  });

  it('denegar cobertura no cuenta como contradecir al sistema', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });
    const { case: caseRecord } = await orchestrator.processAdmission(red.admission);

    const { resolution } = await orchestrator.resolveCase(caseRecord.id, {
      outcome: 'COVERAGE_DENIED',
      resolvedBy: 'Gestor de casos: J. Ortega',
      reason: 'La preexistencia está excluida por la cláusula tercera del plan contratado.',
    });

    expect(resolution.overrodeSystemRecommendation).toBe(false);
  });

  it('un caso cerrado es terminal: no se reabre ni admite evidencia', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });
    const { case: caseRecord } = await orchestrator.processAdmission(yellow.admission);

    await orchestrator.resolveCase(caseRecord.id, {
      outcome: 'CANCELLED',
      resolvedBy: 'Admisiones: M. Pérez',
      reason: 'El paciente se retiró voluntariamente antes de recibir atención.',
    });

    await expect(
      orchestrator.resolveCase(caseRecord.id, {
        outcome: 'COVERAGE_CONFIRMED',
        resolvedBy: 'Otro gestor',
        reason: 'Intento de reabrir un caso ya cerrado.',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await expect(
      orchestrator.submitEvidence(caseRecord.id, {
        documentType: 'MEDICAL_REPORT',
        title: 'Tardío',
        content: 'Llega después del cierre.',
        submittedBy: 'hospital',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('no se puede cerrar un caso inexistente', async () => {
    const orchestrator = new CaseOrchestrator({ repository: newRepository() });
    await expect(
      orchestrator.resolveCase('00000000-0000-0000-0000-000000000000', {
        outcome: 'CANCELLED',
        resolvedBy: 'Alguien',
        reason: 'El caso no existe en absoluto.',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('el cierre queda en el timeline, atribuido a una persona y no al sistema', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });
    const { case: caseRecord } = await orchestrator.processAdmission(green.admission);
    const before = await repository.listEvents(caseRecord.id);

    await orchestrator.resolveCase(caseRecord.id, {
      outcome: 'COVERAGE_CONFIRMED',
      resolvedBy: 'Gestora de casos: L. Ramírez',
      reason: 'Expediente completo y cobertura confirmada.',
    });

    const after = await repository.listEvents(caseRecord.id);
    const resolved = after.find((e) => e.type === 'CASE_RESOLVED')!;

    expect(resolved.actor).toBe('INSURER');
    expect(resolved.actor).not.toBe('AI_AGENT');
    expect(resolved.statusAfter).toBe('RESOLVED');
    expect(resolved.message).toContain('L. Ramírez');
    // Earlier events untouched.
    expect(JSON.stringify(after.slice(0, before.length))).toBe(JSON.stringify(before));
  });

  it('notifica el cierre a hospital y aseguradora, y avisa si hubo contradicción', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });
    const { case: caseRecord } = await orchestrator.processAdmission(red.admission);

    await orchestrator.resolveCase(caseRecord.id, {
      outcome: 'COVERAGE_CONFIRMED',
      resolvedBy: 'Gestor de casos: J. Ortega',
      reason: 'Antecedente aclarado por vía telefónica con el prestador.',
    });

    const notifications = await repository.listNotifications(caseRecord.id);
    const closing = notifications.filter((n) => n.subject.includes('Caso cerrado'));

    expect(closing.map((n) => n.channel).sort()).toEqual(['HOSPITAL_ADMISSIONS', 'INSURER_CASE_MANAGER']);
    for (const n of closing) {
      expect(n.body).toContain('AVISO DE AUDITORÍA');
      expect(n.body).toContain('no interrumpe la atención de emergencia');
    }
  });
});
