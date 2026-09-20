import type { NextRequest } from 'next/server';
import { admissionInputSchema } from '@/core/domain/schemas';
import { CaseOrchestrator } from '@/core/orchestrator/case-orchestrator';
import { getRepository } from '@/core/repository';
import { ApiError, handleRouteError, ok } from '@/lib/http';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admissions — hospital admission webhook.
 *
 * Optional shared-secret check: when ADMISSION_WEBHOOK_SECRET is set, the
 * hospital must send it in `x-scayl-webhook-secret`. Left open otherwise so
 * the demo works without configuration.
 */
export async function POST(request: NextRequest) {
  try {
    const expected = env.admissionWebhookSecret;
    if (expected && request.headers.get('x-scayl-webhook-secret') !== expected) {
      throw ApiError.unauthorized();
    }

    const body = await request.json().catch(() => {
      throw ApiError.validation('El cuerpo de la petición no es JSON válido.');
    });

    const parsed = admissionInputSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.validation('El ingreso no cumple el contrato de /api/admissions.', parsed.error.issues);
    }

    const orchestrator = new CaseOrchestrator({ repository: getRepository() });
    const result = await orchestrator.processAdmission(parsed.data);

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
    return handleRouteError(error, 'POST /api/admissions');
  }
}
