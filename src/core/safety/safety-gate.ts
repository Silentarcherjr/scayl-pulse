import { mostRestrictive, type DecisionStatus } from '@/core/domain/case-status';
import type { Finding } from '@/core/domain/findings';
import type {
  AgentDecision,
  AiAnalysis,
  DecisionSource,
  EvidenceReference,
  MissingDocument,
} from '@/core/domain/types';
import { CONFIDENCE_THRESHOLD, DETERMINISTIC_CONFIDENCE, SAFETY_RULES_BY_CODE } from './rules';
import { buildDecisionChecks } from './decision-checks';
import type { CaseFacts } from '@/core/orchestrator/case-facts';

export interface SafetyGateInput {
  facts: CaseFacts;
  /** Null when the provider failed or returned an invalid payload. */
  analysis: AiAnalysis | null;
  /** True only when the analysis came from an actual model call. */
  modelBacked: boolean;
  /** True when a model provider was configured and attempted at all. */
  modelAttempted: boolean;
}

const STATUS_ACTIONS: Record<DecisionStatus, string> = {
  VERIFIED:
    'Confirmar cobertura a admisiones y registrar la autorización en el expediente. No se requiere acción adicional del gestor de casos.',
  DOCUMENTS_REQUIRED:
    'Solicitar al hospital los documentos faltantes listados. El caso se reevalúa automáticamente al recibirlos.',
  HUMAN_REVIEW:
    'Asignar el caso a un gestor humano para revisión. La atención de emergencia del paciente NO debe detenerse por esta revisión.',
};

/** Builds the set of source ids the model is allowed to cite. */
function allowedSourceIds(facts: CaseFacts): Set<string> {
  const ids = new Set<string>();
  ids.add(facts.case.id);
  ids.add(facts.admission.hospitalCode);
  ids.add(facts.admission.patientNationalId);
  if (facts.admission.policyNumber) ids.add(facts.admission.policyNumber);
  if (facts.policy) {
    ids.add(facts.policy.id);
    ids.add(facts.policy.policyNumber);
  }
  if (facts.hospital) ids.add(facts.hospital.code);
  for (const h of facts.history.entries) ids.add(h.id);
  for (const e of facts.evidence) ids.add(e.id);
  for (const rule of SAFETY_RULES_BY_CODE.keys()) ids.add(rule);
  ids.add('CLINICAL_RELATIONS');
  return ids;
}

/**
 * THE SAFETY GATE.
 *
 * Contract:
 *  1. Deterministic findings set a FLOOR — the least permissive outcome the
 *     case may receive.
 *  2. The model's suggestion is only allowed to make the outcome MORE
 *     restrictive. It can never lift a case above the floor.
 *  3. Model-supplied evidence that does not cite a known record is dropped.
 *  4. Model-supplied missing-document entries are downgraded to ADVISORY,
 *     because only the deterministic ruleset decides what blocks a case.
 *  5. If the model output is missing or invalid, the case is still decided by
 *     the rules — processing never crashes (docs/DECISIONS.md DEC-006).
 */
