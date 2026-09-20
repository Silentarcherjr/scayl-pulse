import { describe, expect, it } from 'vitest';
import { runScenario } from '@/core/demo/demo-runner';
import { CaseOrchestrator } from '@/core/orchestrator/case-orchestrator';
import { findScenario } from '@/data/synthetic/scenarios';
import { OverlyPermissiveProvider, newRepository } from './helpers';
import type { DecisionCheck } from '@/core/safety/decision-checks';

const byCode = (checks: DecisionCheck[], code: string) => checks.find((c) => c.code === code)!;

describe('IDEA-006 — por qué tomó esta decisión', () => {
  it('GREEN: informa las comprobaciones que PASARON, no solo las que fallan', async () => {
    const result = await runScenario('green-verified', { repository: newRepository() });
    const checks = result.steps[0].decision.checks;

    expect(byCode(checks, 'POLICY_ACTIVE').status).toBe('PASSED');
    expect(byCode(checks, 'HOSPITAL_IN_NETWORK').status).toBe('PASSED');
    expect(byCode(checks, 'REQUIRED_DOCUMENTS').status).toBe('PASSED');
    expect(byCode(checks, 'PRE_EXISTING_CONDITIONS').status).toBe('PASSED');
    expect(byCode(checks, 'SAFETY_GATE').status).toBe('PASSED');
    expect(checks.every((c) => c.detail.length > 0)).toBe(true);
  });

  it('RED: reproduce exactamente el panel que pidió el producto', async () => {
    const result = await runScenario('red-human-review', { repository: newRepository() });
    const checks = result.steps[0].decision.checks;

    expect(byCode(checks, 'POLICY_ACTIVE').status).toBe('PASSED');
    expect(byCode(checks, 'HOSPITAL_IN_NETWORK').status).toBe('PASSED');
    expect(byCode(checks, 'PRE_EXISTING_CONDITIONS').status).toBe('WARNING');
    expect(byCode(checks, 'EVIDENCE_SUFFICIENCY').status).toBe('FAILED');
    expect(byCode(checks, 'EVIDENCE_SUFFICIENCY').imposedFloor).toBe('HUMAN_REVIEW');
    expect(byCode(checks, 'SAFETY_GATE').detail).toContain('impidió una decisión automática');
  });

  it('cada comprobación fallida declara el suelo que impone', async () => {
    const result = await runScenario('extra-expired-policy', { repository: newRepository() });
    const checks = result.steps[0].decision.checks;

    expect(byCode(checks, 'POLICY_ACTIVE').status).toBe('FAILED');
    expect(byCode(checks, 'POLICY_ACTIVE').imposedFloor).toBe('HUMAN_REVIEW');
    expect(byCode(checks, 'POLICY_ACTIVE').evidence?.sourceType).toBe('POLICY');
  });

  it('YELLOW: la documentación faltante impone DOCUMENTS_REQUIRED y se resuelve al llegar', async () => {
    const result = await runScenario('yellow-documents-required', {
      repository: newRepository(),
      applyFollowUps: true,
    });

    const first = byCode(result.steps[0].decision.checks, 'REQUIRED_DOCUMENTS');
    expect(first.status).toBe('FAILED');
    expect(first.imposedFloor).toBe('DOCUMENTS_REQUIRED');

    // Blocking documents are complete; the advisory triage note is still
    // missing, which warns but must not block.
    const last = byCode(result.steps[result.steps.length - 1].decision.checks, 'REQUIRED_DOCUMENTS');
    expect(last.status).toBe('WARNING');
    expect(last.imposedFloor).toBeUndefined();
    expect(result.steps[result.steps.length - 1].decision.status).toBe('VERIFIED');
  });

  it('el panel refleja cuándo el Safety Gate corrigió al modelo', async () => {
    const orchestrator = new CaseOrchestrator({
      repository: newRepository(),
      aiProvider: new OverlyPermissiveProvider(),
    });
    const result = await orchestrator.processAdmission(findScenario('extra-expired-policy')!.admission);

    const gate = byCode(result.decision.checks, 'SAFETY_GATE');
    expect(gate.status).toBe('WARNING');
    expect(gate.detail).toContain('el modelo propuso VERIFIED');
  });

  it('marca NOT_EVALUATED lo que no aplica, en vez de omitirlo', async () => {
    const result = await runScenario('green-verified', { repository: newRepository() });
    const checks = result.steps[0].decision.checks;

    // No pre-existing conflict to settle, and the deterministic analyzer is
    // not a model — its confidence must not be presented as one.
    expect(byCode(checks, 'EVIDENCE_SUFFICIENCY').status).toBe('NOT_EVALUATED');
    expect(byCode(checks, 'ANALYSIS_CONFIDENCE').status).toBe('NOT_EVALUATED');
  });

  it('el orden de las comprobaciones es estable entre casos', async () => {
    const a = await runScenario('green-verified', { repository: newRepository() });
    const b = await runScenario('red-human-review', { repository: newRepository() });

    const codesA = a.steps[0].decision.checks.map((c) => c.code);
    const codesB = b.steps[0].decision.checks.map((c) => c.code);
    expect(codesA).toEqual(codesB);
  });
});
