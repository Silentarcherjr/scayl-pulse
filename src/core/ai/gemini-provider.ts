import { GoogleGenAI } from '@google/genai';
import { env } from '@/lib/env';
import type { AiProvider, AnalyzerRequest, AnalyzerResponse } from './provider';

/**
 * Google Gemini implementation of the analyzer port.
 *
 * Uses structured output (responseMimeType + responseSchema) so the model is
 * constrained to our contract. The result is STILL validated with Zod before
 * anything downstream sees it — a schema hint is not a guarantee.
 */
export class GeminiProvider implements AiProvider {
  readonly name = 'google-gemini';
  readonly isModelBacked = true;
  /** Primary model; reported for identification. */
  readonly model: string;
  /** Primary first, then the configured fallbacks. */
  private readonly models: string[];
  private readonly client: GoogleGenAI;

  constructor(apiKey?: string, models?: string[]) {
    const key = apiKey ?? env.geminiApiKey;
    if (!key) throw new Error('GEMINI_API_KEY is not configured');
    const chain = models ?? [env.geminiModel, ...env.geminiFallbackModels];
    this.models = [...new Set(chain.filter(Boolean))];
    this.model = this.models[0];
    this.client = new GoogleGenAI({ apiKey: key });
  }

  /** 429 and 5xx are explicitly temporary; auth and schema errors are not. */
  private static isTransient(message: string): boolean {
    return /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(message);
  }

  /**
   * Walks the model chain. A transient failure moves to the next model rather
   * than retrying the same one: "high demand" on a given model returns 503
   * again on an immediate retry, whereas a sibling model usually has capacity.
   * A non-transient failure (bad key, bad schema) stops immediately — trying
   * another model would only burn the request budget.
   */
  async analyze(request: AnalyzerRequest): Promise<AnalyzerResponse> {
    const startedAt = Date.now();
    const errors: string[] = [];

    for (const model of this.models) {
      const result = await this.attempt(request, model);
      if (result.raw) {
        return { ...result, modelUsed: model, latencyMs: Date.now() - startedAt };
      }
      errors.push(`${model}: ${result.error}`);
      if (!GeminiProvider.isTransient(result.error ?? '')) break;
    }

    return {
      raw: null,
      error: errors.join(' | '),
      latencyMs: Date.now() - startedAt,
      modelUsed: this.models[this.models.length - 1],
    };
  }

  private async attempt(request: AnalyzerRequest, model: string): Promise<AnalyzerResponse> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);

    try {
      const response = await this.client.models.generateContent({
        model,
        contents: request.userPrompt,
        config: {
          systemInstruction: request.systemInstruction,
          responseMimeType: 'application/json',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          responseSchema: request.responseSchema as any,
          temperature: 0.2,
          abortSignal: controller.signal,
        },
      });

      const raw = response.text ?? null;
      return { raw, error: raw ? null : 'Gemini returned an empty response', latencyMs: Date.now() - startedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isTimeout = controller.signal.aborted;
      return {
        raw: null,
        error: isTimeout ? `Gemini request timed out after ${request.timeoutMs}ms` : message,
        latencyMs: Date.now() - startedAt,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
