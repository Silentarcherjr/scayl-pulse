import { describe, expect, it } from 'vitest';
import { runScenario } from '@/core/demo/demo-runner';
import { newRepository } from './helpers';

describe('Escenarios obligatorios GREEN / YELLOW / RED', () => {
  it('GREEN: póliza vigente, hospital en red y documentación completa → VERIFIED', async () => {
    const result = await runScenario('green-verified', { repository: newRepository() });

    expect(result.finalStatus).toBe('VERIFIED');
    expect(result.matchedExpectation).toBe(true);
    expect(result.steps[0].decision.requiresHuman).toBe(false);
    expect(result.steps[0].decision.missingDocuments.filter((m) => m.severity === 'BLOCKING')).toHaveLength(0);
  });

  it('YELLOW: falta documentación obligatoria → DOCUMENTS_REQUIRED y dice exactamente qué falta', async () => {
    const result = await runScenario('yellow-documents-required', { repository: newRepository() });

    expect(result.finalStatus).toBe('DOCUMENTS_REQUIRED');
    const blocking = result.steps[0].decision.missingDocuments.filter((m) => m.severity === 'BLOCKING');
    expect(blocking.map((m) => m.documentType).sort()).toEqual(['COST_ESTIMATE', 'MEDICAL_REPORT']);
    for (const m of blocking) expect(m.reason.length).toBeGreaterThan(10);
  });

  it('RED: preexistencia potencial sin evidencia suficiente → HUMAN_REVIEW con evidencia y acción recomendada', async () => {
    const result = await runScenario('red-human-review', { repository: newRepository() });
    const decision = result.steps[0].decision;

    expect(result.finalStatus).toBe('HUMAN_REVIEW');
    expect(decision.requiresHuman).toBe(true);
    expect(decision.appliedRules).toContain('PRE_EXISTING_UNRESOLVED');
    expect(decision.evidence.some((e) => e.sourceType === 'MEDICAL_HISTORY')).toBe(true);
    expect(decision.reason).toContain('PRE_EXISTING_UNRESOLVED');
    expect(decision.recommendedAction.length).toBeGreaterThan(10);
    // The product must never claim it can stop emergency care.
    expect(decision.reason).toContain('no puede impedir la atención de emergencia');
  });

  it('YELLOW se reevalúa hasta VERIFIED cuando llegan los documentos faltantes', async () => {
    const result = await runScenario('yellow-documents-required', {
      repository: newRepository(),
      applyFollowUps: true,
    });

    expect(result.steps.map((s) => s.status)).toEqual(['DOCUMENTS_REQUIRED', 'DOCUMENTS_REQUIRED', 'VERIFIED']);
    expect(result.matchedExpectation).toBe(true);
  });

  it('RED se reevalúa hasta VERIFIED cuando cardiología documenta el antecedente', async () => {
    const result = await runScenario('red-human-review', {
      repository: newRepository(),
      applyFollowUps: true,
    });

    expect(result.steps.map((s) => s.status)).toEqual(['HUMAN_REVIEW', 'VERIFIED']);
    expect(result.finalStatus).toBe('VERIFIED');
  });

  it('EXTRA: póliza vencida y hospital fuera de red escalan a HUMAN_REVIEW', async () => {
    const expired = await runScenario('extra-expired-policy', { repository: newRepository() });
    expect(expired.finalStatus).toBe('HUMAN_REVIEW');
    expect(expired.steps[0].decision.appliedRules).toContain('POLICY_EXPIRED');

    const outOfNetwork = await runScenario('extra-out-of-network', { repository: newRepository() });
    expect(outOfNetwork.finalStatus).toBe('HUMAN_REVIEW');
    expect(outOfNetwork.steps[0].decision.appliedRules).toContain('HOSPITAL_OUT_OF_NETWORK');
  });
});
