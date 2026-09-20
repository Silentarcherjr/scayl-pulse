import { aiAnalysisSchema } from '@/core/domain/schemas';
import type { CaseFacts } from '@/core/orchestrator/case-facts';
import type { AiProvider, AnalyzerRequest, AnalyzerResponse } from './provider';

/**
 * Deterministic fallback analyzer.
 *
 * This is NOT a fake Gemini call: it identifies itself as
 * `deterministic-fallback`, is recorded as such in ai_interactions, and the
 * decision it contributes to is labelled AI_UNAVAILABLE in the UI. It exists
 * so the demo and the tests are reproducible without credentials and so a
 * provider outage degrades the product instead of breaking it
 * (docs/DECISIONS.md DEC-005, DEC-006).
 *
 * It writes narrative from facts the deterministic layer already computed —
 * it never asserts anything the rules did not establish.
 */
export class DeterministicProvider implements AiProvider {
  readonly name = 'deterministic-fallback';
  readonly model = 'rules-v1';
  readonly isModelBacked = false;

  constructor(private readonly facts: CaseFacts) {}

  async analyze(_request: AnalyzerRequest): Promise<AnalyzerResponse> {
    const startedAt = Date.now();
    const f = this.facts;

    const unresolved = f.history.relatedConditions.filter(
      (r) => r.diagnosedBeforePolicyStart && !r.addressed,
    );
    const blockingPolicy = f.policyValidation.findings.filter((x) => x.severity === 'BLOCKING');

    let suggestedStatus: 'VERIFIED' | 'DOCUMENTS_REQUIRED' | 'HUMAN_REVIEW' = 'VERIFIED';
    if (blockingPolicy.length > 0 || unresolved.length > 0) suggestedStatus = 'HUMAN_REVIEW';
    else if (f.documents.hasBlockingGap) suggestedStatus = 'DOCUMENTS_REQUIRED';

    const patient = f.patient?.fullName ?? 'el asegurado';
    const hospital = f.hospital?.name ?? f.admission.hospitalCode;

    const summaryByStatus: Record<typeof suggestedStatus, string> = {
      VERIFIED: `Análisis determinístico: la póliza ${f.policy?.policyNumber ?? '(no encontrada)'} está vigente, ${hospital} pertenece a la red y la documentación obligatoria está completa para ${patient}.`,
      DOCUMENTS_REQUIRED: `Análisis determinístico: la cobertura de ${patient} en ${hospital} es potencialmente válida, pero faltan documentos obligatorios para completar la verificación.`,
      HUMAN_REVIEW: `Análisis determinístico: el expediente de ${patient} en ${hospital} presenta un conflicto administrativo o una preexistencia potencial sin aclarar, y requiere criterio humano.`,
    };

    const payload = {
      suggestedStatus,
      confidence: 0.9,
      summary: summaryByStatus[suggestedStatus],
      reason: [
        ...blockingPolicy.map((x) => `[${x.code}] ${x.message}`),
        ...unresolved.map(
          (r) =>
            `Antecedente ${r.entry.conditionCode} (${r.entry.conditionLabel}) diagnosticado el ${r.entry.diagnosedAt}, anterior al inicio de la póliza, potencialmente relacionado con el motivo de ingreso y sin evidencia que lo aclare.`,
        ),
        ...f.documents.missing.map((m) => `Documento pendiente ${m.documentType}: ${m.reason}`),
      ]
        .join(' ')
        .trim() || 'No se identificaron hallazgos que restrinjan el caso.',
      evidence: [
        ...(f.policy
          ? [
              {
                sourceType: 'POLICY' as const,
                sourceId: f.policy.policyNumber,
                excerpt: `status=${f.policy.status} vigencia ${f.policy.effectiveFrom} → ${f.policy.effectiveTo}`,
              },
            ]
          : []),
        ...unresolved.map((r) => ({
          sourceType: 'MEDICAL_HISTORY' as const,
          sourceId: r.entry.id,
          excerpt: `${r.entry.conditionCode} — ${r.entry.conditionLabel} (${r.entry.diagnosedAt})`,
        })),
      ],
      missingDocuments: f.documents.missing,
      recommendedAction:
        suggestedStatus === 'VERIFIED'
          ? 'Confirmar cobertura a admisiones y notificar al gestor de casos.'
          : suggestedStatus === 'DOCUMENTS_REQUIRED'
            ? 'Solicitar al hospital los documentos pendientes listados.'
            : 'Escalar a un gestor de casos humano. La atención de emergencia continúa sin interrupción.',
      potentiallyRelatedConditions: f.history.relatedConditions.map((r) => ({
        conditionCode: r.entry.conditionCode,
        conditionLabel: r.entry.conditionLabel,
        relationRationale: r.rationale,
        evidenceSufficiency: r.addressed ? ('SUFFICIENT' as const) : ('INSUFFICIENT' as const),
      })),
      openQuestions: unresolved.map(
        (r) => `¿Existe documentación que aclare la relación entre "${r.entry.conditionLabel}" y el motivo de ingreso actual?`,
      ),
    };

    // Round-trips through the same schema the real provider must satisfy, so
    // the fallback can never drift away from the contract.
    const validated = aiAnalysisSchema.parse(payload);

    return { raw: JSON.stringify(validated), error: null, latencyMs: Date.now() - startedAt };
  }
}
