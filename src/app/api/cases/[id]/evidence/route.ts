import type { NextRequest } from 'next/server';
import { evidenceInputSchema } from '@/core/domain/schemas';
import { CaseOrchestrator } from '@/core/orchestrator/case-orchestrator';
import { getRepository } from '@/core/repository';
import { ApiError, handleRouteError, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A scenario with follow-ups runs the pipeline up to three times, each with a
// model call, so the default function limit is not enough.
export const maxDuration = 60;

/**
 * POST /api/cases/:id/evidence — new evidence on a live case.
 * Triggers REASSESSING and a full re-run of the pipeline. Previous decisions
 * stay in the timeline.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const body = await request.json().catch(() => {
      throw ApiError.validation('El cuerpo de la petición no es JSON válido.');
    });

    const parsed = evidenceInputSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.validation('La evidencia no cumple el contrato de /api/cases/:id/evidence.', parsed.error.issues);
    }

    const orchestrator = new CaseOrchestrator({ repository: getRepository() });
    const result = await orchestrator.submitEvidence(id, parsed.data);

    return ok(
      {
        caseId: result.case.id,
        caseNumber: result.case.caseNumber,
        status: result.case.status,
        decision: result.decision,
      },
      201,
    );
  } catch (error) {
    return handleRouteError(error, 'POST /api/cases/:id/evidence');
  }
}
