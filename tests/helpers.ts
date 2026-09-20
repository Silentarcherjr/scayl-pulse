import { InMemoryCaseRepository } from '@/core/repository/in-memory-repository';
import { CaseOrchestrator } from '@/core/orchestrator/case-orchestrator';
import type { AiProvider, AnalyzerResponse } from '@/core/ai/provider';

export function newRepository() {
  return new InMemoryCaseRepository();
}

export function newOrchestrator(repository = newRepository(), aiProvider?: AiProvider) {
  return { repository, orchestrator: new CaseOrchestrator({ repository, aiProvider }) };
}

/** Returns syntactically valid JSON that does not satisfy the schema. */
export class MalformedProvider implements AiProvider {
  readonly name = 'google-gemini';
  readonly model = 'test-malformed';
  readonly isModelBacked = true;
  constructor(private readonly payload: string = '{"suggestedStatus": "TOTALLY_MADE_UP", "confidence": 42}') {}
  async analyze(): Promise<AnalyzerResponse> {
    return { raw: this.payload, error: null, latencyMs: 3 };
  }
}

/** Simulates a provider outage (timeout / rate limit / 5xx). */
export class FailingProvider implements AiProvider {
  readonly name = 'google-gemini';
  readonly model = 'test-failing';
  readonly isModelBacked = true;
  constructor(private readonly message = 'Gemini request timed out after 20000ms') {}
  async analyze(): Promise<AnalyzerResponse> {
    return { raw: null, error: this.message, latencyMs: 20_000 };
  }
}

/** Simulates an SDK that throws instead of returning an error result. */
export class ThrowingProvider implements AiProvider {
  readonly name = 'google-gemini';
  readonly model = 'test-throwing';
  readonly isModelBacked = true;
  async analyze(): Promise<AnalyzerResponse> {
    throw new Error('socket hang up');
  }
}

/**
 * A model that returns a perfectly-formed but WRONG answer: it claims
 * everything is fine and cites records that do not exist.
 */
export class OverlyPermissiveProvider implements AiProvider {
  readonly name = 'google-gemini';
  readonly model = 'test-permissive';
  readonly isModelBacked = true;
  constructor(private readonly confidence = 0.99) {}
  async analyze(): Promise<AnalyzerResponse> {
    const payload = {
      suggestedStatus: 'VERIFIED',
      confidence: this.confidence,
      summary: 'Todo en orden, cobertura confirmada sin observaciones.',
      reason: 'La póliza está vigente y no hay hallazgos.',
      evidence: [
        { sourceType: 'POLICY', sourceId: 'POL-INEXISTENTE-9999', excerpt: 'Cláusula inventada por el modelo.' },
        { sourceType: 'MEDICAL_HISTORY', sourceId: 'mh-no-existe', excerpt: 'Antecedente inventado.' },
      ],
      missingDocuments: [],
      recommendedAction: 'Autorizar de inmediato.',
      potentiallyRelatedConditions: [],
      openQuestions: [],
    };
    return { raw: JSON.stringify(payload), error: null, latencyMs: 5 };
  }
}
