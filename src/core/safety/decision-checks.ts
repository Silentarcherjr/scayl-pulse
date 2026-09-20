import type { DecisionStatus } from '@/core/domain/case-status';
import type { AiAnalysis, EvidenceReference } from '@/core/domain/types';
import type { CaseFacts } from '@/core/orchestrator/case-facts';
import { CONFIDENCE_THRESHOLD } from './rules';

export type CheckStatus = 'PASSED' | 'WARNING' | 'FAILED' | 'NOT_EVALUATED';

/**
 * One reviewable question the system asked about the case, with its answer.
 *
 * The deterministic layer already evaluates all of these; until now only the
 * failing ones surfaced, which meant a reviewer could see what went wrong but
 * never what went right. Emitting the whole list is what makes the decision
 * auditable instead of merely explained. (docs/IDEAS.md IDEA-006)
 */
export interface DecisionCheck {
  /** Stable identifier — safe to key UI or translations on. */
  code: string;
  /** Human-facing question, already in Spanish. */
  label: string;
  status: CheckStatus;
  /** One line stating the actual answer for THIS case. */
  detail: string;
  /** The record this check looked at, when there is one. */
  evidence?: EvidenceReference;
  /** For a failed check: the worst status it forces. */
  imposedFloor?: DecisionStatus;
}

function check(
  code: string,
  label: string,
  status: CheckStatus,
  detail: string,
  extra: Partial<Pick<DecisionCheck, 'evidence' | 'imposedFloor'>> = {},
): DecisionCheck {
  return { code, label, status, detail, ...extra };
}

/**
 * Builds the full checklist in a stable order, so the UI can render it without
 * sorting and a reader sees the same sequence on every case.
 */
