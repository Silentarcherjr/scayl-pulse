import { buildSyntheticDataset } from '@/data/synthetic/reference-data';
import { newCaseNumber, newId, nowIso } from '@/lib/ids';
import type { CaseStatus } from '@/core/domain/case-status';
import type {
  AgentDecision,
  AiInteraction,
  CaseEvent,
  CaseEvidence,
  EmergencyCase,
  Hospital,
  MedicalHistoryEntry,
  Notification,
  Patient,
  Policy,
} from '@/core/domain/types';
import type {
  AddEvidenceInput,
  AppendEventInput,
  CaseRepository,
  RecordNotificationInput,
} from './case-repository';

interface Store {
  hospitals: Hospital[];
  patients: Patient[];
  policies: Policy[];
  medicalHistory: MedicalHistoryEntry[];
  cases: Map<string, EmergencyCase>;
  events: Map<string, CaseEvent[]>;
  evidence: Map<string, CaseEvidence[]>;
  notifications: Map<string, Notification[]>;
  aiInteractions: Map<string, AiInteraction[]>;
}

function emptyStore(now?: Date): Store {
  const dataset = buildSyntheticDataset(now);
  return {
    ...dataset,
    cases: new Map(),
    events: new Map(),
    evidence: new Map(),
    notifications: new Map(),
    aiInteractions: new Map(),
  };
}

/** Deep-freezes returned records so callers cannot mutate stored state. */
function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * In-memory implementation used when Supabase is not configured (and in every
 * test). Keeps the demo runnable with zero credentials — see DEC-005.
 */
export class InMemoryCaseRepository implements CaseRepository {
  readonly kind = 'in-memory' as const;
  private store: Store;

  constructor(now?: Date) {
    this.store = emptyStore(now);
  }

  /** Test helper: wipe cases/events/evidence but keep reference data. */
  reset(now?: Date) {
    this.store = emptyStore(now);
  }

  // Reference data ----------------------------------------------------------
  async findHospitalByCode(code: string) {
    return clone(this.store.hospitals.find((h) => h.code === code) ?? null);
  }
  async findPatientByNationalId(nationalId: string) {
    return clone(this.store.patients.find((p) => p.nationalId === nationalId) ?? null);
  }
  async findPolicyByNumber(policyNumber: string) {
    return clone(this.store.policies.find((p) => p.policyNumber === policyNumber) ?? null);
  }
  async findPoliciesByPatientId(patientId: string) {
    return clone(this.store.policies.filter((p) => p.patientId === patientId));
  }
  async listMedicalHistory(patientId: string) {
    return clone(this.store.medicalHistory.filter((m) => m.patientId === patientId));
  }

  // Cases -------------------------------------------------------------------
  async createCase(input: {
    admission: EmergencyCase['admission'];
    hospitalId: string | null;
    patientId: string | null;
    policyId: string | null;
    scenarioId: string | null;
  }): Promise<EmergencyCase> {
    const at = nowIso();
    const record: EmergencyCase = {
      id: newId(),
      caseNumber: newCaseNumber(),
      status: 'ADMITTED',
      hospitalId: input.hospitalId,
      patientId: input.patientId,
      policyId: input.policyId,
      admission: clone(input.admission),
      currentDecision: null,
      scenarioId: input.scenarioId,
      createdAt: at,
      updatedAt: at,
    };
    this.store.cases.set(record.id, record);
    this.store.events.set(record.id, []);
    this.store.evidence.set(record.id, []);
    this.store.notifications.set(record.id, []);
    this.store.aiInteractions.set(record.id, []);
    return clone(record);
  }

  async getCase(caseId: string) {
    return clone(this.store.cases.get(caseId) ?? null);
  }

  async listCases(limit = 50) {
    return clone(
      [...this.store.cases.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit),
    );
  }

  private mustGet(caseId: string): EmergencyCase {
    const found = this.store.cases.get(caseId);
    if (!found) throw new Error(`Case not found: ${caseId}`);
    return found;
  }

  async updateCaseStatus(caseId: string, status: CaseStatus) {
    const record = this.mustGet(caseId);
    const updated: EmergencyCase = { ...record, status, updatedAt: nowIso() };
    this.store.cases.set(caseId, updated);
    return clone(updated);
  }

  async updateCaseDecision(caseId: string, status: CaseStatus, decision: AgentDecision) {
    const record = this.mustGet(caseId);
    const updated: EmergencyCase = {
      ...record,
      status,
      currentDecision: clone(decision),
      updatedAt: nowIso(),
    };
    this.store.cases.set(caseId, updated);
    return clone(updated);
  }

  // Timeline ----------------------------------------------------------------
  async appendEvent(input: AppendEventInput): Promise<CaseEvent> {
    this.mustGet(input.caseId);
    const existing = this.store.events.get(input.caseId) ?? [];
    const event: CaseEvent = {
      id: newId(),
      caseId: input.caseId,
      seq: existing.length + 1,
      type: input.type,
      actor: input.actor,
      statusBefore: input.statusBefore,
      statusAfter: input.statusAfter,
      message: input.message,
      payload: clone(input.payload ?? {}),
      createdAt: nowIso(),
    };
    // Append-only: previous entries are never touched.
    this.store.events.set(input.caseId, [...existing, event]);
    return clone(event);
  }

  async listEvents(caseId: string) {
    return clone([...(this.store.events.get(caseId) ?? [])].sort((a, b) => a.seq - b.seq));
  }

  // Evidence ----------------------------------------------------------------
  async addEvidence(input: AddEvidenceInput): Promise<CaseEvidence> {
    this.mustGet(input.caseId);
    const record: CaseEvidence = {
      id: newId(),
      caseId: input.caseId,
      documentType: input.documentType,
      title: input.title,
      content: input.content,
      submittedBy: input.submittedBy,
      metadata: clone(input.metadata ?? {}),
      createdAt: nowIso(),
    };
    const existing = this.store.evidence.get(input.caseId) ?? [];
    this.store.evidence.set(input.caseId, [...existing, record]);
    return clone(record);
  }

  async listEvidence(caseId: string) {
    return clone(this.store.evidence.get(caseId) ?? []);
  }

  // Notifications -----------------------------------------------------------
  async recordNotification(input: RecordNotificationInput): Promise<Notification> {
    this.mustGet(input.caseId);
    const record: Notification = { id: newId(), createdAt: nowIso(), ...input };
    const existing = this.store.notifications.get(input.caseId) ?? [];
    this.store.notifications.set(input.caseId, [...existing, record]);
    return clone(record);
  }

  async listNotifications(caseId: string) {
    return clone(this.store.notifications.get(caseId) ?? []);
  }

  // AI audit ----------------------------------------------------------------
  async recordAiInteraction(input: Omit<AiInteraction, 'id' | 'createdAt'>): Promise<AiInteraction> {
    const record: AiInteraction = { id: newId(), createdAt: nowIso(), ...input };
    const key = input.caseId ?? '__global__';
    const existing = this.store.aiInteractions.get(key) ?? [];
    this.store.aiInteractions.set(key, [...existing, record]);
    return clone(record);
  }

  async listAiInteractions(caseId: string) {
    return clone(this.store.aiInteractions.get(caseId) ?? []);
  }
}
