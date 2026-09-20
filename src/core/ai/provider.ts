/**
 * Provider port for the evidence analyzer.
 *
 * The rest of the system knows nothing about Gemini. Swapping providers means
 * adding one file that implements this interface (docs/DECISIONS.md DEC-003).
 */
export interface AnalyzerRequest {
  systemInstruction: string;
  userPrompt: string;
  /** JSON Schema the provider must constrain its output to. */
  responseSchema: unknown;
  timeoutMs: number;
}

export interface AnalyzerResponse {
  /** Raw text returned by the provider. Never trusted, always validated. */
  raw: string | null;
  error: string | null;
  latencyMs: number;
  /** Which model actually answered, when the provider tried more than one. */
  modelUsed?: string;
}

export interface AiProvider {
  /** Recorded verbatim in ai_interactions and in docs/AI_USAGE_LOG.md. */
  readonly name: string;
  readonly model: string;
  /** True for real model calls, false for the deterministic fallback. */
  readonly isModelBacked: boolean;
  analyze(request: AnalyzerRequest): Promise<AnalyzerResponse>;
}
