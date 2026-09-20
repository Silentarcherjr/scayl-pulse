import { CASE_STATUS_LABELS } from '@/core/domain/case-status';
import { CASE_SUMMARY_RESPONSE_SCHEMA, caseSummarySchema } from '@/core/domain/schemas';
import { ANALYZER_TIMEOUT_MS, selectProvider } from '@/core/ai/evidence-analyzer';
import { buildCaseFacts } from '@/core/orchestrator/case-facts';
import { logger } from '@/lib/logger';
import type { CaseRepository } from '@/core/repository';
import type { AiProvider, AnalyzerResponse } from '@/core/ai/provider';
import type { CaseEvent, CaseSummary, EmergencyCase } from '@/core/domain/types';

const SYSTEM_INSTRUCTION = `Eres el asistente de resumen de SCAYL Pulse. Escribes para un gestor de casos de una aseguradora que abre un expediente de emergencia y necesita entenderlo en diez segundos.

QUÉ HACES
Resumes un expediente que YA está decidido. Explicas qué pasó, qué cambió y qué se espera de la persona que lee.

LÍMITES ABSOLUTOS
1. La decisión YA está tomada por reglas determinísticas y un Safety Gate. Tu resumen la explica; NUNCA la contradice ni sugiere otra distinta.
2. No emites diagnósticos ni juicios clínicos, y no puedes impedir la atención de emergencia.
3. No inventas nada. Si un dato no está en el expediente, no existe.
4. Si el expediente no fue analizado por un modelo, no insinúes que sí.

TONO
Español neutro, directo, sin jerga técnica y sin adornos. Frases cortas. Escribes para alguien cansado a las tres de la mañana.`;

function buildPrompt(caseRecord: EmergencyCase, events: CaseEvent[], factsSummary: string): string {
  const decision = caseRecord.currentDecision;
  const timeline = events.map((e) => `${e.seq}. [${e.type}] ${e.message}`).join('\n');

  const priorDecisions = events
    .filter((e) => e.type === 'CASE_CLASSIFIED' || e.type === 'DECISION_UPDATED')
    .map((e) => {
      const d = e.payload.decision as { status?: string } | undefined;
      return `  seq ${e.seq}: ${d?.status ?? 'desconocido'}`;
    })
    .join('\n');

  return `Resume este expediente para el gestor de casos. Devuelve solo el JSON pedido.

DECISIÓN ACTUAL (no la contradigas)
  estado: ${decision?.status ?? caseRecord.status} (${CASE_STATUS_LABELS[caseRecord.status]})
  requiere revisión humana: ${decision?.requiresHuman ?? 'desconocido'}
  origen de la decisión: ${decision?.source ?? 'desconocido'}
  reglas aplicadas: ${decision?.appliedRules.join(', ') || 'ninguna'}
  motivo: ${decision?.reason ?? '(sin motivo registrado)'}
  acción recomendada: ${decision?.recommendedAction ?? '(ninguna)'}

COMPROBACIONES
${(decision?.checks ?? []).map((c) => `  [${c.status}] ${c.label}: ${c.detail}`).join('\n') || '  (ninguna)'}

DECISIONES SUCESIVAS DE ESTE CASO
${priorDecisions || '  (solo la inicial)'}

EXPEDIENTE
${factsSummary}

TIMELINE COMPLETO
${timeline}

Instrucciones para los campos:
- "whatChanged": si el caso tuvo más de una decisión, explica qué evidencia llegó y qué cambió respecto a la anterior. Si solo hay una, devuelve null.
- "whatIsNeeded": qué se espera EXACTAMENTE de la persona que lee. Si no se espera nada porque el caso está verificado, dilo.
- "keyPoints": como mucho cinco viñetas con los hechos que importan.`;
}

/** Written from the record itself when no model is available. */
function deterministicSummary(caseRecord: EmergencyCase, events: CaseEvent[]): CaseSummary {
  const decision = caseRecord.currentDecision;
  const decisions = events.filter((e) => e.type === 'CASE_CLASSIFIED' || e.type === 'DECISION_UPDATED');
  const evidenceEvents = events.filter((e) => e.type === 'NEW_EVIDENCE_RECEIVED');
  const failed = (decision?.checks ?? []).filter((c) => c.status === 'FAILED');

  return {
    headline: `${caseRecord.caseNumber} · ${decision?.status ?? caseRecord.status} — ${CASE_STATUS_LABELS[caseRecord.status]}`,
    whatHappened:
      `Ingreso en ${caseRecord.admission.hospitalCode} por: ${caseRecord.admission.admissionReason} ` +
      `El expediente registra ${events.length} eventos y ${decisions.length} decisión(es).` +
      (failed.length > 0 ? ` Comprobaciones no superadas: ${failed.map((c) => c.label).join('; ')}.` : ''),
    whatChanged:
      decisions.length > 1
        ? `El caso se reevaluó ${decisions.length - 1} vez(ces) tras recibir ${evidenceEvents.length} documento(s) nuevo(s). ` +
          `Pasó de ${(decisions[0].payload.decision as { status?: string })?.status ?? '?'} a ${decision?.status ?? '?'}.`
        : null,
    whatIsNeeded: decision?.recommendedAction ?? 'Sin acción registrada.',
    keyPoints: [
      ...failed.map((c) => `${c.label}: ${c.detail}`),
      ...(decision?.missingDocuments.filter((m) => m.severity === 'BLOCKING').map((m) => `Falta ${m.documentType}: ${m.reason}`) ?? []),
    ].slice(0, 5),
    source: 'DETERMINISTIC',
    model: null,
    generatedAt: new Date().toISOString(),
    decisionGeneratedAt: decision?.generatedAt ?? null,
  };
}

