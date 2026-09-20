import type { AdmissionInput, CaseEvidence, DocumentType, MissingDocument } from '@/core/domain/types';

/** Cost above which the insurer requires a formal estimate and report. */
export const HIGH_COST_THRESHOLD = 5_000;

export interface DocumentRequirement {
  documentType: DocumentType;
  severity: MissingDocument['severity'];
  reason: string;
}

export interface DocumentRequirementResult {
  required: DocumentRequirement[];
  present: DocumentType[];
  missing: MissingDocument[];
  /** True when at least one BLOCKING document is absent. */
  hasBlockingGap: boolean;
}

/**
 * Deterministic documentation ruleset. Kept explicit (not model-generated) so
 * the agent can always say EXACTLY what is missing and why it is required.
 */
export function requiredDocumentsFor(admission: AdmissionInput): DocumentRequirement[] {
  const requirements: DocumentRequirement[] = [
    {
      documentType: 'ADMISSION_FORM',
      severity: 'BLOCKING',
      reason: 'Todo ingreso a emergencias requiere el formulario de admisión del hospital.',
    },
    {
      documentType: 'PATIENT_ID',
      severity: 'BLOCKING',
      reason: 'Se requiere verificación de identidad del asegurado para validar la póliza.',
    },
    {
      documentType: 'TRIAGE_NOTE',
      severity: 'ADVISORY',
      reason: 'La nota de triaje acelera la revisión del gestor de casos, pero no bloquea la verificación.',
    },
  ];

  const highCost = (admission.estimatedCost ?? 0) >= HIGH_COST_THRESHOLD;
  const highAcuity = admission.triageLevel === 'RED' || admission.triageLevel === 'ORANGE';

  if (highCost || highAcuity) {
    requirements.push({
      documentType: 'MEDICAL_REPORT',
      severity: 'BLOCKING',
      reason: highCost
        ? `El costo estimado (B/. ${admission.estimatedCost?.toLocaleString('es-PA')}) supera el umbral de B/. ${HIGH_COST_THRESHOLD.toLocaleString('es-PA')} y exige informe médico.`
        : `El nivel de triaje ${admission.triageLevel} exige informe médico de emergencias.`,
    });
  }

  if (highCost) {
    requirements.push({
      documentType: 'COST_ESTIMATE',
      severity: 'BLOCKING',
      reason: `Los casos por encima de B/. ${HIGH_COST_THRESHOLD.toLocaleString('es-PA')} requieren estimado de costos para autorización.`,
    });
  }

  return requirements;
}

export function evaluateDocuments(
  admission: AdmissionInput,
  evidence: CaseEvidence[],
): DocumentRequirementResult {
  const required = requiredDocumentsFor(admission);
  const present = [...new Set(evidence.map((e) => e.documentType))];

  const missing: MissingDocument[] = required
    .filter((r) => !present.includes(r.documentType))
    .map((r) => ({ documentType: r.documentType, reason: r.reason, severity: r.severity }));

  return {
    required,
    present,
    missing,
    hasBlockingGap: missing.some((m) => m.severity === 'BLOCKING'),
  };
}
