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
    // Keys never contain whitespace. A value pasted from a wrapped line can
    // carry an embedded newline, which corrupts the auth header and produces
    // an opaque 401 — strip it rather than fail mysteriously.
    return read('GEMINI_API_KEY')?.replace(/\s+/g, '');
  },
  get geminiModel() {
    // gemini-2.5-flash shuts down on 2026-10-16; gemini-3.5-flash is its
    // designated replacement. Override with GEMINI_MODEL to move to a more
    // capable model (e.g. gemini-3.8-flash) without touching code — that is
    // the point of keeping the provider behind a port (DEC-003).
    return read('GEMINI_MODEL') ?? 'gemini-3.5-flash';
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
  /**
   * Upper bound on stored cases. The demo link is public and unauthenticated,
   * so without a ceiling anyone — or a misbehaving script — can grow the
   * database without limit.
   */
  get maxCases() {
    const raw = Number(read('SCAYL_MAX_CASES') ?? '200');
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 200;
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

/** Variables the app actually reads. */
const EXPECTED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'ADMISSION_WEBHOOK_SECRET',
  'SCAYL_FORCE_IN_MEMORY',
  'SCAYL_FORCE_FIXTURE_AI',
] as const;

/** Only names in this family are inspected — never the whole environment. */
const RELATED_NAME = /SUPABASE|GEMINI|SCAYL|ADMISSION/i;

/**
 * Reports WHICH configuration variables are present, by NAME ONLY — never a
 * value, not even a fragment.
 *
 * A misspelled variable name is otherwise a completely silent failure: the app
 * just quietly runs in memory and nobody can tell why. `unrecognizedNames`
 * lists variables that look like they were meant for this app but that nothing
 * reads, which makes a typo obvious at a glance.
 */
export function envDiagnostics() {
  const present: Record<string, boolean> = {};
  for (const name of EXPECTED_ENV_VARS) present[name] = Boolean(read(name));

  // Shape only — never the value. A Google AI Studio key looks like
  // `AIza...`; anything else (an OAuth token, a service-account field, a
  // truncated paste) fails with an opaque ACCESS_TOKEN_TYPE_UNSUPPORTED.
  // Read RAW, not through read(): that helper trims, which would hide exactly
  // the stray whitespace this check exists to surface.
  const rawGeminiKey = process.env.GEMINI_API_KEY;
  const geminiKeyShape = rawGeminiKey
    ? {
        length: rawGeminiKey.replace(/\s+/g, '').length,
        looksLikeGoogleApiKey: /^AIza[A-Za-z0-9_-]{30,}$/.test(rawGeminiKey.replace(/\s+/g, '')),
        hadWhitespace: /\s/.test(rawGeminiKey),
      }
    : null;

  const expected = EXPECTED_ENV_VARS as readonly string[];
  const unrecognizedNames = Object.keys(process.env)
    .filter((name) => RELATED_NAME.test(name) && !expected.includes(name))
    .sort();

  return { present, geminiKeyShape, unrecognizedNames };
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
    env: envDiagnostics(),
  } as const;
}