export function applySafetyGate(input: SafetyGateInput): AgentDecision {
  const { facts, analysis, modelBacked, modelAttempted } = input;
  const findings: Finding[] = [
    ...facts.policyValidation.findings,
    ...facts.history.findings,
    ...facts.documentFindings,
  ];

  const firedRules: string[] = [];
  let floor: DecisionStatus = 'VERIFIED';

  for (const f of findings) {
    if (f.severity !== 'BLOCKING') continue;
    const rule = SAFETY_RULES_BY_CODE.get(f.code);
    if (!rule) continue;
    floor = mostRestrictive(floor, rule.floor);
    firedRules.push(f.code);
  }

  // --- Confidence handling -------------------------------------------------
  const confidence = analysis ? analysis.confidence : DETERMINISTIC_CONFIDENCE;
  if (analysis && confidence < CONFIDENCE_THRESHOLD) {
    floor = mostRestrictive(floor, 'HUMAN_REVIEW');
    firedRules.push('LOW_CONFIDENCE');
  }

  // --- The model may only tighten -----------------------------------------
  const modelSuggestedStatus = analysis?.suggestedStatus ?? null;
  const status: DecisionStatus = modelSuggestedStatus
    ? mostRestrictive(floor, modelSuggestedStatus)
    : floor;
  const gateOverrode = modelSuggestedStatus !== null && modelSuggestedStatus !== status;

  // --- Evidence: deterministic first, model citations verified -------------
  const deterministicEvidence: EvidenceReference[] = findings
    .filter((f) => f.severity !== 'INFO' || f.code === 'POLICY_ACTIVE' || f.code === 'NO_RELATED_HISTORY')
    .map((f) => f.evidence);

  const allowed = allowedSourceIds(facts);
  const seen = new Set(deterministicEvidence.map((e) => `${e.sourceType}:${e.sourceId}`));
  const modelEvidence = (analysis?.evidence ?? []).filter((e) => {
    const key = `${e.sourceType}:${e.sourceId}`;
    if (seen.has(key)) return false;
    if (!allowed.has(e.sourceId)) return false; // dropped: unverifiable citation
    seen.add(key);
    return true;
  });

  // --- Missing documents: rules are authoritative --------------------------
  const deterministicMissing = facts.documents.missing;
  const knownTypes = new Set(deterministicMissing.map((m) => m.documentType));
  const modelMissing: MissingDocument[] = (analysis?.missingDocuments ?? [])
    .filter((m) => !knownTypes.has(m.documentType))
    .map((m) => ({ ...m, severity: 'ADVISORY' as const }));
  const missingDocuments = [...deterministicMissing, ...modelMissing];

  if (facts.documents.hasBlockingGap && !firedRules.includes('REQUIRED_DOCUMENTS_MISSING')) {
    firedRules.push('REQUIRED_DOCUMENTS_MISSING');
  }

  // --- Narrative -----------------------------------------------------------
  const deterministicReason = buildDeterministicReason(findings, status, facts);
  const useModelNarrative = Boolean(analysis) && !gateOverrode;

  const summary = useModelNarrative && analysis ? analysis.summary : buildDeterministicSummary(status, facts);
  const reason = analysis
    ? gateOverrode
      ? `${deterministicReason}\n\nEl análisis del modelo propuso ${modelSuggestedStatus}; el Safety Gate lo restringió a ${status} por las reglas anteriores.`
      : `${deterministicReason}\n\nContexto del análisis: ${analysis.reason}`
    : deterministicReason;

  const recommendedAction =
    useModelNarrative && analysis?.recommendedAction ? analysis.recommendedAction : STATUS_ACTIONS[status];

  // Honesty rule: a decision is only labelled AI_ASSISTED when a model
  // actually produced the analysis. The deterministic fallback is never
  // dressed up as a model call — that is the whole point of DEC-005.
  const source: DecisionSource = modelBacked
    ? 'AI_ASSISTED'
    : modelAttempted
      ? 'AI_UNAVAILABLE'
      : 'DETERMINISTIC';

  const checks = buildDecisionChecks({
    facts,
    analysis,
    modelBacked,
    finalStatus: status,
    gateOverrode,
    modelSuggestedStatus,
  });

  return {
    status,
    confidence: analysis ? confidence : DETERMINISTIC_CONFIDENCE,
    summary,
    reason,
    evidence: [...deterministicEvidence, ...modelEvidence],
    missingDocuments,
    recommendedAction,
    requiresHuman: status === 'HUMAN_REVIEW',
    generatedAt: new Date().toISOString(),
    source,
    appliedRules: [...new Set(firedRules)],
    gateOverrode,
    modelSuggestedStatus,
    checks,
  };
}

function buildDeterministicSummary(status: DecisionStatus, facts: CaseFacts): string {
  const patient = facts.patient?.fullName ?? 'Asegurado no identificado';
  const hospital = facts.hospital?.name ?? facts.admission.hospitalCode;
  switch (status) {
    case 'VERIFIED':
      // «Verificación administrativa completada», no «cobertura verificada»:
      // el sistema comprueba requisitos, no autoriza una cobertura.
      return `Verificación administrativa completada para ${patient} en ${hospital}. Póliza vigente, hospital en red y documentación obligatoria completa.`;
    case 'DOCUMENTS_REQUIRED':
      return `Cobertura potencialmente válida para ${patient} en ${hospital}, pendiente de ${facts.documents.missing.filter((m) => m.severity === 'BLOCKING').length} documento(s) obligatorio(s).`;
    case 'HUMAN_REVIEW':
      return `El caso de ${patient} en ${hospital} requiere revisión de un gestor humano antes de confirmar cobertura. La atención de emergencia continúa sin interrupción.`;
  }
}

function buildDeterministicReason(findings: Finding[], status: DecisionStatus, facts: CaseFacts): string {
  const blocking = findings.filter((f) => f.severity === 'BLOCKING');
  const warnings = findings.filter((f) => f.severity === 'WARNING');

  const lines: string[] = [];
  if (blocking.length > 0) {
    lines.push('Reglas determinísticas que restringen el caso:');
    for (const f of blocking) lines.push(`• [${f.code}] ${f.message}`);
  } else {
    lines.push('Ninguna regla determinística bloqueó el caso.');
  }

  if (facts.documents.missing.length > 0) {
    lines.push('');
    lines.push('Documentación pendiente:');
    for (const m of facts.documents.missing) {
      lines.push(`• ${m.documentType} (${m.severity === 'BLOCKING' ? 'obligatorio' : 'recomendado'}): ${m.reason}`);
    }
  }

  if (warnings.length > 0) {
    lines.push('');
    lines.push('Observaciones:');
    for (const f of warnings) lines.push(`• [${f.code}] ${f.message}`);
  }

  if (status === 'HUMAN_REVIEW') {
    lines.push('');
    lines.push('SCAYL Pulse no emite diagnósticos ni decisiones médicas y no puede impedir la atención de emergencia.');
  }

  return lines.join('\n');
}
