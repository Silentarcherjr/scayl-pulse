import { listScenarios } from '@/core/demo/demo-runner';
import { handleRouteError, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/demo/scenarios — catalogue of reproducible demo scenarios. */
export async function GET() {
  try {
    return ok({ scenarios: listScenarios() });
  } catch (error) {
    return handleRouteError(error, 'GET /api/demo/scenarios');
  }
}
