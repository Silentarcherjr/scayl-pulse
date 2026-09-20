import type {
  AdmissionInput,
  AgentDecision,
  AiInteraction,
  CaseEvent,
  CaseEventType,
  CaseEvidence,
  DocumentType,
  EmergencyCase,
  EventActor,
  Hospital,
  MedicalHistoryEntry,
  Notification,
  NotificationChannel,
  Patient,
  Policy,
} from '@/core/domain/types';
import type { CaseStatus } from '@/core/domain/case-status';

export interface AppendEventInput {
  caseId: string;
  type: CaseEventType;
  actor: EventActor;
  statusBefore: CaseStatus | null;
  statusAfter: CaseStatus | null;
  message: string;
  payload?: Record<string, unknown>;
}

export interface AddEvidenceInput {
  caseId: string;
  documentType: DocumentType;
  title: string;
  content: string;
  submittedBy: string;
  metadata?: Record<string, unknown>;
}

export interface RecordNotificationInput {
  caseId: string;
  channel: NotificationChannel;
  recipient: string;
  subject: string;
  body: string;
  status: 'SENT' | 'FAILED';
}

/**
 * Persistence port.
 *
 * NOTE (immutability): there is deliberately no updateEvent / deleteEvent.
 * The audit timeline is append-only by construction, not by convention.
 * Adding a mutation method here requires a DECISIONS.md entry.
 */
export interface CaseRepository {
  readonly kind: 'in-memory' | 'supabase';

  // Reference data ----------------------------------------------------------
  findHospitalByCode(code: string): Promise<Hospital | null>;
  findPatientByNationalId(nationalId: string): Promise<Patient | null>;
  findPolicyByNumber(policyNumber: string): Promise<Policy | null>;
  findPoliciesByPatientId(patientId: string): Promise<Policy[]>;
  listMedicalHistory(patientId: string): Promise<MedicalHistoryEntry[]>;

  // Cases -------------------------------------------------------------------
  createCase(input: {
    admission: AdmissionInput;
    hospitalId: string | null;
    patientId: string | null;
    policyId: string | null;
    scenarioId: string | null;
  }): Promise<EmergencyCase>;
  getCase(caseId: string): Promise<EmergencyCase | null>;
  listCases(limit?: number): Promise<EmergencyCase[]>;
  countCases(): Promise<number>;
  updateCaseStatus(caseId: string, status: CaseStatus): Promise<EmergencyCase>;
  updateCaseDecision(caseId: string, status: CaseStatus, decision: AgentDecision): Promise<EmergencyCase>;

  // Append-only timeline ----------------------------------------------------
  appendEvent(input: AppendEventInput): Promise<CaseEvent>;
  listEvents(caseId: string): Promise<CaseEvent[]>;

  // Evidence ----------------------------------------------------------------
  addEvidence(input: AddEvidenceInput): Promise<CaseEvidence>;
  listEvidence(caseId: string): Promise<CaseEvidence[]>;

  // Notifications -----------------------------------------------------------
  recordNotification(input: RecordNotificationInput): Promise<Notification>;
  listNotifications(caseId: string): Promise<Notification[]>;

  // AI audit ----------------------------------------------------------------
  recordAiInteraction(input: Omit<AiInteraction, 'id' | 'createdAt'>): Promise<AiInteraction>;
  listAiInteractions(caseId: string): Promise<AiInteraction[]>;
}
