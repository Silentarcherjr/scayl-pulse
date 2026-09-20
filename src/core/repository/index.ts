import { env, isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { InMemoryCaseRepository } from './in-memory-repository';
import { SupabaseCaseRepository } from './supabase-repository';
import type { CaseRepository } from './case-repository';

export type { CaseRepository } from './case-repository';
export { InMemoryCaseRepository } from './in-memory-repository';
export { SupabaseCaseRepository } from './supabase-repository';

/**
 * Next.js dev reloads modules; keep the in-memory store on globalThis so a
 * case created before an edit is still there afterwards.
 */
const globalStore = globalThis as unknown as { __scaylRepository?: CaseRepository };

export function getRepository(): CaseRepository {
  if (globalStore.__scaylRepository) return globalStore.__scaylRepository;

  const useSupabase = !env.forceInMemory && isSupabaseConfigured();
  let repository: CaseRepository;
  if (useSupabase) {
    repository = new SupabaseCaseRepository();
  } else {
    logger.warn('Supabase not configured — using in-memory repository', {
      reason: env.forceInMemory ? 'SCAYL_FORCE_IN_MEMORY=true' : 'missing NEXT_PUBLIC_SUPABASE_URL / key',
    });
    repository = new InMemoryCaseRepository();
  }

  globalStore.__scaylRepository = repository;
  return repository;
}

/** Test/demo escape hatch. Never call from request handling code. */
export function setRepository(repository: CaseRepository) {
  globalStore.__scaylRepository = repository;
}
