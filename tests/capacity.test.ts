import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertCapacityAvailable } from '@/core/demo/capacity';
import { CaseOrchestrator } from '@/core/orchestrator/case-orchestrator';
import { findScenario } from '@/data/synthetic/scenarios';
import { newRepository } from './helpers';

const green = findScenario('green-verified')!;

afterEach(() => vi.unstubAllEnvs());

describe('Límite de casos almacenados', () => {
  it('permite ingresos mientras haya espacio', async () => {
    vi.stubEnv('SCAYL_MAX_CASES', '5');
    const repository = newRepository();

    await expect(assertCapacityAvailable(repository)).resolves.toBeUndefined();
  });

  it('rechaza con 429 y explica cómo liberar espacio cuando se alcanza el tope', async () => {
    vi.stubEnv('SCAYL_MAX_CASES', '2');
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });

    await orchestrator.processAdmission(green.admission);
    await orchestrator.processAdmission(green.admission);

    // This is the failure mode that produced 247 junk cases in production:
    // a loop hitting an unauthenticated, mutating endpoint.
    await expect(assertCapacityAvailable(repository)).rejects.toMatchObject({
      code: 'CAPACITY_REACHED',
      status: 429,
    });

    await expect(assertCapacityAvailable(repository)).rejects.toThrow(/TRUNCATE|reiniciar/i);
  });

  it('el tope cuenta los casos existentes, no las peticiones', async () => {
    vi.stubEnv('SCAYL_MAX_CASES', '3');
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });

    const first = await orchestrator.processAdmission(green.admission);
    // Reassessing an existing case creates no new case, so it must not count.
    await orchestrator.submitEvidence(first.case.id, {
      documentType: 'LAB_RESULT',
      title: 'Hemograma',
      content: 'Sin hallazgos relevantes.',
      submittedBy: 'test',
    });

    expect(await repository.countCases()).toBe(1);
    await expect(assertCapacityAvailable(repository)).resolves.toBeUndefined();
  });

  it('usa 200 por defecto y ignora un valor inválido', async () => {
    vi.stubEnv('SCAYL_MAX_CASES', 'no-es-un-numero');
    const repository = newRepository();
    await expect(assertCapacityAvailable(repository)).resolves.toBeUndefined();
  });
});
