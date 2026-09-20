import { getRepository } from '@/core/repository';
import { ApiError, handleRouteError, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/cases/:id — full case detail for hospital and insurer views. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const repository = getRepository();

    const caseRecord = await repository.getCase(id);
    if (!caseRecord) throw ApiError.notFound(`Case ${id} not found`);

    const [evidence, notifications, events, aiInteractions] = await Promise.all([
      repository.listEvidence(id),
      repository.listNotifications(id),
      repository.listEvents(id),
      repository.listAiInteractions(id),
    ]);

    const [hospital, patient] = await Promise.all([
      repository.findHospitalByCode(caseRecord.admission.hospitalCode),
      repository.findPatientByNationalId(caseRecord.admission.patientNationalId),
    ]);
    const policy = caseRecord.admission.policyNumber
      ? await repository.findPolicyByNumber(caseRecord.admission.policyNumber)
      : null;

    return ok({
      case: caseRecord,
      hospital,
      patient: patient ? { id: patient.id, fullName: patient.fullName, birthDate: patient.birthDate } : null,
      policy,
      decision: caseRecord.currentDecision,
      resolution: caseRecord.resolution,
      evidence,
      notifications,
      eventCount: events.length,
      // Decision history, newest last — previous decisions are never discarded.
      decisionHistory: events
        .filter((e) => e.type === 'CASE_CLASSIFIED' || e.type === 'DECISION_UPDATED')
        .map((e) => ({ seq: e.seq, at: e.createdAt, type: e.type, decision: e.payload.decision })),
      aiInteractions: aiInteractions.map((i) => ({
        id: i.id,
        provider: i.provider,
        model: i.model,
        valid: i.valid,
        latencyMs: i.latencyMs,
        error: i.error,
        createdAt: i.createdAt,
      })),
    });
  } catch (error) {
    return handleRouteError(error, 'GET /api/cases/:id');
  }
}