export function buildDecisionChecks(params: {
  facts: CaseFacts;
  analysis: AiAnalysis | null;
  /** False when the analysis came from the deterministic fallback. */
  modelBacked: boolean;
  finalStatus: DecisionStatus;
  gateOverrode: boolean;
  modelSuggestedStatus: DecisionStatus | null;
}): DecisionCheck[] {
  const { facts, analysis, modelBacked, finalStatus, gateOverrode, modelSuggestedStatus } = params;
  const { policyValidation: pv, policy, hospital, patient, documents, history } = facts;
  const checks: DecisionCheck[] = [];

  // --- Identity -------------------------------------------------------------
  checks.push(
    patient
      ? check('PATIENT_IDENTIFIED', 'Asegurado identificado', 'PASSED', `${patient.fullName}, cédula ${patient.nationalId}.`, {
          evidence: { sourceType: 'ADMISSION', sourceId: patient.nationalId, excerpt: patient.fullName },
        })
      : check('PATIENT_IDENTIFIED', 'Asegurado identificado', 'FAILED', `No existe ningún asegurado con la cédula ${facts.admission.patientNationalId}.`, {
          imposedFloor: 'HUMAN_REVIEW',
        }),
  );

  // --- Policy ---------------------------------------------------------------
  checks.push(
    policy
      ? check('POLICY_FOUND', 'Póliza localizada', 'PASSED', `${policy.policyNumber} · plan ${policy.planCode} · ${policy.insurer}.`, {
          evidence: { sourceType: 'POLICY', sourceId: policy.policyNumber, excerpt: `plan=${policy.planCode}` },
        })
      : check('POLICY_FOUND', 'Póliza localizada', 'FAILED', 'No se encontró una póliza asociada al asegurado.', {
          imposedFloor: 'HUMAN_REVIEW',
        }),
  );

  if (policy) {
    const period = `vigencia ${policy.effectiveFrom} → ${policy.effectiveTo}`;
    checks.push(
      pv.expired
        ? check('POLICY_ACTIVE', 'Póliza vigente en la fecha del ingreso', 'FAILED', `Venció el ${policy.effectiveTo}; el ingreso ocurrió el ${facts.admittedAt.slice(0, 10)}.`, {
            evidence: { sourceType: 'POLICY', sourceId: policy.policyNumber, excerpt: period },
            imposedFloor: 'HUMAN_REVIEW',
          })
        : pv.notYetEffective
          ? check('POLICY_ACTIVE', 'Póliza vigente en la fecha del ingreso', 'FAILED', `Inicia vigencia el ${policy.effectiveFrom}, posterior al ingreso.`, {
              evidence: { sourceType: 'POLICY', sourceId: policy.policyNumber, excerpt: period },
              imposedFloor: 'HUMAN_REVIEW',
            })
          : policy.status !== 'ACTIVE'
            ? check('POLICY_ACTIVE', 'Póliza vigente en la fecha del ingreso', 'FAILED', `La póliza está en estado ${policy.status}.`, {
                evidence: { sourceType: 'POLICY', sourceId: policy.policyNumber, excerpt: `status=${policy.status}` },
                imposedFloor: 'HUMAN_REVIEW',
              })
            : check('POLICY_ACTIVE', 'Póliza vigente en la fecha del ingreso', 'PASSED', `Activa, ${period}.`, {
                evidence: { sourceType: 'POLICY', sourceId: policy.policyNumber, excerpt: period },
              }),
    );

    checks.push(
      pv.belongsToPatient
        ? check('POLICY_OWNERSHIP', 'La póliza corresponde al asegurado', 'PASSED', 'El titular de la póliza coincide con el paciente admitido.')
        : check('POLICY_OWNERSHIP', 'La póliza corresponde al asegurado', 'FAILED', 'La póliza pertenece a otra persona.', {
            imposedFloor: 'HUMAN_REVIEW',
          }),
    );

    checks.push(
      policy.emergencyCoverage
        ? check('EMERGENCY_COVERAGE', 'El plan cubre emergencias', 'PASSED', `El plan ${policy.planCode} incluye cobertura de emergencias.`)
        : check('EMERGENCY_COVERAGE', 'El plan cubre emergencias', 'FAILED', `El plan ${policy.planCode} no incluye cobertura de emergencias.`, {
            imposedFloor: 'HUMAN_REVIEW',
          }),
    );

    checks.push(
      pv.withinWaitingPeriod
        ? check('WAITING_PERIOD', 'Período de carencia', 'WARNING', `El ingreso ocurre dentro de los ${policy.waitingPeriodDays} días de carencia. Las emergencias siguen cubiertas, pero cambia la vía administrativa.`, {
            evidence: { sourceType: 'POLICY', sourceId: policy.policyNumber, excerpt: `waitingPeriodDays=${policy.waitingPeriodDays}` },
          })
        : check('WAITING_PERIOD', 'Período de carencia', 'PASSED', 'El ingreso ocurre fuera del período de carencia.'),
    );
  }

  // --- Hospital -------------------------------------------------------------
  checks.push(
    !hospital
      ? check('HOSPITAL_IN_NETWORK', 'Hospital dentro de red', 'FAILED', `El código ${facts.admission.hospitalCode} no corresponde a ningún hospital registrado.`, {
          imposedFloor: 'HUMAN_REVIEW',
        })
      : hospital.networkStatus === 'IN_NETWORK'
        ? check('HOSPITAL_IN_NETWORK', 'Hospital dentro de red', 'PASSED', `${hospital.name} pertenece a la red.`, {
            evidence: { sourceType: 'ADMISSION', sourceId: hospital.code, excerpt: hospital.name },
          })
        : check('HOSPITAL_IN_NETWORK', 'Hospital dentro de red', 'FAILED', `${hospital.name} está fuera de la red (${hospital.networkStatus}).`, {
            evidence: { sourceType: 'ADMISSION', sourceId: hospital.code, excerpt: `networkStatus=${hospital.networkStatus}` },
            imposedFloor: 'HUMAN_REVIEW',
          }),
  );

  // --- Documentation --------------------------------------------------------
  const blocking = documents.missing.filter((m) => m.severity === 'BLOCKING');
  const advisory = documents.missing.filter((m) => m.severity === 'ADVISORY');
  checks.push(
    blocking.length > 0
      ? check('REQUIRED_DOCUMENTS', 'Documentación obligatoria completa', 'FAILED', `Faltan ${blocking.length}: ${blocking.map((m) => m.documentType).join(', ')}.`, {
          evidence: { sourceType: 'RULE', sourceId: 'REQUIRED_DOCUMENTS_MISSING', excerpt: blocking.map((m) => m.documentType).join(', ') },
          imposedFloor: 'DOCUMENTS_REQUIRED',
        })
      : advisory.length > 0
        ? check('REQUIRED_DOCUMENTS', 'Documentación obligatoria completa', 'WARNING', `Completa. Falta documentación recomendada: ${advisory.map((m) => m.documentType).join(', ')}.`)
        : check('REQUIRED_DOCUMENTS', 'Documentación obligatoria completa', 'PASSED', `${documents.present.length} documento(s) recibidos, sin faltantes.`),
  );

  // --- Pre-existing conditions ---------------------------------------------
  const related = history.relatedConditions;
  const conflicting = related.filter((r) => r.diagnosedBeforePolicyStart);
  const unresolved = conflicting.filter((r) => !r.addressed);

  checks.push(
    related.length === 0
      ? check('PRE_EXISTING_CONDITIONS', 'Antecedentes potencialmente relacionados', 'PASSED', `Ninguno de los ${history.entries.length} antecedente(s) se relaciona con el motivo de ingreso según la tabla clínica.`, {
          evidence: { sourceType: 'RULE', sourceId: 'CLINICAL_RELATIONS', excerpt: `admissionReasonCode=${facts.admission.admissionReasonCode ?? 'no enviado'}` },
        })
      : conflicting.length === 0
        ? check('PRE_EXISTING_CONDITIONS', 'Antecedentes potencialmente relacionados', 'PASSED', `${related.length} antecedente(s) relacionado(s), todos diagnosticados después del inicio de la póliza.`)
        : check('PRE_EXISTING_CONDITIONS', 'Antecedentes potencialmente relacionados', 'WARNING', `${conflicting.length} antecedente(s) anterior(es) a la póliza y potencialmente relacionado(s): ${conflicting.map((r) => `${r.entry.conditionCode} ${r.entry.conditionLabel}`).join('; ')}.`, {
            evidence: {
              sourceType: 'MEDICAL_HISTORY',
              sourceId: conflicting[0].entry.id,
              excerpt: `${conflicting[0].entry.conditionCode} — ${conflicting[0].entry.conditionLabel} (${conflicting[0].entry.diagnosedAt})`,
            },
          }),
  );

  if (conflicting.length > 0) {
    checks.push(
      unresolved.length === 0
        ? check('EVIDENCE_SUFFICIENCY', 'Evidencia suficiente sobre los antecedentes', 'PASSED', 'La evidencia del expediente documenta los antecedentes potencialmente relacionados.')
        : check('EVIDENCE_SUFFICIENCY', 'Evidencia suficiente sobre los antecedentes', 'FAILED', `Ningún documento del expediente aclara: ${unresolved.map((r) => r.entry.conditionLabel).join('; ')}.`, {
            evidence: {
              sourceType: 'MEDICAL_HISTORY',
              sourceId: unresolved[0].entry.id,
              excerpt: `${unresolved[0].entry.conditionCode} sin evidencia que lo aclare`,
            },
            imposedFloor: 'HUMAN_REVIEW',
          }),
    );
  } else {
    checks.push(
      check('EVIDENCE_SUFFICIENCY', 'Evidencia suficiente sobre los antecedentes', 'NOT_EVALUATED', 'No aplica: no hay antecedentes anteriores a la póliza que aclarar.'),
    );
  }

  // --- Analysis confidence --------------------------------------------------
  checks.push(
    // A confidence number from the deterministic fallback must never be shown
    // as if a model had produced it.
    !analysis || !modelBacked
      ? check('ANALYSIS_CONFIDENCE', 'Confianza del análisis del modelo', 'NOT_EVALUATED', 'El caso se resolvió solo con reglas determinísticas; no hubo análisis del modelo.')
      : analysis.confidence < CONFIDENCE_THRESHOLD
        ? check('ANALYSIS_CONFIDENCE', 'Confianza del análisis del modelo', 'FAILED', `${(analysis.confidence * 100).toFixed(0)} %, por debajo del umbral operativo del ${CONFIDENCE_THRESHOLD * 100} %.`, {
            imposedFloor: 'HUMAN_REVIEW',
          })
        : check('ANALYSIS_CONFIDENCE', 'Confianza del análisis del modelo', 'PASSED', `${(analysis.confidence * 100).toFixed(0)} %, por encima del umbral del ${CONFIDENCE_THRESHOLD * 100} %.`),
  );

  // --- Safety Gate ----------------------------------------------------------
  checks.push(
    gateOverrode
      ? check('SAFETY_GATE', 'Safety Gate', 'WARNING', `Se impidió una decisión automática: el modelo propuso ${modelSuggestedStatus} y las reglas determinísticas lo restringieron a ${finalStatus}.`)
      : finalStatus === 'VERIFIED'
        ? check('SAFETY_GATE', 'Safety Gate', 'PASSED', 'Ninguna regla determinística restringió el caso.')
        : check('SAFETY_GATE', 'Safety Gate', 'WARNING', `Se impidió una decisión automática: ${checks
            .filter((c) => c.status === 'FAILED')
            .map((c) => c.label.toLowerCase())
            .join(', ') || 'hay incertidumbre relevante'}.`),
  );

  return checks;
}
