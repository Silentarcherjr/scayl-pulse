import { finding, type Finding } from '@/core/domain/findings';
import { assessHistory, type HistoryAssessment } from '@/core/history/history-service';
import { evaluateDocuments, type DocumentRequirementResult } from '@/core/policy/document-requirements';
import { validatePolicy, type PolicyValidationResult } from '@/core/policy/policy-service';
import type { CaseRepository } from '@/core/repository';
import type {
  AdmissionInput,
  CaseEvidence,
  EmergencyCase,
  Hospital,
  Patient,
  Policy,
} from '@/core/domain/types';

/**
 * Everything the Safety Gate and the AI analyzer are allowed to look at.
 *
 * Built exclusively from records belonging to THIS case — a case can never
 * read another case's evidence or timeline.
 */
export interface CaseFacts {
  case: EmergencyCase;
  admission: AdmissionInput;
  admittedAt: string;
  hospital: Hospital | null;
  patient: Patient | null;
  policy: Policy | null;
  evidence: CaseEvidence[];
  policyValidation: PolicyValidationResult;
  documents: DocumentRequirementResult;
  documentFindings: Finding[];
  history: HistoryAssessment;
}

export async function buildCaseFacts(
  repository: CaseRepository,
  caseRecord: EmergencyCase,
): Promise<CaseFacts> {
  const admission = caseRecord.admission;
  const admittedAt = admission.admittedAt ?? caseRecord.createdAt;

  const [hospital, patient, evidence] = await Promise.all([
    repository.findHospitalByCode(admission.hospitalCode),
    repository.findPatientByNationalId(admission.patientNationalId),
    repository.listEvidence(caseRecord.id),
  ]);

  const policy = await resolvePolicy(repository, admission, patient);
  const history = patient ? await repository.listMedicalHistory(patient.id) : [];

  const policyValidation = validatePolicy({ policy, patient, hospital, admission, admittedAt });
  const documents = evaluateDocuments(admission, evidence);
  const historyAssessment = assessHistory({ admission, policy, history, evidence });

  const documentFindings: Finding[] = [];
  if (documents.hasBlockingGap) {
    const blocking = documents.missing.filter((m) => m.severity === 'BLOCKING');
    documentFindings.push(
      finding(
        'REQUIRED_DOCUMENTS_MISSING',
        'BLOCKING',
        `Faltan ${blocking.length} documento(s) obligatorio(s): ${blocking.map((m) => m.documentType).join(', ')}.`,
        {
          sourceType: 'RULE',
          sourceId: 'REQUIRED_DOCUMENTS_MISSING',
          excerpt: blocking.map((m) => `${m.documentType}: ${m.reason}`).join(' | '),
        },
      ),
    );
  }

  if (!patient) {
    documentFindings.push(
      finding('POLICY_NOT_FOUND', 'BLOCKING', 'No se pudo identificar al asegurado con la cédula recibida.', {
        sourceType: 'ADMISSION',
        sourceId: admission.patientNationalId,
        excerpt: `patientNationalId=${admission.patientNationalId}`,
      }),
    );
  }

  return {
    case: caseRecord,
    admission,
    admittedAt,
    hospital,
    patient,
    policy,
    evidence,
    policyValidation,
    documents,
    documentFindings,
    history: historyAssessment,
  };
}

async function resolvePolicy(
  repository: CaseRepository,
  admission: AdmissionInput,
  patient: Patient | null,
): Promise<Policy | null> {
  if (admission.policyNumber) {
    return repository.findPolicyByNumber(admission.policyNumber);
  }
  if (!patient) return null;
  // No policy number in the webhook: pick the patient's active policy, or the
  // most recently started one so an expired policy is still surfaced (and
  // blocked) rather than silently treated as "not found".
  const policies = await repository.findPoliciesByPatientId(patient.id);
  if (policies.length === 0) return null;
  const active = policies.find((p) => p.status === 'ACTIVE');
  if (active) return active;
  return [...policies].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}
