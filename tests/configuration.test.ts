import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  envDiagnostics,
  isSupabaseRealtimeConfigured,
  isSupabaseWriteConfigured,
  runtimeCapabilities,
} from '@/lib/env';

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Clears the vitest-wide overrides so each case starts from a known state. */
function baseline() {
  vi.stubEnv('SCAYL_FORCE_IN_MEMORY', '');
  vi.stubEnv('SCAYL_FORCE_FIXTURE_AI', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  vi.stubEnv('GEMINI_API_KEY', '');
}

describe('configuración de persistencia', () => {
  it('la clave anon por sí sola NO habilita Supabase para escritura', () => {
    // The easiest mistake to make when deploying: RLS grants anon read access
    // only, so an anon-only deployment would fail every write at runtime.
    baseline();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://demo.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');

    expect(isSupabaseWriteConfigured()).toBe(false);

    const caps = runtimeCapabilities();
    expect(caps.persistence).toBe('in-memory');
    expect(caps.persistenceNote).toContain('SUPABASE_SERVICE_ROLE_KEY');
    // Realtime still works for the frontend with just the anon key.
    expect(caps.realtimeAvailable).toBe(true);
  });

  it('URL + service role habilitan Supabase', () => {
    baseline();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://demo.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');

    expect(isSupabaseWriteConfigured()).toBe(true);
    const caps = runtimeCapabilities();
    expect(caps.persistence).toBe('supabase');
    expect(caps.persistenceNote).toBeNull();
  });

  it('SCAYL_FORCE_IN_MEMORY gana sobre una configuración completa y lo explica', () => {
    baseline();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://demo.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    vi.stubEnv('SCAYL_FORCE_IN_MEMORY', 'true');

    const caps = runtimeCapabilities();
    expect(caps.persistence).toBe('in-memory');
    expect(caps.persistenceNote).toContain('SCAYL_FORCE_IN_MEMORY');
  });

  it('una variable vacía equivale a no definida (Vercel las crea vacías)', () => {
    baseline();
    vi.stubEnv('SCAYL_FORCE_IN_MEMORY', '');
    vi.stubEnv('SCAYL_FORCE_FIXTURE_AI', '   ');

    const caps = runtimeCapabilities();
    expect(caps.persistence).toBe('in-memory');
    expect(caps.aiProvider).toBe('deterministic-fixture');
  });

  it('sin URL, el aviso señala la URL y no la clave', () => {
    baseline();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');

    expect(isSupabaseRealtimeConfigured()).toBe(false);
    expect(runtimeCapabilities().persistenceNote).toContain('NEXT_PUBLIC_SUPABASE_URL');
  });

  it('Gemini se reporta solo cuando hay clave', () => {
    baseline();
    expect(runtimeCapabilities().aiProvider).toBe('deterministic-fixture');
    expect(runtimeCapabilities().geminiModel).toBeNull();

    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    expect(runtimeCapabilities().aiProvider).toBe('gemini');
    expect(runtimeCapabilities().geminiModel).toBe('gemini-3.5-flash');
  });

  it('un nombre mal escrito se delata en el diagnóstico', () => {
    // The failure this catches: a variable typed wrong in a dashboard is
    // completely silent — the app just runs in memory and nobody knows why.
    baseline();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://demo.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROL_KEY', 'oops-typo');

    const diag = envDiagnostics();
    expect(diag.present.SUPABASE_SERVICE_ROLE_KEY).toBe(false);
    expect(diag.present.NEXT_PUBLIC_SUPABASE_URL).toBe(true);
    expect(diag.unrecognizedNames).toContain('SUPABASE_SERVICE_ROL_KEY');
  });

  it('el diagnóstico nunca expone valores, solo nombres', () => {
    baseline();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_super_confidencial');
    vi.stubEnv('GEMINI_API_KEY', 'clave-de-gemini');

    const serialized = JSON.stringify(envDiagnostics());
    expect(serialized).not.toContain('sb_secret_super_confidencial');
    expect(serialized).not.toContain('clave-de-gemini');
    expect(serialized).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('no inspecciona variables ajenas a la aplicación', () => {
    baseline();
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'no-es-asunto-nuestro');

    expect(envDiagnostics().unrecognizedNames).not.toContain('AWS_SECRET_ACCESS_KEY');
  });

  it('detecta una clave de Gemini que no tiene forma de API key', () => {
    // The real failure this catches: Google rejects a non-API-key credential
    // with an opaque 401 ACCESS_TOKEN_TYPE_UNSUPPORTED that names no cause.
    baseline();
    vi.stubEnv('GEMINI_API_KEY', 'ya29.un-token-oauth-no-es-una-api-key');

    const shape = envDiagnostics().geminiKeyShape;
    expect(shape?.looksLikeGoogleApiKey).toBe(false);
  });

  it('reconoce una clave con forma válida y delata los espacios en blanco', () => {
    baseline();
    vi.stubEnv('GEMINI_API_KEY', 'AIzaSyA1234567890abcdefghijklmnopqrstuv\n');

    const shape = envDiagnostics().geminiKeyShape;
    expect(shape?.looksLikeGoogleApiKey).toBe(true);
    expect(shape?.hadWhitespace).toBe(true);
  });

  it('el diagnóstico de la clave nunca incluye la clave', () => {
    baseline();
    vi.stubEnv('GEMINI_API_KEY', 'AIzaSyA1234567890abcdefghijklmnopqrstuv');

    const serialized = JSON.stringify(envDiagnostics());
    expect(serialized).not.toContain('AIzaSyA1234567890abcdefghijklmnopqrstuv');
    expect(serialized).not.toContain('AIzaSy');
  });

  it('una clave con salto de línea se normaliza antes de usarse', async () => {
    baseline();
    vi.stubEnv('GEMINI_API_KEY', '  AIzaSyA1234567890abcdefghijklmnopqrstuv\n');
    const { env } = await import('@/lib/env');
    expect(env.geminiApiKey).toBe('AIzaSyA1234567890abcdefghijklmnopqrstuv');
  });

  it('el modelo por defecto ya no es uno que se apaga en octubre de 2026', async () => {
    baseline();
    vi.stubEnv('GEMINI_MODEL', '');
    const { env } = await import('@/lib/env');
    expect(env.geminiModel).toBe('gemini-3.5-flash');

    vi.stubEnv('GEMINI_MODEL', 'gemini-3.8-flash');
    expect(env.geminiModel).toBe('gemini-3.8-flash');
  });
});
