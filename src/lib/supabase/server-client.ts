import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

let cached: SupabaseClient | null = null;

/**
 * Server-side Supabase client. Uses the service-role key when available
 * (webhook ingestion writes on behalf of the hospital, not of a logged-in
 * user); falls back to the anon key for read-only local exploration.
 *
 * NEVER import this from a client component.
 */
export function getSupabaseServerClient(): SupabaseClient {
  if (cached) return cached;
  const url = env.supabaseUrl;
  const key = env.supabaseServiceRoleKey ?? env.supabaseAnonKey;
  if (!url || !key) {
    throw new Error('Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and a key.');
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
