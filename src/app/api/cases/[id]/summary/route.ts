import type { NextRequest } from 'next/server';
import { getCaseSummary } from '@/core/summary/case-summary';
import { getRepository } from '@/core/repository';
import { ApiError, handleRouteError, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cases/:id/summary — narrative written for a case manager.
 *
 * Generated on demand rather than during admission: the hospital waits on the
 * admission request, and a second model call there would double its latency
 * for a narrative nobody is reading yet. Here a human just opened the case.
 *
 * Cached as a timeline event and reused until the decision changes, so
 * reopening a case costs nothing. `?refresh=true` forces a regeneration.
 *
 * The summary NEVER changes a decision: it is produced after the Safety Gate
 * and receives the final decision as input.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const repository = getRepository();

    const caseRecord = await repository.getCase(id);
    if (!caseRecord) throw ApiError.notFound(`Case ${id} not found`);

    const summary = await getCaseSummary({
      repository,
      caseRecord,
      refresh: request.nextUrl.searchParams.get('refresh') === 'true',
    });

    return ok({ caseId: id, caseNumber: caseRecord.caseNumber, status: caseRecord.status, summary });
  } catch (error) {
    return handleRouteError(error, 'GET /api/cases/:id/summary');
  }
}
