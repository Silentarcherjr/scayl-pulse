import type { CaseStatus, DecisionStatus } from './case-status';
import type { DecisionCheck } from '@/core/safety/decision-checks';

// ---------------------------------------------------------------------------
// Reference data (synthetic only — see docs/DECISIONS.md, DEC-002)
// ---------------------------------------------------------------------------

export type NetworkStatus = 'IN_NETWORK' | 'OUT_OF_NETWORK' | 'UNKNOWN';

export interface Hospital {
  id: string;
  code: string;
  name: string;
  networkStatus: NetworkStatus;
  admissionsContact: string;
}

export interface Patient {
  id: string;
  nationalId: string;
  fullName: string;
  birthDate: string; // ISO date
}

export type PolicyStatus = 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED';

export interface Policy {
  id: string;
  policyNumber: string;
  patientId: string;
  insurer: string;
  planCode: string;
  status: PolicyStatus;
  effectiveFrom: string; // ISO date
  effectiveTo: string; // ISO date
  /** Days after effectiveFrom during which non-emergency coverage is limited. */
  waitingPeriodDays: number;
  emergencyCoverage: boolean;
  caseManagerContact: string;
  exclusions: string[];
}

export interface MedicalHistoryEntry {
  id: string;
  patientId: string;
  conditionCode: string;
  conditionLabel: string;
  diagnosedAt: string; // ISO date
  source: 'DECLARED' | 'CLAIM' | 'PROVIDER_RECORD';
  notes?: string;
}

// ---------------------------------------------------------------------------
// Documents & evidence
// ---------------------------------------------------------------------------

