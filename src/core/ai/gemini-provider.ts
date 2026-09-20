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
  readonly model: string;
  private readonly client: GoogleGenAI;

  constructor(apiKey?: string, model?: string) {
    const key = apiKey ?? env.geminiApiKey;
    if (!key) throw new Error('GEMINI_API_KEY is not configured');
    this.model = model ?? env.geminiModel;
    this.client = new GoogleGenAI({ apiKey: key });
  }

  /** 429 and 5xx are explicitly temporary; auth and schema errors are not. */
  private static isTransient(message: string): boolean {
    return /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(message);
  }

  async analyze(request: AnalyzerRequest): Promise<AnalyzerResponse> {
    const startedAt = Date.now();
    // One retry only. Gemini returned a genuine 503 "high demand" during
    // testing; retrying once turns a transient spike into a successful call
    // instead of a silent drop to the deterministic fallback. Retrying an
    // auth or schema failure would only burn the request budget.
    const first = await this.attempt(request);
    if (first.raw || !GeminiProvider.isTransient(first.error ?? '')) {
      return { ...first, latencyMs: Date.now() - startedAt };
    }

    await new Promise((resolve) => setTimeout(resolve, 600));
    const second = await this.attempt(request);
    return {
      ...second,
      error: second.raw ? null : `${first.error} (reintento: ${second.error})`,
      latencyMs: Date.now() - startedAt,
    };
  }

  private async attempt(request: AnalyzerRequest): Promise<AnalyzerResponse> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
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
