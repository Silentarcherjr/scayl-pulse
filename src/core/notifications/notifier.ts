import { CASE_STATUS_LABELS } from '@/core/domain/case-status';
import { logger } from '@/lib/logger';
import type { CaseRepository } from '@/core/repository';
import type {
  AgentDecision,
  CaseResolution,
  EmergencyCase,
  Notification,
  NotificationChannel,
} from '@/core/domain/types';
import type { CaseFacts } from '@/core/orchestrator/case-facts';

/** Every outbound message carries this line. It is not optional. */
export const CARE_NOTICE =
  'Este mensaje es administrativo. SCAYL Pulse no emite diagnósticos ni decisiones clínicas y no interrumpe la atención de emergencia del paciente.';

export interface NotificationOutcome {
  notifications: Notification[];
  failures: Array<{ channel: NotificationChannel; error: string }>;
}

function renderBody(
  audience: 'hospital' | 'insurer',
  caseRecord: EmergencyCase,
  facts: CaseFacts,
  decision: AgentDecision,
  isUpdate: boolean,
): string {
  const lines: string[] = [];
  lines.push(`Caso: ${caseRecord.caseNumber}`);
  lines.push(`Estado: ${decision.status} (${CASE_STATUS_LABELS[decision.status]})`);
  lines.push(`Hospital: ${facts.hospital?.name ?? facts.admission.hospitalCode}`);
  lines.push(`Póliza: ${facts.policy?.policyNumber ?? 'no identificada'}`);
  lines.push(`Motivo de ingreso: ${facts.admission.admissionReason}`);
  lines.push('');
  lines.push(decision.summary);
  lines.push('');

  if (decision.missingDocuments.length > 0) {
    lines.push('Documentación pendiente:');
    for (const m of decision.missingDocuments) {
      lines.push(`  - ${m.documentType} (${m.severity === 'BLOCKING' ? 'obligatorio' : 'recomendado'}): ${m.reason}`);
    }
    lines.push('');
  }

  lines.push(`Acción recomendada: ${decision.recommendedAction}`);

  if (audience === 'insurer') {
    lines.push('');
    lines.push(`Confianza del análisis: ${(decision.confidence * 100).toFixed(0)}%`);
    lines.push(`Origen de la decisión: ${decision.source}`);
    if (decision.appliedRules.length > 0) lines.push(`Reglas aplicadas: ${decision.appliedRules.join(', ')}`);
    if (decision.gateOverrode) {
      lines.push(`El Safety Gate restringió la propuesta del modelo (${decision.modelSuggestedStatus} → ${decision.status}).`);
    }
  }

  if (isUpdate) {
    lines.push('');
    lines.push('Esta es una actualización: el caso fue reevaluado tras recibir nueva evidencia.');
  }

  lines.push('');
  lines.push(CARE_NOTICE);
  return lines.join('\n');
}

/**
 * Notifies hospital admissions AND the insurer case manager simultaneously,
 * as the challenge requires. A failure on one channel is recorded and never
 * prevents the other from being delivered.
 */
export async function notifyBothChannels(params: {
  repository: CaseRepository;
  caseRecord: EmergencyCase;
  facts: CaseFacts;
  decision: AgentDecision;
  isUpdate: boolean;
}): Promise<NotificationOutcome> {
  const { repository, caseRecord, facts, decision, isUpdate } = params;
  const prefix = isUpdate ? 'Actualización' : 'Alerta temprana';
  const subject = `${prefix} · ${caseRecord.caseNumber} · ${decision.status}`;

  const targets: Array<{ channel: NotificationChannel; recipient: string; audience: 'hospital' | 'insurer' }> = [
    {
      channel: 'HOSPITAL_ADMISSIONS',
      recipient: facts.hospital?.admissionsContact ?? 'admisiones@desconocido.example',
      audience: 'hospital',
    },
    {
      channel: 'INSURER_CASE_MANAGER',
      recipient: facts.policy?.caseManagerContact ?? 'gestor.casos@scayl-seguros.example',
      audience: 'insurer',
    },
  ];

  const results = await Promise.allSettled(
    targets.map((t) =>
      repository.recordNotification({
        caseId: caseRecord.id,
        channel: t.channel,
        recipient: t.recipient,
        subject,
        body: renderBody(t.audience, caseRecord, facts, decision, isUpdate),
        status: 'SENT',
      }),
    ),
  );

  const notifications: Notification[] = [];
  const failures: NotificationOutcome['failures'] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      notifications.push(result.value);
    } else {
      const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      failures.push({ channel: targets[index].channel, error });
      logger.error('Notification failed', { caseId: caseRecord.id, channel: targets[index].channel, error });
    }
  });

  return { notifications, failures };
}


const OUTCOME_LABELS: Record<CaseResolution['outcome'], string> = {
  COVERAGE_CONFIRMED: 'Cobertura confirmada',
  COVERAGE_DENIED: 'Cobertura denegada',
  CANCELLED: 'Caso cancelado',
};

/**
 * Notifies both parties that a human closed the case. Same dual-channel rule
 * as a decision: the hospital and the insurer learn the outcome at the same
 * time, and neither channel failing blocks the other.
 */
export async function notifyResolution(params: {
  repository: CaseRepository;
  caseRecord: EmergencyCase;
  facts: CaseFacts;
  resolution: CaseResolution;
}): Promise<NotificationOutcome> {
  const { repository, caseRecord, facts, resolution } = params;
  const subject = `Caso cerrado · ${caseRecord.caseNumber} · ${OUTCOME_LABELS[resolution.outcome]}`;

  const body = [
    `Caso: ${caseRecord.caseNumber}`,
    `Resultado: ${resolution.outcome} (${OUTCOME_LABELS[resolution.outcome]})`,
    `Cerrado por: ${resolution.resolvedBy}`,
    `Estado del sistema al cerrarse: ${resolution.statusAtResolution}`,
    '',
    `Motivo: ${resolution.reason}`,
    ...(resolution.notes ? ['', `Notas: ${resolution.notes}`] : []),
    ...(resolution.overrodeSystemRecommendation
      ? [
          '',
          'AVISO DE AUDITORÍA: una persona confirmó la cobertura de un caso que el sistema NO había verificado. La decisión es humana y queda registrada con su autor y su motivo.',
        ]
      : []),
    '',
    CARE_NOTICE,
  ].join('\n');

  const targets: Array<{ channel: NotificationChannel; recipient: string }> = [
    { channel: 'HOSPITAL_ADMISSIONS', recipient: facts.hospital?.admissionsContact ?? 'admisiones@desconocido.example' },
    { channel: 'INSURER_CASE_MANAGER', recipient: facts.policy?.caseManagerContact ?? 'gestor.casos@scayl-seguros.example' },
  ];

  const results = await Promise.allSettled(
    targets.map((t) =>
      repository.recordNotification({
        caseId: caseRecord.id,
        channel: t.channel,
        recipient: t.recipient,
        subject,
        body,
        status: 'SENT',
      }),
    ),
  );

  const notifications: Notification[] = [];
  const failures: NotificationOutcome['failures'] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') notifications.push(result.value);
    else {
      const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      failures.push({ channel: targets[index].channel, error });
      logger.error('Resolution notification failed', { caseId: caseRecord.id, channel: targets[index].channel, error });
    }
  });

  return { notifications, failures };
}
