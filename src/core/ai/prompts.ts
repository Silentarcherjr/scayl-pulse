import type { CaseFacts } from '@/core/orchestrator/case-facts';
import { TERMINAL_DECISION_STATUSES } from '@/core/domain/case-status';

export const SYSTEM_INSTRUCTION = `Eres el analizador documental de SCAYL Pulse, un sistema de alerta temprana para ingresos a emergencias de una aseguradora.

TU FUNCIÓN
Analizas evidencia administrativa y documental de un expediente de emergencia y produces un análisis estructurado en JSON.

LÍMITES ABSOLUTOS (no negociables)
1. NO emites diagnósticos médicos ni recomendaciones clínicas.
2. NO decides si se presta o no atención médica. La atención de emergencia nunca se detiene por tu análisis.
3. NO inventas pólizas, diagnósticos, antecedentes, cláusulas, fechas ni documentos. Si un dato no está en el contexto, no existe para ti.
4. Solo puedes citar evidencia usando los identificadores presentes en el contexto (campo "citableSourceIds"). Cualquier cita a un identificador inexistente será descartada.
5. Tu salida es una PROPUESTA. Un Safety Gate determinístico posterior puede restringirla, nunca ampliarla.
6. Ante incertidumbre relevante, información contradictoria o evidencia insuficiente, propone HUMAN_REVIEW y baja tu confianza.

ESTADOS PERMITIDOS
${TERMINAL_DECISION_STATUSES.join(' | ')}
- VERIFIED: póliza vigente, hospital en red, documentación obligatoria completa y sin conflictos pendientes.
- DOCUMENTS_REQUIRED: la cobertura es potencialmente válida pero falta documentación obligatoria identificable.
- HUMAN_REVIEW: hay un conflicto, una preexistencia potencial sin aclarar, o incertidumbre relevante.

CONFIANZA
confidence es un número entre 0 y 1 sobre la solidez del soporte documental, NUNCA sobre una apreciación médica. Si dudas, usa un valor bajo.

IDIOMA
Responde siempre en español neutro, en lenguaje claro para personal de admisiones y gestores de casos.`;

/**
 * The model receives structured facts, not raw prose, so its job is analysis
 * and explanation — not extraction of administrative truth.
 */
export function buildUserPrompt(facts: CaseFacts): string {
  const context = {
    case: {
      id: facts.case.id,
      caseNumber: facts.case.caseNumber,
      currentStatus: facts.case.status,
      admittedAt: facts.admittedAt,
    },
    admission: {
      hospitalCode: facts.admission.hospitalCode,
      admissionReason: facts.admission.admissionReason,
      admissionReasonCode: facts.admission.admissionReasonCode ?? null,
      triageLevel: facts.admission.triageLevel,
      estimatedCost: facts.admission.estimatedCost ?? null,
    },
    hospital: facts.hospital
      ? { code: facts.hospital.code, name: facts.hospital.name, networkStatus: facts.hospital.networkStatus }
      : null,
    patient: facts.patient ? { id: facts.patient.id, identified: true } : { identified: false },
    policy: facts.policy
      ? {
          policyNumber: facts.policy.policyNumber,
          planCode: facts.policy.planCode,
          status: facts.policy.status,
          effectiveFrom: facts.policy.effectiveFrom,
          effectiveTo: facts.policy.effectiveTo,
          waitingPeriodDays: facts.policy.waitingPeriodDays,
          emergencyCoverage: facts.policy.emergencyCoverage,
          exclusions: facts.policy.exclusions,
        }
      : null,
    deterministicPolicyValidation: {
      coverageActiveAtAdmission: facts.policyValidation.coverageActiveAtAdmission,
      expired: facts.policyValidation.expired,
      hospitalInNetwork: facts.policyValidation.hospitalInNetwork,
      withinWaitingPeriod: facts.policyValidation.withinWaitingPeriod,
      findings: facts.policyValidation.findings.map((f) => ({ code: f.code, severity: f.severity, message: f.message })),
    },
    documentation: {
      required: facts.documents.required,
      present: facts.documents.present,
      missing: facts.documents.missing,
    },
    medicalHistory: facts.history.entries.map((e) => ({
      id: e.id,
      conditionCode: e.conditionCode,
      conditionLabel: e.conditionLabel,
      diagnosedAt: e.diagnosedAt,
      source: e.source,
      notes: e.notes ?? null,
    })),
    declaredRelatedConditions: facts.history.relatedConditions.map((r) => ({
      historyEntryId: r.entry.id,
      conditionCode: r.entry.conditionCode,
      conditionLabel: r.entry.conditionLabel,
      rationale: r.rationale,
      diagnosedBeforePolicyStart: r.diagnosedBeforePolicyStart,
      addressedByEvidence: r.addressed,
    })),
    evidenceOnFile: facts.evidence.map((e) => ({
      id: e.id,
      documentType: e.documentType,
      title: e.title,
      content: e.content,
      submittedBy: e.submittedBy,
      createdAt: e.createdAt,
    })),
    citableSourceIds: buildCitableIds(facts),
  };

  return `Analiza el siguiente expediente de emergencia y devuelve únicamente el JSON solicitado.

Notas importantes:
- "deterministicPolicyValidation" y "declaredRelatedConditions" ya fueron calculados por reglas determinísticas. No los contradigas: explícalos y complétalos.
- Si "declaredRelatedConditions" contiene una condición con diagnosedBeforePolicyStart=true y addressedByEvidence=false, existe una preexistencia potencial SIN aclarar.
- En "missingDocuments" solo puedes listar documentos que realmente falten según "documentation".

EXPEDIENTE:
${JSON.stringify(context, null, 2)}`;
}

function buildCitableIds(facts: CaseFacts): string[] {
  const ids = new Set<string>([facts.case.id, facts.admission.hospitalCode]);
  if (facts.policy) ids.add(facts.policy.policyNumber);
  if (facts.hospital) ids.add(facts.hospital.code);
  for (const e of facts.history.entries) ids.add(e.id);
  for (const e of facts.evidence) ids.add(e.id);
  return [...ids];
}