export interface BuildSummaryOptions {
  repository: CaseRepository;
  caseRecord: EmergencyCase;
  provider?: AiProvider;
  /** Ignore any cached summary and generate a fresh one. */
  refresh?: boolean;
}

/**
 * Produces the case-manager summary.
 *
 * Generated ON DEMAND, never during admission: the admission path is what a
 * hospital waits on, and a second model call there would double its latency
 * for a narrative nobody is reading yet. Here the reader is a human who just
 * opened the case, so a few seconds are acceptable and the summary can cover
 * the whole timeline, including decisions that came after the first one.
 *
 * The result is cached as a timeline event and reused until the decision
 * changes, so reopening a case costs nothing.
 */
export async function getCaseSummary(options: BuildSummaryOptions): Promise<CaseSummary> {
  const { repository, caseRecord, refresh } = options;
  const events = await repository.listEvents(caseRecord.id);
  const decisionStamp = caseRecord.currentDecision?.generatedAt ?? null;

  if (!refresh) {
    const cached = [...events]
      .reverse()
      .find(
        (e) =>
          e.type === 'CASE_SUMMARY_GENERATED' &&
          (e.payload.summary as CaseSummary | undefined)?.decisionGeneratedAt === decisionStamp,
      );
    if (cached) return cached.payload.summary as CaseSummary;
  }

  const facts = await buildCaseFacts(repository, caseRecord);
  const factsSummary = [
    `Asegurado: ${facts.patient?.fullName ?? 'no identificado'}`,
    `Hospital: ${facts.hospital?.name ?? caseRecord.admission.hospitalCode} (${facts.hospital?.networkStatus ?? 'desconocido'})`,
    `Póliza: ${facts.policy ? `${facts.policy.policyNumber}, ${facts.policy.status}, vigencia ${facts.policy.effectiveFrom} a ${facts.policy.effectiveTo}` : 'no encontrada'}`,
    `Antecedentes en historial: ${facts.history.entries.length}`,
    `Documentos en el expediente: ${facts.evidence.map((e) => e.documentType).join(', ') || 'ninguno'}`,
  ].join('\n');

  const provider = options.provider ?? selectProvider(facts);
  let summary = deterministicSummary(caseRecord, events);

  if (provider.isModelBacked) {
    const response = await provider
      .analyze({
        systemInstruction: SYSTEM_INSTRUCTION,
        userPrompt: buildPrompt(caseRecord, events, factsSummary),
        responseSchema: CASE_SUMMARY_RESPONSE_SCHEMA,
        timeoutMs: ANALYZER_TIMEOUT_MS,
      })
      .catch(
        (error): AnalyzerResponse => ({ raw: null, error: String(error), latencyMs: 0 }),
      );

    const parsed = safeParse(response.raw);
    await repository
      .recordAiInteraction({
        caseId: caseRecord.id,
        provider: `${provider.name}:summary`,
        model: response.modelUsed ?? provider.model,
        valid: parsed !== null,
        latencyMs: response.latencyMs,
        error: parsed ? null : (response.error ?? 'summary failed schema validation'),
        rawResponse: response.raw ? response.raw.slice(0, 4_000) : null,
      })
      .catch((error) => logger.warn('Could not record summary interaction', { error: String(error) }));

    if (parsed) {
      summary = {
        ...parsed,
        source: 'AI_ASSISTED',
        model: response.modelUsed ?? provider.model,
        generatedAt: new Date().toISOString(),
        decisionGeneratedAt: decisionStamp,
      };
    } else {
      summary = { ...summary, source: 'AI_UNAVAILABLE' };
    }
  }

  await repository
    .appendEvent({
      caseId: caseRecord.id,
      type: 'CASE_SUMMARY_GENERATED',
      actor: 'AI_AGENT',
      statusBefore: caseRecord.status,
      statusAfter: caseRecord.status,
      message: `Resumen para el gestor generado (${summary.source}).`,
      payload: { summary },
    })
    .catch((error) => logger.warn('Could not store case summary', { error: String(error) }));

  return summary;
}

function safeParse(raw: string | null) {
  if (!raw) return null;
  const fenced = raw.trim().match(/```(?:json)?\s*([\s\S]*?)```/i);
  try {
    const parsed = JSON.parse(fenced?.[1]?.trim() ?? raw.trim());
    const result = caseSummarySchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
