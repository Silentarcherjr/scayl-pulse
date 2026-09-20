import type { NextRequest } from 'next/server';
import { getRepository } from '@/core/repository';
import { handleRouteError, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cases?limit=50 — case list for the hospital / insurer dashboards.
 * Not in the minimum endpoint set, but the frontend needs an index page.
 */
export async function GET(request: NextRequest) {
  try {
    const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? '50');
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

    const cases = await getRepository().listCases(limit);
    return ok({
      count: cases.length,
      cases: cases.map((c) => ({
        id: c.id,
        caseNumber: c.caseNumber,
        status: c.status,
        scenarioId: c.scenarioId,
        hospitalCode: c.admission.hospitalCode,
        admissionReason: c.admission.admissionReason,
        triageLevel: c.admission.triageLevel,
        requiresHuman: c.currentDecision?.requiresHuman ?? false,
        decisionStatus: c.currentDecision?.status ?? null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (error) {
    return handleRouteError(error, 'GET /api/cases');
  }
}
