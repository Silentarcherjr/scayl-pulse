/**
 * Environment access. Nothing here throws at import time: the app must boot
 * (and the demo must run) even when Gemini or Supabase are not configured.
 * See docs/DECISIONS.md DEC-005.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export const env = {
  get supabaseUrl() {
    return read('NEXT_PUBLIC_SUPABASE_URL');
  },
  get supabaseAnonKey() {
    return read('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  },
  get supabaseServiceRoleKey() {
    return read('SUPABASE_SERVICE_ROLE_KEY');
  },
  get geminiApiKey() {
    return read('GEMINI_API_KEY');
  },
  get geminiModel() {
    return read('GEMINI_MODEL') ?? 'gemini-2.5-flash';
  },
  get admissionWebhookSecret() {
    return read('ADMISSION_WEBHOOK_SECRET');
  },
  get nodeEnv() {
    return read('NODE_ENV') ?? 'development';
  },
  /** Forces the in-memory repository even if Supabase is configured. */
  get forceInMemory() {
    return read('SCAYL_FORCE_IN_MEMORY') === 'true';
  },
  /** Forces the deterministic fixture analyzer even if Gemini is configured. */
  get forceFixtureAi() {
    return read('SCAYL_FORCE_FIXTURE_AI') === 'true';
  },
} as const;

export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && (env.supabaseServiceRoleKey ?? env.supabaseAnonKey));
}

export function isGeminiConfigured(): boolean {
  return Boolean(env.geminiApiKey);
}

/** Reported by GET /api/health so the team can see what is live at a glance. */
export function runtimeCapabilities() {
  return {
    persistence: !env.forceInMemory && isSupabaseConfigured() ? 'supabase' : 'in-memory',
    aiProvider: !env.forceFixtureAi && isGeminiConfigured() ? 'gemini' : 'deterministic-fixture',
    geminiModel: isGeminiConfigured() ? env.geminiModel : null,
  } as const;
}
