import { env } from '@/lib/env';
import { ApiError } from '@/lib/http';
import type { CaseRepository } from '@/core/repository';

/**
 * Ceiling on stored cases.
 *
 * The deployed demo is public and unauthenticated on purpose — a judge must be
 * able to open the link and press a scenario. That also means anything holding
 * the URL can create cases in a loop, which is not hypothetical: it happened
 * during development and produced 247 junk cases in two minutes.
 *
 * Cases are immutable by design (DEC-008), so they cannot be pruned
 * automatically. The ceiling is therefore a hard stop with an explanation
 * rather than a silent eviction.
 */
export async function assertCapacityAvailable(repository: CaseRepository): Promise<void> {
  const limit = env.maxCases;
  const current = await repository.countCases();
  if (current < limit) return;

  throw ApiError.capacityReached(
    `Esta instancia alcanzó su límite de ${limit} casos almacenados y no admite ingresos nuevos. ` +
      'Los casos son inmutables por diseño y no se eliminan solos: para liberar espacio hay que ' +
      'reiniciar los datos de demo (TRUNCATE de las tablas de casos, ver docs/HANDOFF.md).',
    { current, limit },
  );
}
