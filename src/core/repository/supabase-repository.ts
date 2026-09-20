import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server-client';
import { newCaseNumber } from '@/lib/ids';
import type { CaseStatus } from '@/core/domain/case-status';
import type {
  AdmissionInput,
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

/* eslint-disable @typescript-eslint/no-explicit-any */

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Supabase ${what} failed: ${result.error.message}`);
  if (result.data === null) throw new Error(`Supabase ${what} returned no data`);
  return result.data;
}

const toHospital = (r: any): Hospital => ({
  id: r.id,
  code: r.code,
  name: r.name,
  networkStatus: r.network_status,
  admissionsContact: r.admissions_contact,
});

const toPatient = (r: any): Patient => ({
  id: r.id,
  nationalId: r.national_id,
  fullName: r.full_name,
  birthDate: r.birth_date,
});

const toPolicy = (r: any): Policy => ({
  id: r.id,
  policyNumber: r.policy_number,
  patientId: r.patient_id,
  insurer: r.insurer,
  planCode: r.plan_code,
  status: r.status,
  effectiveFrom: r.effective_from,
  effectiveTo: r.effective_to,
  waitingPeriodDays: r.waiting_period_days,
  emergencyCoverage: r.emergency_coverage,
  caseManagerContact: r.case_manager_contact,
  exclusions: r.exclusions ?? [],
});

const toHistory = (r: any): MedicalHistoryEntry => ({
  id: r.id,
  patientId: r.patient_id,
  conditionCode: r.condition_code,
  conditionLabel: r.condition_label,
  diagnosedAt: r.diagnosed_at,
  source: r.source,
  notes: r.notes ?? undefined,
});

const toCase = (r: any): EmergencyCase => ({
  id: r.id,
  caseNumber: r.case_number,
  status: r.status,
  hospitalId: r.hospital_id,
  patientId: r.patient_id,
  policyId: r.policy_id,
  admission: r.admission as AdmissionInput,
  currentDecision: (r.current_decision ?? null) as AgentDecision | null,
  scenarioId: r.scenario_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toEvent = (r: any): CaseEvent => ({
  id: r.id,
  caseId: r.case_id,
  seq: r.seq,
  type: r.type,
  actor: r.actor,
  statusBefore: r.status_before,
  statusAfter: r.status_after,
  message: r.message,
  payload: r.payload ?? {},
  createdAt: r.created_at,
});

const toEvidence = (r: any): CaseEvidence => ({
  id: r.id,
  caseId: r.case_id,
  documentType: r.document_type,
  title: r.title,
  content: r.content,
  submittedBy: r.submitted_by,
  metadata: r.metadata ?? {},
  createdAt: r.created_at,
});

const toNotification = (r: any): Notification => ({
  id: r.id,
  caseId: r.case_id,
  channel: r.channel,
  recipient: r.recipient,
  subject: r.subject,
  body: r.body,
  status: r.status,
  createdAt: r.created_at,
});

const toAiInteraction = (r: any): AiInteraction => ({
  id: r.id,
  caseId: r.case_id,
  provider: r.provider,
  model: r.model,
  valid: r.valid,
  latencyMs: r.latency_ms,
  error: r.error,
  rawResponse: r.raw_response,
  createdAt: r.created_at,
});

/**
 * Supabase-backed repository — the source of truth in every deployed
 * environment (docs/DECISIONS.md DEC-001).
 *
 * Event sequence numbers are assigned by the database (see the
 * `case_events_assign_seq` trigger in supabase/migrations), so concurrent
 * appends cannot collide.
 */
export class SupabaseCaseRepository implements CaseRepository {
  readonly kind = 'supabase' as const;
  private readonly db: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.db = client ?? getSupabaseServerClient();
  }

  // Reference data ----------------------------------------------------------
  async findHospitalByCode(code: string) {
    const { data, error } = await this.db.from('hospitals').select('*').eq('code', code).maybeSingle();
    if (error) throw new Error(`Supabase findHospitalByCode failed: ${error.message}`);
    return data ? toHospital(data) : null;
  }

  async findPatientByNationalId(nationalId: string) {
    const { data, error } = await this.db
      .from('patients')
      .select('*')
      .eq('national_id', nationalId)
      .maybeSingle();
    if (error) throw new Error(`Supabase findPatientByNationalId failed: ${error.message}`);
    return data ? toPatient(data) : null;
  }

  async findPolicyByNumber(policyNumber: string) {
    const { data, error } = await this.db
      .from('policies')
      .select('*')
      .eq('policy_number', policyNumber)
      .maybeSingle();
    if (error) throw new Error(`Supabase findPolicyByNumber failed: ${error.message}`);
    return data ? toPolicy(data) : null;
  }

  async findPoliciesByPatientId(patientId: string) {
    const { data, error } = await this.db.from('policies').select('*').eq('patient_id', patientId);
    if (error) throw new Error(`Supabase findPoliciesByPatientId failed: ${error.message}`);
    return (data ?? []).map(toPolicy);
  }

  async listMedicalHistory(patientId: string) {
    const { data, error } = await this.db
      .from('medical_history')
      .select('*')
      .eq('patient_id', patientId)
      .order('diagnosed_at', { ascending: true });
    if (error) throw new Error(`Supabase listMedicalHistory failed: ${error.message}`);
    return (data ?? []).map(toHistory);
  }

  // Cases -------------------------------------------------------------------
  async createCase(input: {
    admission: AdmissionInput;
    hospitalId: string | null;
    patientId: string | null;
    policyId: string | null;
    scenarioId: string | null;
  }) {
    const result = await this.db
      .from('cases')
      .insert({
        case_number: newCaseNumber(),
        status: 'ADMITTED' satisfies CaseStatus,
        hospital_id: input.hospitalId,
        patient_id: input.patientId,
        policy_id: input.policyId,
        admission: input.admission,
        scenario_id: input.scenarioId,
      })
      .select('*')
      .single();
    return toCase(unwrap(result, 'createCase'));
  }

  async getCase(caseId: string) {
    const { data, error } = await this.db.from('cases').select('*').eq('id', caseId).maybeSingle();
    if (error) throw new Error(`Supabase getCase failed: ${error.message}`);
    return data ? toCase(data) : null;
  }

  async listCases(limit = 50) {
    const { data, error } = await this.db
      .from('cases')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Supabase listCases failed: ${error.message}`);
    return (data ?? []).map(toCase);
  }

  async countCases() {
    const { count, error } = await this.db.from('cases').select('*', { count: 'exact', head: true });
    if (error) throw new Error(`Supabase countCases failed: ${error.message}`);
    return count ?? 0;
  }

  async updateCaseStatus(caseId: string, status: CaseStatus) {
    const result = await this.db
      .from('cases')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', caseId)
      .select('*')
      .single();
    return toCase(unwrap(result, 'updateCaseStatus'));
  }

  async updateCaseDecision(caseId: string, status: CaseStatus, decision: AgentDecision) {
    const result = await this.db
      .from('cases')
      .update({ status, current_decision: decision, updated_at: new Date().toISOString() })
      .eq('id', caseId)
      .select('*')
      .single();
    return toCase(unwrap(result, 'updateCaseDecision'));
  }

  // Timeline ----------------------------------------------------------------
  async appendEvent(input: AppendEventInput) {
    const result = await this.db
      .from('case_events')
      .insert({
        case_id: input.caseId,
        type: input.type,
        actor: input.actor,
        status_before: input.statusBefore,
        status_after: input.statusAfter,
        message: input.message,
        payload: input.payload ?? {},
      })
      .select('*')
      .single();
    return toEvent(unwrap(result, 'appendEvent'));
  }

  async listEvents(caseId: string) {
    const { data, error } = await this.db
      .from('case_events')
      .select('*')
      .eq('case_id', caseId)
      .order('seq', { ascending: true });
    if (error) throw new Error(`Supabase listEvents failed: ${error.message}`);
    return (data ?? []).map(toEvent);
  }

  // Evidence ----------------------------------------------------------------
  async addEvidence(input: AddEvidenceInput) {
    const result = await this.db
      .from('case_evidence')
      .insert({
        case_id: input.caseId,
        document_type: input.documentType,
        title: input.title,
        content: input.content,
        submitted_by: input.submittedBy,
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();
    return toEvidence(unwrap(result, 'addEvidence'));
  }

  async listEvidence(caseId: string) {
    const { data, error } = await this.db
      .from('case_evidence')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Supabase listEvidence failed: ${error.message}`);
    return (data ?? []).map(toEvidence);
  }

  // Notifications -----------------------------------------------------------
  async recordNotification(input: RecordNotificationInput) {
    const result = await this.db
      .from('notifications')
      .insert({
        case_id: input.caseId,
        channel: input.channel,
        recipient: input.recipient,
        subject: input.subject,
        body: input.body,
        status: input.status,
      })
      .select('*')
      .single();
    return toNotification(unwrap(result, 'recordNotification'));
  }

  async listNotifications(caseId: string) {
    const { data, error } = await this.db
      .from('notifications')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Supabase listNotifications failed: ${error.message}`);
    return (data ?? []).map(toNotification);
  }

  // AI audit ----------------------------------------------------------------
  async recordAiInteraction(input: Omit<AiInteraction, 'id' | 'createdAt'>) {
    const result = await this.db
      .from('ai_interactions')
      .insert({
        case_id: input.caseId,
        provider: input.provider,
        model: input.model,
        valid: input.valid,
        latency_ms: input.latencyMs,
        error: input.error,
        raw_response: input.rawResponse,
      })
      .select('*')
      .single();
    return toAiInteraction(unwrap(result, 'recordAiInteraction'));
  }

  async listAiInteractions(caseId: string) {
    const { data, error } = await this.db
      .from('ai_interactions')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Supabase listAiInteractions failed: ${error.message}`);
    return (data ?? []).map(toAiInteraction);
  }
}
