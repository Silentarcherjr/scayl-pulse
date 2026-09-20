import { normalizeText, relationsFor } from '@/data/synthetic/clinical-relations';
import { finding, type Finding } from '@/core/domain/findings';
import type { AdmissionInput, CaseEvidence, MedicalHistoryEntry, Policy } from '@/core/domain/types';

/** Document types that can settle a pre-existing-condition question. */
const RESOLVING_DOCUMENT_TYPES = new Set([
  'SPECIALIST_REPORT',
  'MEDICAL_REPORT',
  'LAB_RESULT',
  'IMAGING_REPORT',
]);

export interface RelatedConditionAssessment {
  entry: MedicalHistoryEntry;
  rationale: string;
  /** Diagnosed before the policy's effective start → possible pre-existence. */
  diagnosedBeforePolicyStart: boolean;
  /** An evidence document explicitly addresses this condition. */
  addressed: boolean;
  addressedByEvidenceIds: string[];
}

export interface HistoryAssessment {
  entries: MedicalHistoryEntry[];
  relatedConditions: RelatedConditionAssessment[];
  /** A potentially pre-existing related condition exists. */
  hasPotentialPreExistingConflict: boolean;
  /** …and no document in the case settles it. */
  hasUnresolvedPreExistingConflict: boolean;
  findings: Finding[];
}

function evidenceAddressesCondition(evidence: CaseEvidence, entry: MedicalHistoryEntry): boolean {
  if (!RESOLVING_DOCUMENT_TYPES.has(evidence.documentType)) return false;

  const declaredCodes = evidence.metadata?.addressesConditionCodes;
  if (Array.isArray(declaredCodes) && declaredCodes.includes(entry.conditionCode)) return true;

  const haystack = normalizeText(`${evidence.title} ${evidence.content}`);
  if (haystack.includes(normalizeText(entry.conditionCode))) return true;
  return haystack.includes(normalizeText(entry.conditionLabel));
}

/**
 * Deterministic history assessment.
 *
 * Whether a prior condition *can* relate to this admission comes from the
 * declared clinical-relations table, never from the model. The model may
 * later add narrative, but it cannot create or remove a relation here.
 */
export function assessHistory(params: {
  admission: AdmissionInput;
  policy: Policy | null;
  history: MedicalHistoryEntry[];
  evidence: CaseEvidence[];
}): HistoryAssessment {
  const { admission, policy, history, evidence } = params;
  const findings: Finding[] = [];
  const relation = relationsFor(admission.admissionReasonCode);

  const relatedConditions: RelatedConditionAssessment[] = [];

  for (const entry of history) {
    const relatedByTable = relation?.relatedConditionCodes.includes(entry.conditionCode) ?? false;
    // Secondary signal: the admission text itself names the prior condition.
    const namedInAdmission = normalizeText(admission.admissionReason).includes(
      normalizeText(entry.conditionLabel),
    );
    if (!relatedByTable && !namedInAdmission) continue;

    const diagnosedBeforePolicyStart = policy ? entry.diagnosedAt < policy.effectiveFrom : false;
    const addressedBy = evidence.filter((e) => evidenceAddressesCondition(e, entry));

    relatedConditions.push({
      entry,
      rationale: relatedByTable
        ? (relation?.rationale ?? 'Relación declarada en la tabla clínica.')
        : 'El motivo de ingreso menciona explícitamente este antecedente.',
      diagnosedBeforePolicyStart,
      addressed: addressedBy.length > 0,
      addressedByEvidenceIds: addressedBy.map((e) => e.id),
    });
  }

  const conflicting = relatedConditions.filter((r) => r.diagnosedBeforePolicyStart);
  const unresolved = conflicting.filter((r) => !r.addressed);

  for (const item of conflicting) {
    findings.push(
      finding(
        item.addressed ? 'PRE_EXISTING_ADDRESSED' : 'PRE_EXISTING_UNRESOLVED',
        item.addressed ? 'INFO' : 'BLOCKING',
        item.addressed
          ? `El antecedente "${item.entry.conditionLabel}" (${item.entry.conditionCode}) está documentado por evidencia del expediente.`
          : `Antecedente "${item.entry.conditionLabel}" (${item.entry.conditionCode}) diagnosticado el ${item.entry.diagnosedAt}, antes del inicio de vigencia de la póliza, y potencialmente relacionado con el motivo de ingreso. No hay evidencia en el expediente que lo aclare.`,
        {
          sourceType: 'MEDICAL_HISTORY',
          sourceId: item.entry.id,
          excerpt: `${item.entry.conditionCode} — ${item.entry.conditionLabel}, diagnosticado ${item.entry.diagnosedAt} (fuente: ${item.entry.source})`,
        },
      ),
    );
  }

  if (relatedConditions.length === 0) {
    findings.push(
      finding('NO_RELATED_HISTORY', 'INFO', 'No se encontraron antecedentes potencialmente relacionados con el motivo de ingreso.', {
        sourceType: 'RULE',
        sourceId: 'CLINICAL_RELATIONS',
        excerpt: `admissionReasonCode=${admission.admissionReasonCode ?? '(no enviado)'} historyEntries=${history.length}`,
      }),
    );
  }

  return {
    entries: history,
    relatedConditions,
    hasPotentialPreExistingConflict: conflicting.length > 0,
    hasUnresolvedPreExistingConflict: unresolved.length > 0,
    findings,
  };
}
