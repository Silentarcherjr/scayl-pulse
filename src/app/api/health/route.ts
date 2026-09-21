import { env, runtimeCapabilities } from '@/lib/env';
import { getRepository } from '@/core/repository';
import { handleRouteError, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/health — what is actually wired up right now. */
export async function GET() {
  try {
    const repository = getRepository();
    // Este es el único endpoint que no puede caerse: su trabajo es informar de
    // la degradación. Si contar casos falla porque la persistencia no responde,
    // eso ES la respuesta — no un 500 que deja al cliente sin saber nada.
    let storedCases: number | null = null;
    let persistenceError: string | null = null;
    try {
      storedCases = await repository.countCases();
    } catch {
      persistenceError = 'La persistencia configurada no responde.';
    }
    return ok({
      service: 'scayl-pulse',
      status: persistenceError ? 'degraded' : 'up',
      repository: repository.kind,
      ...runtimeCapabilities(),
      capacity: { storedCases, maxCases: env.maxCases },
      persistenceError,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleRouteError(error, 'GET /api/health');
  }
}