export const DOCUMENT_TYPES = [
  'ADMISSION_FORM',
  'PATIENT_ID',
  'MEDICAL_REPORT',
  'TRIAGE_NOTE',
  'LAB_RESULT',
  'IMAGING_REPORT',
  'SPECIALIST_REPORT',
  'COST_ESTIMATE',
  'AUTHORIZATION_REQUEST',
  'OTHER',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface CaseEvidence {
  id: string;
  caseId: string;
  documentType: DocumentType;
  title: string;
  /** Synthetic free text standing in for an OCR'd / uploaded document. */
  content: string;
  submittedBy: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface MissingDocument {
  documentType: DocumentType;
  reason: string;
  /** BLOCKING keeps the case out of VERIFIED; ADVISORY does not. */
  severity: 'BLOCKING' | 'ADVISORY';
}

export interface EvidenceReference {
  /** Where the statement comes from. Never invented by the model. */
  sourceType: 'POLICY' | 'MEDICAL_HISTORY' | 'ADMISSION' | 'DOCUMENT' | 'RULE';
  sourceId: string;
  excerpt: string;
}

// ---------------------------------------------------------------------------
// Admission & case
// ---------------------------------------------------------------------------

export type TriageLevel = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE';

export interface AdmissionInput {
  hospitalCode: string;
  patientNationalId: string;
  policyNumber?: string;
  admissionReason: string;
  admissionReasonCode?: string;
  triageLevel: TriageLevel;
  estimatedCost?: number;
  admittedAt?: string;
  attachedDocuments?: Array<{
    documentType: DocumentType;
    title: string;
    content: string;
  }>;
  /** Set only by the demo runner; never by a real hospital webhook. */
  scenarioId?: string;
}

export interface EmergencyCase {
  id: string;
  caseNumber: string;
  status: CaseStatus;
  hospitalId: string | null;
  patientId: string | null;
  policyId: string | null;
  admission: AdmissionInput;
  currentDecision: AgentDecision | null;
  scenarioId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Agent decision — the contract the frontend renders
// ---------------------------------------------------------------------------

export type DecisionSource = 'DETERMINISTIC' | 'AI_ASSISTED' | 'AI_UNAVAILABLE';

export type { DecisionCheck, CheckStatus } from '@/core/safety/decision-checks';

export interface AgentDecision {
  status: DecisionStatus;
  /** 0..1 — confidence in the supporting analysis, not in the medicine. */
  confidence: number;
  summary: string;
  reason: string;
  evidence: EvidenceReference[];
  missingDocuments: MissingDocument[];
  recommendedAction: string;
  requiresHuman: boolean;
  generatedAt: string;
  /** How the decision was produced. Always present; useful for the jury. */
  source: DecisionSource;
  /** Deterministic rules that fired, in precedence order. */
  appliedRules: string[];
  /** True when the Safety Gate overrode what the model proposed. */
  gateOverrode: boolean;
  /** What the model proposed before the gate, for auditability. */
  modelSuggestedStatus: DecisionStatus | null;
  /**
   * Every check the system ran, passing ones included — the data behind the
   * "why did it decide this?" panel (docs/IDEAS.md IDEA-006).
   */
  checks: DecisionCheck[];
}

// ---------------------------------------------------------------------------
// AI analysis — a PROPOSAL, never a final decision
// ---------------------------------------------------------------------------

export interface AiAnalysis {
  suggestedStatus: DecisionStatus;
  confidence: number;
  summary: string;
  reason: string;
  evidence: EvidenceReference[];
  missingDocuments: MissingDocument[];
  recommendedAction: string;
  /** Conditions the model believes may relate to the admission reason. */
  potentiallyRelatedConditions: Array<{
    conditionCode: string;
    conditionLabel: string;
    relationRationale: string;
    /** Model's read of whether the record supports the relation. */
    evidenceSufficiency: 'SUFFICIENT' | 'INSUFFICIENT' | 'UNKNOWN';
  }>;
  openQuestions: string[];
}

// ---------------------------------------------------------------------------
// Case events — immutable audit timeline
// ---------------------------------------------------------------------------

export const CASE_EVENT_TYPES = [
  'ADMISSION_RECEIVED',
  'PATIENT_IDENTIFIED',
  'PATIENT_NOT_FOUND',
  'POLICY_RETRIEVED',
  'POLICY_VALIDATED',
  'HISTORY_RETRIEVED',
  'AI_ANALYSIS_STARTED',
  'AI_ANALYSIS_COMPLETED',
  'AI_ANALYSIS_FAILED',
  'SAFETY_GATE_APPLIED',
  'CASE_CLASSIFIED',
  'HOSPITAL_NOTIFIED',
  'INSURER_NOTIFIED',
  'NOTIFICATION_FAILED',
  'NEW_EVIDENCE_RECEIVED',
  'REASSESSMENT_STARTED',
  'DECISION_UPDATED',
  'CASE_RESOLVED',
] as const;

export type CaseEventType = (typeof CASE_EVENT_TYPES)[number];

export type EventActor = 'SYSTEM' | 'HOSPITAL' | 'INSURER' | 'AI_AGENT' | 'SAFETY_GATE' | 'DEMO_RUNNER';

export interface CaseEvent {
  id: string;
  caseId: string;
  /** Monotonic per case. Ordering key for the timeline. */
  seq: number;
  type: CaseEventType;
  actor: EventActor;
  statusBefore: CaseStatus | null;
  statusAfter: CaseStatus | null;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Notifications — hospital admissions + insurer case manager, simultaneously
// ---------------------------------------------------------------------------

export type NotificationChannel = 'HOSPITAL_ADMISSIONS' | 'INSURER_CASE_MANAGER';

export interface Notification {
  id: string;
  caseId: string;
  channel: NotificationChannel;
  recipient: string;
  subject: string;
  body: string;
  status: 'SENT' | 'FAILED';
  createdAt: string;
}

// ---------------------------------------------------------------------------
// AI interaction log — feeds docs/AI_USAGE_LOG.md and the deliverable PDF
// ---------------------------------------------------------------------------

export interface AiInteraction {
  id: string;
  caseId: string | null;
  provider: string;
  model: string;
  valid: boolean;
  latencyMs: number;
  error: string | null;
  rawResponse: string | null;
  createdAt: string;
}
