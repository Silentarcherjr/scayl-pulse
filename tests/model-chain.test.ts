import { describe, expect, it } from 'vitest';
import { analyzeEvidence } from '@/core/ai/evidence-analyzer';
import { buildCaseFacts } from '@/core/orchestrator/case-facts';
import { findScenario } from '@/data/synthetic/scenarios';
import { newRepository } from './helpers';
import type { AiProvider, AnalyzerResponse } from '@/core/ai/provider';

const green = findScenario('green-verified')!;

/** Fails with 503 for every model except the one named. */
class ChainProvider implements AiProvider {
  readonly name = 'google-gemini';
  readonly isModelBacked = true;
  readonly model: string;
  readonly attempts: string[] = [];

  constructor(
    private readonly models: string[],
    private readonly workingModel: string | null,
  ) {
    this.model = models[0];
  }

  async analyze(): Promise<AnalyzerResponse> {
    for (const model of this.models) {
      this.attempts.push(model);
      if (model === this.workingModel) {
        const payload = {
          suggestedStatus: 'VERIFIED',
          confidence: 0.88,
          summary: 'Cobertura verificada.',
          reason: 'Sin hallazgos.',
          evidence: [],
          missingDocuments: [],
          recommendedAction: 'Confirmar a admisiones.',
          potentiallyRelatedConditions: [],
          openQuestions: [],
        };
        return { raw: JSON.stringify(payload), error: null, latencyMs: 20, modelUsed: model };
      }
    }
    return { raw: null, error: '503 UNAVAILABLE high demand', latencyMs: 30 };
  }
}

async function factsFor() {
  const repository = newRepository();
  const created = await repository.createCase({
    admission: green.admission,
    hospitalId: 'hosp-001',
    patientId: 'pat-001',
    policyId: 'pol-001',
    scenarioId: null,
  });
  return { repository, facts: await buildCaseFacts(repository, created) };
}

describe('Cadena de modelos ante saturación', () => {
  it('pasa al siguiente modelo cuando el primero devuelve 503', async () => {
    const { repository, facts } = await factsFor();
    const provider = new ChainProvider(['gemini-3.5-flash', 'gemini-3.5-flash-lite'], 'gemini-3.5-flash-lite');

    const result = await analyzeEvidence({ facts, repository, provider });

    expect(result.analysis).not.toBeNull();
    expect(result.model).toBe('gemini-3.5-flash-lite');
    expect(provider.attempts).toEqual(['gemini-3.5-flash', 'gemini-3.5-flash-lite']);
  });

  it('registra en la auditoría el modelo que realmente respondió', async () => {
    const { repository, facts } = await factsFor();
    const provider = new ChainProvider(['gemini-3.5-flash', 'gemini-3.5-flash-lite'], 'gemini-3.5-flash-lite');

    await analyzeEvidence({ facts, repository, provider });
    const interactions = await repository.listAiInteractions(facts.case.id);

    expect(interactions[0].model).toBe('gemini-3.5-flash-lite');
    expect(interactions[0].valid).toBe(true);
  });

  it('si toda la cadena falla, cae al analizador determinístico sin romperse', async () => {
    const { repository, facts } = await factsFor();
    const provider = new ChainProvider(['gemini-3.5-flash', 'gemini-3.5-flash-lite'], null);

    const result = await analyzeEvidence({ facts, repository, provider });

    expect(result.analysis).not.toBeNull();
    expect(result.fellBackToDeterministic).toBe(true);
    expect(result.modelBacked).toBe(false);
  });
});
