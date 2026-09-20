import { runtimeCapabilities } from '@/lib/env';
import { getRepository } from '@/core/repository';
import { handleRouteError, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/health — what is actually wired up right now. */
export async function GET() {
  try {
    const repository = getRepository();
    return ok({
      service: 'scayl-pulse',
      status: 'up',
      repository: repository.kind,
      ...runtimeCapabilities(),
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleRouteError(error, 'GET /api/health');
  }
}
