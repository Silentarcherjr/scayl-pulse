import type { NextRequest } from 'next/server';
import { resolveInputSchema } from '@/core/domain/schemas';
import { CaseOrchestrator } from '@/core/orchestrator/case-orchestrator';
import { getRepository } from '@/core/repository';
import { ApiError, handleRouteError, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cases/:id/resolve — a human closes the case.
 *
 * This is the only decision in the system a person makes directly, so the
 * request must name who is making it and why; neither is optional and neither
 * is defaulted. The outcome, the author, the status the system had reached and
 * whether the person went against it are all written to the append-only
 * timeline and sent to both parties.
 *
 * Closing is terminal: a resolved case cannot be reopened and refuses new
 * evidence. See docs/DECISIONS.md DEC-011.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const body = await request.json().catch(() => {
      throw ApiError.validation('El cuerpo de la petición no es JSON válido.');
    });

    const parsed = resolveInputSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.validation(
        'El cierre no cumple el contrato de /api/cases/:id/resolve. Se requiere quién cierra el caso y por qué.',
        parsed.error.issues,
      );
    }

    const orchestrator = new CaseOrchestrator({ repository: getRepository() });
    const result = await orchestrator.resolveCase(id, parsed.data);

    return ok({
      caseId: result.case.id,
      caseNumber: result.case.caseNumber,
      status: result.case.status,
      resolution: result.resolution,
    });
  } catch (error) {
    return handleRouteError(error, 'POST /api/cases/:id/resolve');
  }
}
