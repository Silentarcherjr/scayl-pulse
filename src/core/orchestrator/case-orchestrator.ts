import { canTransition, type CaseStatus } from '@/core/domain/case-status';
import { analyzeEvidence } from '@/core/ai/evidence-analyzer';
import { notifyBothChannels } from '@/core/notifications/notifier';
import { applySafetyGate } from '@/core/safety/safety-gate';
import { getRepository, type CaseRepository } from '@/core/repository';
import { logger } from '@/lib/logger';
import { ApiError } from '@/lib/http';
import type { AiProvider } from '@/core/ai/provider';
import type {
  AdmissionInput,
  AgentDecision,
  CaseEvidence,
  EmergencyCase,
} from '@/core/domain/types';
import { buildCaseFacts, type CaseFacts } from './case-facts';

export interface ProcessResult {
  case: EmergencyCase;
  decision: AgentDecision;
  facts: CaseFacts;
}

export interface OrchestratorOptions {
  repository?: CaseRepository;
  /** Injected in tests to simulate provider failures / malformed output. */
  aiProvider?: AiProvider;
}

export class CaseOrchestrator {
  private readonly repository: CaseRepository;
  private readonly aiProvider?: AiProvider;

  constructor(options: OrchestratorOptions = {}) {
    this.repository = options.repository ?? getRepository();
    this.aiProvider = options.aiProvider;
  }

  // -------------------------------------------------------------------------
  // Admission (webhook entry point)
  // -------------------------------------------------------------------------
  async processAdmission(input: AdmissionInput): Promise<ProcessResult> {
    const [hospital, patient] = await Promise.all([
      this.repository.findHospitalByCode(input.hospitalCode),
      this.repository.findPatientByNationalId(input.patientNationalId),
    ]);

    const policy = input.policyNumber
      ? await this.repository.findPolicyByNumber(input.policyNumber)
      : patient
        ? ((await this.repository.findPoliciesByPatientId(patient.id)).find((p) => p.status === 'ACTIVE') ?? null)
        : null;

    const caseRecord = await this.repository.createCase({
      admission: input,
      hospitalId: hospital?.id ?? null,
      patientId: patient?.id ?? null,
      policyId: policy?.id ?? null,
      scenarioId: input.scenarioId ?? null,
    });

    await this.repository.appendEvent({
      caseId: caseRecord.id,
      type: 'ADMISSION_RECEIVED',
      actor: 'HOSPITAL',
      statusBefore: null,
      statusAfter: 'ADMITTED',
      message: `Ingreso recibido desde ${hospital?.name ?? input.hospitalCode}: ${input.admissionReason}`,
      payload: { triageLevel: input.triageLevel, admissionReasonCode: input.admissionReasonCode ?? null },
    });

    await this.repository.appendEvent({
      caseId: caseRecord.id,
      type: patient ? 'PATIENT_IDENTIFIED' : 'PATIENT_NOT_FOUND',
      actor: 'SYSTEM',
      statusBefore: 'ADMITTED',
      statusAfter: 'ADMITTED',
      message: patient
        ? `Asegurado identificado: ${patient.fullName}.`
        : `No se encontró un asegurado con la cédula ${input.patientNationalId}.`,
      payload: { patientId: patient?.id ?? null },
    });

    // Documents that travelled with the webhook become case evidence.
    for (const doc of input.attachedDocuments ?? []) {
      await this.repository.addEvidence({
        caseId: caseRecord.id,
        documentType: doc.documentType,
        title: doc.title,
        content: doc.content,
        submittedBy: `hospital:${input.hospitalCode}`,
      });
    }

    const checking = await this.transition(caseRecord, 'CHECKING');
    return this.runPipeline(checking, { isUpdate: false });
  }

