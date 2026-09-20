import { AI_ANALYSIS_RESPONSE_SCHEMA, aiAnalysisSchema } from '@/core/domain/schemas';
import { env, isGeminiConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { CaseRepository } from '@/core/repository';
import type { AiAnalysis } from '@/core/domain/types';
import type { CaseFacts } from '@/core/orchestrator/case-facts';
import { DeterministicProvider } from './deterministic-provider';
import { GeminiProvider } from './gemini-provider';
import { SYSTEM_INSTRUCTION, buildUserPrompt } from './prompts';
import type { AiProvider } from './provider';

/**
 * Kept tight on purpose: a scenario with follow-ups runs the pipeline up to
 * three times in a single HTTP request, so the per-call budget has to fit
 * inside the platform's function limit. Exceeding it degrades to the
 * deterministic analyzer, which is safe and honestly labelled.
 */
export const ANALYZER_TIMEOUT_MS = 10_000;

export interface AnalyzeResult {
  analysis: AiAnalysis | null;
  providerName: string;
  model: string;
  modelBacked: boolean;
  /** Set when the primary (model) provider failed and the fallback was used. */
  fellBackToDeterministic: boolean;
  error: string | null;
  latencyMs: number;
}

/** Models sometimes wrap JSON in a markdown fence even under structured output. */
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return trimmed;
}

function parseAnalysis(raw: string | null): { analysis: AiAnalysis | null; error: string | null } {
  if (!raw) return { analysis: null, error: 'Empty provider response' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return { analysis: null, error: 'Provider response was not valid JSON' };
  }
  const result = aiAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    return {
      analysis: null,
      error: `Provider response failed schema validation: ${result.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ')}`,
    };
  }
  return { analysis: result.data, error: null };
}

export function selectProvider(facts: CaseFacts): AiProvider {
  if (!env.forceFixtureAi && isGeminiConfigured()) {
    try {
      return new GeminiProvider();
    } catch (error) {
      logger.warn('Falling back to deterministic analyzer', { error: String(error) });
    }
  }
  return new DeterministicProvider(facts);
}

/**
 * Runs the evidence analysis.
 *
 * Guarantees for callers:
 *  - never throws;
 *  - returns `analysis: null` when nothing valid could be produced, which the
 *    Safety Gate handles as "decide with rules only";
 *  - records every attempt in ai_interactions for the AI usage deliverable.
 */
export async function analyzeEvidence(params: {
  facts: CaseFacts;
  repository: CaseRepository;
  provider?: AiProvider;
}): Promise<AnalyzeResult> {
  const { facts, repository } = params;
  const primary = params.provider ?? selectProvider(facts);
  const request = {
    systemInstruction: SYSTEM_INSTRUCTION,
    userPrompt: buildUserPrompt(facts),
    responseSchema: AI_ANALYSIS_RESPONSE_SCHEMA,
    timeoutMs: ANALYZER_TIMEOUT_MS,
  };

  const attempt = await runProvider(primary, request, facts, repository);
  if (attempt.analysis || !primary.isModelBacked) {
    return { ...attempt, fellBackToDeterministic: false };
  }

  logger.warn('Model analyzer unusable, falling back to deterministic analyzer', {
    caseId: facts.case.id,
    provider: primary.name,
    error: attempt.error,
  });

  const fallback = new DeterministicProvider(facts);
  const fallbackAttempt = await runProvider(fallback, request, facts, repository);
  return {
    ...fallbackAttempt,
    fellBackToDeterministic: true,
    error: attempt.error,
  };
}

async function runProvider(
  provider: AiProvider,
  request: Parameters<AiProvider['analyze']>[0],
  facts: CaseFacts,
  repository: CaseRepository,
): Promise<Omit<AnalyzeResult, 'fellBackToDeterministic'>> {
  let raw: string | null = null;
  let error: string | null = null;
  let latencyMs = 0;

  try {
    const response = await provider.analyze(request);
    raw = response.raw;
    error = response.error;
    latencyMs = response.latencyMs;
  } catch (unexpected) {
    // A provider SDK throwing must never take a case down.
    error = unexpected instanceof Error ? unexpected.message : String(unexpected);
  }

  const { analysis, error: parseError } = parseAnalysis(raw);
  const finalError = error ?? parseError;

  try {
    await repository.recordAiInteraction({
      caseId: facts.case.id,
      provider: provider.name,
      model: provider.model,
      valid: analysis !== null,
      latencyMs,
      error: finalError,
      // Truncated: enough to audit, small enough to store.
      rawResponse: raw ? raw.slice(0, 8_000) : null,
    });
  } catch (recordError) {
    logger.warn('Could not record AI interaction', { error: String(recordError) });
  }

  return {
    analysis,
    providerName: provider.name,
    model: provider.model,
    modelBacked: provider.isModelBacked,
    error: finalError,
    latencyMs,
  };
}
