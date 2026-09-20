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
    expect(runtimeCapabilities().geminiModel).toBe('gemini-2.5-flash');
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
});
