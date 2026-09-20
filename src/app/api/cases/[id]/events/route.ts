import { getRepository } from '@/core/repository';
import { ApiError, handleRouteError, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cases/:id/events — append-only audit timeline, ordered by seq.
 * Safe to poll; Workstream B can also subscribe to Supabase Realtime on
 * `case_events` filtered by case_id.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const repository = getRepository();

    const caseRecord = await repository.getCase(id);
    if (!caseRecord) throw ApiError.notFound(`Case ${id} not found`);

    const events = await repository.listEvents(id);
    return ok({ caseId: id, status: caseRecord.status, count: events.length, events });
  } catch (error) {
    return handleRouteError(error, 'GET /api/cases/:id/events');
  }
}