  // -------------------------------------------------------------------------
  // New evidence → reassessment (the "live case" behaviour)
  // -------------------------------------------------------------------------
  async submitEvidence(
    caseId: string,
    evidence: {
      documentType: CaseEvidence['documentType'];
      title: string;
      content: string;
      submittedBy: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<ProcessResult> {
    const caseRecord = await this.repository.getCase(caseId);
    if (!caseRecord) throw ApiError.notFound(`Case ${caseId} not found`);
    if (caseRecord.status === 'RESOLVED') {
      throw ApiError.conflict('El caso está RESOLVED y no admite nueva evidencia.', {
        caseId,
        status: caseRecord.status,
      });
    }
    if (!canTransition(caseRecord.status, 'REASSESSING')) {
      throw ApiError.conflict(
        `No se puede reevaluar un caso en estado ${caseRecord.status}: hay una evaluación en curso.`,
        { caseId, status: caseRecord.status },
      );
    }

    const stored = await this.repository.addEvidence({ caseId, ...evidence });

    await this.repository.appendEvent({
      caseId,
      type: 'NEW_EVIDENCE_RECEIVED',
      actor: 'HOSPITAL',
      statusBefore: caseRecord.status,
      statusAfter: caseRecord.status,
      message: `Nueva evidencia recibida: ${stored.title} (${stored.documentType}).`,
      payload: { evidenceId: stored.id, documentType: stored.documentType, submittedBy: stored.submittedBy },
    });

    const reassessing = await this.transition(caseRecord, 'REASSESSING');

    await this.repository.appendEvent({
      caseId,
      type: 'REASSESSMENT_STARTED',
      actor: 'SYSTEM',
      statusBefore: caseRecord.status,
      statusAfter: 'REASSESSING',
      message: 'El expediente se reevalúa con la evidencia recibida. Las decisiones anteriores se conservan en el historial.',
      payload: { previousStatus: caseRecord.status, previousDecisionStatus: caseRecord.currentDecision?.status ?? null },
    });

    return this.runPipeline(reassessing, { isUpdate: true });
  }

  // -------------------------------------------------------------------------
  // Shared pipeline: facts → AI → Safety Gate → decision → notifications
  // -------------------------------------------------------------------------
  private async runPipeline(caseRecord: EmergencyCase, opts: { isUpdate: boolean }): Promise<ProcessResult> {
    const statusBefore = caseRecord.status;
    const facts = await buildCaseFacts(this.repository, caseRecord);

    await this.repository.appendEvent({
      caseId: caseRecord.id,
      type: 'POLICY_RETRIEVED',
      actor: 'SYSTEM',
      statusBefore,
      statusAfter: statusBefore,
      message: facts.policy
        ? `Póliza ${facts.policy.policyNumber} recuperada (${facts.policy.planCode}, estado ${facts.policy.status}).`
        : 'No se encontró una póliza asociada al asegurado.',
      payload: { policyNumber: facts.policy?.policyNumber ?? null, policyStatus: facts.policy?.status ?? null },
    });

    await this.repository.appendEvent({
      caseId: caseRecord.id,
      type: 'POLICY_VALIDATED',
      actor: 'SYSTEM',
      statusBefore,
      statusAfter: statusBefore,
      message: facts.policyValidation.coverageActiveAtAdmission
        ? 'La póliza está vigente en la fecha del ingreso.'
        : 'La validación determinística de la póliza encontró hallazgos que restringen el caso.',
      payload: {
        coverageActiveAtAdmission: facts.policyValidation.coverageActiveAtAdmission,
        hospitalInNetwork: facts.policyValidation.hospitalInNetwork,
        findings: facts.policyValidation.findings.map((f) => ({ code: f.code, severity: f.severity })),
      },
    });

    await this.repository.appendEvent({
      caseId: caseRecord.id,
      type: 'HISTORY_RETRIEVED',
      actor: 'SYSTEM',
      statusBefore,
      statusAfter: statusBefore,
      message: `Historial recuperado: ${facts.history.entries.length} antecedente(s), ${facts.history.relatedConditions.length} potencialmente relacionado(s) con el motivo de ingreso.`,
      payload: {
        entries: facts.history.entries.length,
        relatedConditionCodes: facts.history.relatedConditions.map((r) => r.entry.conditionCode),
        unresolvedConflict: facts.history.hasUnresolvedPreExistingConflict,
      },
    });

    await this.repository.appendEvent({
      caseId: caseRecord.id,
      type: 'AI_ANALYSIS_STARTED',
      actor: 'AI_AGENT',
      statusBefore,
      statusAfter: statusBefore,
      message: 'Se solicita el análisis documental al agente de IA.',
      payload: { evidenceCount: facts.evidence.length },
    });

    const analysis = await analyzeEvidence({
      facts,
      repository: this.repository,
      provider: this.aiProvider,
    });

    await this.repository.appendEvent({
      caseId: caseRecord.id,
      type: analysis.analysis ? 'AI_ANALYSIS_COMPLETED' : 'AI_ANALYSIS_FAILED',
      actor: 'AI_AGENT',
      statusBefore,
      statusAfter: statusBefore,
      message: analysis.analysis
        ? `Análisis recibido de ${analysis.providerName} (${analysis.model}) en ${analysis.latencyMs} ms.`
        : `El análisis de IA no pudo usarse: ${analysis.error ?? 'error desconocido'}. El caso continúa con reglas determinísticas.`,
      payload: {
        provider: analysis.providerName,
        model: analysis.model,
        modelBacked: analysis.modelBacked,
        fellBackToDeterministic: analysis.fellBackToDeterministic,
        suggestedStatus: analysis.analysis?.suggestedStatus ?? null,
        confidence: analysis.analysis?.confidence ?? null,
        error: analysis.error,
        latencyMs: analysis.latencyMs,
      },
    });

    const decision = applySafetyGate({
      facts,
      analysis: analysis.analysis,
      modelBacked: analysis.modelBacked,
      modelAttempted: analysis.modelBacked || analysis.fellBackToDeterministic,
    });

    await this.repository.appendEvent({
      caseId: caseRecord.id,
      type: 'SAFETY_GATE_APPLIED',
      actor: 'SAFETY_GATE',
      statusBefore,
      statusAfter: statusBefore,
      message: decision.gateOverrode
        ? `El Safety Gate restringió la propuesta del modelo: ${decision.modelSuggestedStatus} → ${decision.status}.`
        : `El Safety Gate confirmó el resultado ${decision.status}.`,
      payload: {
        appliedRules: decision.appliedRules,
        modelSuggestedStatus: decision.modelSuggestedStatus,
        finalStatus: decision.status,
        gateOverrode: decision.gateOverrode,
      },
    });

    const updated = await this.applyDecision(caseRecord, decision, opts.isUpdate);

    const outcome = await notifyBothChannels({
      repository: this.repository,
      caseRecord: updated,
      facts,
      decision,
      isUpdate: opts.isUpdate,
    });

    for (const notification of outcome.notifications) {
      await this.repository.appendEvent({
        caseId: caseRecord.id,
        type: notification.channel === 'HOSPITAL_ADMISSIONS' ? 'HOSPITAL_NOTIFIED' : 'INSURER_NOTIFIED',
        actor: 'SYSTEM',
        statusBefore: decision.status,
        statusAfter: decision.status,
        message:
          notification.channel === 'HOSPITAL_ADMISSIONS'
            ? `Admisiones del hospital notificadas (${notification.recipient}).`
            : `Gestor de casos de la aseguradora notificado (${notification.recipient}).`,
        payload: { notificationId: notification.id, recipient: notification.recipient },
      });
    }

    for (const failure of outcome.failures) {
      await this.repository.appendEvent({
        caseId: caseRecord.id,
        type: 'NOTIFICATION_FAILED',
        actor: 'SYSTEM',
        statusBefore: decision.status,
        statusAfter: decision.status,
        message: `No se pudo notificar el canal ${failure.channel}.`,
        payload: { channel: failure.channel, error: failure.error },
      });
    }

    return { case: updated, decision, facts };
  }

  private async applyDecision(
    caseRecord: EmergencyCase,
    decision: AgentDecision,
    isUpdate: boolean,
  ): Promise<EmergencyCase> {
    if (!canTransition(caseRecord.status, decision.status)) {
      // Fails loudly rather than corrupting the timeline.
      throw new Error(`Invalid transition ${caseRecord.status} -> ${decision.status} for case ${caseRecord.id}`);
    }
    const updated = await this.repository.updateCaseDecision(caseRecord.id, decision.status, decision);

    await this.repository.appendEvent({
      caseId: caseRecord.id,
      type: isUpdate ? 'DECISION_UPDATED' : 'CASE_CLASSIFIED',
      actor: 'SYSTEM',
      statusBefore: caseRecord.status,
      statusAfter: decision.status,
      message: decision.summary,
      payload: { decision },
    });

    logger.info('Case decided', {
      caseId: caseRecord.id,
      status: decision.status,
      source: decision.source,
      appliedRules: decision.appliedRules,
    });

    return updated;
  }

  private async transition(caseRecord: EmergencyCase, to: CaseStatus): Promise<EmergencyCase> {
    if (!canTransition(caseRecord.status, to)) {
      throw new Error(`Invalid transition ${caseRecord.status} -> ${to} for case ${caseRecord.id}`);
    }
    return this.repository.updateCaseStatus(caseRecord.id, to);
  }
}
