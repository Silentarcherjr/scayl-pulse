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

/**
 * Server-side persistence needs the SERVICE-ROLE key, not the anon key.
 *
 * RLS grants anon SELECT only (see the RLS migration), so a deployment
 * configured with URL + anon key alone would switch to Supabase and then fail
 * every single write. Falling back to in-memory in that case keeps the demo
 * alive and GET /api/health says exactly what is missing.
 */
export function isSupabaseWriteConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

/** The browser client only reads and subscribes, so the anon key is enough. */
export function isSupabaseRealtimeConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export function isGeminiConfigured(): boolean {
  return Boolean(env.geminiApiKey);
}

/** Explains a fallback instead of leaving the team guessing. */
function persistenceNote(): string | null {
  if (env.forceInMemory) return 'SCAYL_FORCE_IN_MEMORY=true está forzando el repositorio en memoria.';
  if (isSupabaseWriteConfigured()) return null;
  if (!env.supabaseUrl) return 'Falta NEXT_PUBLIC_SUPABASE_URL.';
  if (!env.supabaseServiceRoleKey) {
    return 'Falta SUPABASE_SERVICE_ROLE_KEY. La clave anon no puede escribir: RLS solo le concede lectura.';
  }
  return null;
}

/** Reported by GET /api/health so the team can see what is live at a glance. */
export function runtimeCapabilities() {
  const usingSupabase = !env.forceInMemory && isSupabaseWriteConfigured();
  return {
    persistence: usingSupabase ? 'supabase' : 'in-memory',
    persistenceNote: persistenceNote(),
    realtimeAvailable: isSupabaseRealtimeConfigured(),
    aiProvider: !env.forceFixtureAi && isGeminiConfigured() ? 'gemini' : 'deterministic-fixture',
    geminiModel: isGeminiConfigured() ? env.geminiModel : null,
  } as const;
}
