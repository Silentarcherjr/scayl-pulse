import { describe, expect, it } from 'vitest';
import { validatePolicy } from '@/core/policy/policy-service';
import { evaluateDocuments, requiredDocumentsFor } from '@/core/policy/document-requirements';
import { assessHistory } from '@/core/history/history-service';
import { buildSyntheticDataset, isoDateOffset } from '@/data/synthetic/reference-data';
import { ALLOWED_TRANSITIONS, CASE_STATUSES, canTransition } from '@/core/domain/case-status';
import type { AdmissionInput, CaseEvidence } from '@/core/domain/types';

const now = new Date('2026-06-15T12:00:00.000Z');
const data = buildSyntheticDataset(now);
const hospital = data.hospitals[0];
const patient = data.patients[2]; // Ana Batista — RED patient
const policy = data.policies[2];

const admission: AdmissionInput = {
  hospitalCode: hospital.code,
  patientNationalId: patient.nationalId,
  policyNumber: policy.policyNumber,
  admissionReason: 'Dolor torácico opresivo',
  admissionReasonCode: 'R07.9',
  triageLevel: 'RED',
  estimatedCost: 12_400,
};

describe('validatePolicy', () => {
  it('marca POLICY_EXPIRED cuando el ingreso es posterior a la vigencia', () => {
    const expired = data.policies[3];
    const result = validatePolicy({
      policy: expired,
      patient: data.patients[3],
      hospital,
      admission: { ...admission, patientNationalId: data.patients[3].nationalId, policyNumber: expired.policyNumber },
      admittedAt: now.toISOString(),
    });

    expect(result.expired).toBe(true);
    expect(result.coverageActiveAtAdmission).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain('POLICY_EXPIRED');
  });

  it('marca POLICY_PATIENT_MISMATCH si la póliza es de otro asegurado', () => {
    const result = validatePolicy({
      policy,
      patient: data.patients[0],
      hospital,
      admission,
      admittedAt: now.toISOString(),
    });
    expect(result.findings.map((f) => f.code)).toContain('POLICY_PATIENT_MISMATCH');
  });

  it('marca HOSPITAL_OUT_OF_NETWORK sin bloquear la identificación de la póliza', () => {
    const result = validatePolicy({
      policy,
      patient,
      hospital: data.hospitals[2],
      admission,
      admittedAt: now.toISOString(),
    });
    expect(result.hospitalInNetwork).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain('HOSPITAL_OUT_OF_NETWORK');
    expect(result.found).toBe(true);
  });

  it('marca el período de carencia como observación, no como bloqueo', () => {
    const recent = { ...policy, effectiveFrom: isoDateOffset(now, -10), waitingPeriodDays: 60 };
    const result = validatePolicy({ policy: recent, patient, hospital, admission, admittedAt: now.toISOString() });
    const waiting = result.findings.find((f) => f.code === 'WITHIN_WAITING_PERIOD');
    expect(waiting?.severity).toBe('WARNING');
  });
});

describe('requisitos documentales', () => {
  it('exige informe médico y estimado de costos en casos de alto costo', () => {
    const required = requiredDocumentsFor(admission).map((r) => r.documentType);
    expect(required).toContain('MEDICAL_REPORT');
    expect(required).toContain('COST_ESTIMATE');
  });

  it('no exige estimado de costos en casos de bajo costo y triaje no urgente', () => {
    const required = requiredDocumentsFor({ ...admission, triageLevel: 'GREEN', estimatedCost: 400 }).map(
      (r) => r.documentType,
    );
    expect(required).not.toContain('COST_ESTIMATE');
    expect(required).not.toContain('MEDICAL_REPORT');
  });

  it('la nota de triaje es recomendada, nunca bloqueante', () => {
    const result = evaluateDocuments({ ...admission, triageLevel: 'GREEN', estimatedCost: 400 }, []);
    const triage = result.missing.find((m) => m.documentType === 'TRIAGE_NOTE');
    expect(triage?.severity).toBe('ADVISORY');
    expect(result.missing.filter((m) => m.severity === 'BLOCKING').map((m) => m.documentType).sort()).toEqual([
      'ADMISSION_FORM',
      'PATIENT_ID',
    ]);
  });
});

describe('assessHistory', () => {
  const evidence = (overrides: Partial<CaseEvidence> = {}): CaseEvidence => ({
    id: 'ev-1',
    caseId: 'case-1',
    documentType: 'SPECIALIST_REPORT',
    title: 'Informe',
    content: 'Contenido',
    submittedBy: 'test',
    metadata: {},
    createdAt: now.toISOString(),
    ...overrides,
  });

  it('detecta una preexistencia potencial anterior al inicio de la póliza', () => {
    const result = assessHistory({ admission, policy, history: data.medicalHistory, evidence: [] });
    expect(result.hasPotentialPreExistingConflict).toBe(true);
    expect(result.hasUnresolvedPreExistingConflict).toBe(true);
    expect(result.findings.map((f) => f.code)).toContain('PRE_EXISTING_UNRESOLVED');
  });

  it('se resuelve cuando un informe declara explícitamente el código de la condición', () => {
    const result = assessHistory({
      admission,
      policy,
      history: data.medicalHistory,
      evidence: [evidence({ metadata: { addressesConditionCodes: ['I10', 'E78.5'] } })],
    });
    expect(result.hasUnresolvedPreExistingConflict).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain('PRE_EXISTING_ADDRESSED');
  });

  it('reconoce la condición por su nombre aunque venga sin acentos', () => {
    const result = assessHistory({
      admission,
      policy,
      history: data.medicalHistory,
      evidence: [
        evidence({ content: 'Se documenta hipertension arterial esencial declarada en la suscripcion.' }),
        evidence({ id: 'ev-2', content: 'Dislipidemia mixta controlada.' }),
      ],
    });
    expect(result.hasUnresolvedPreExistingConflict).toBe(false);
  });

  it('un documento no resolutivo (p. ej. estimado de costos) no aclara una preexistencia', () => {
    const result = assessHistory({
      admission,
      policy,
      history: data.medicalHistory,
      evidence: [evidence({ documentType: 'COST_ESTIMATE', content: 'Hipertensión arterial esencial' })],
    });
    expect(result.hasUnresolvedPreExistingConflict).toBe(true);
  });

  it('no inventa relaciones para motivos de ingreso sin tabla clínica', () => {
    const result = assessHistory({
      admission: { ...admission, admissionReasonCode: 'S51.8', admissionReason: 'Laceración en antebrazo' },
      policy,
      history: data.medicalHistory,
      evidence: [],
    });
    expect(result.relatedConditions).toHaveLength(0);
    expect(result.hasPotentialPreExistingConflict).toBe(false);
  });
});

describe('máquina de estados', () => {
  it('RESOLVED es terminal', () => {
    expect(ALLOWED_TRANSITIONS.RESOLVED).toHaveLength(0);
    for (const status of CASE_STATUSES) expect(canTransition('RESOLVED', status)).toBe(false);
  });

  it('ADMITTED no puede saltar directamente a una decisión', () => {
    expect(canTransition('ADMITTED', 'VERIFIED')).toBe(false);
    expect(canTransition('ADMITTED', 'CHECKING')).toBe(true);
  });

  it('cualquier decisión puede volver a REASSESSING', () => {
    expect(canTransition('VERIFIED', 'REASSESSING')).toBe(true);
    expect(canTransition('DOCUMENTS_REQUIRED', 'REASSESSING')).toBe(true);
    expect(canTransition('HUMAN_REVIEW', 'REASSESSING')).toBe(true);
  });
});
