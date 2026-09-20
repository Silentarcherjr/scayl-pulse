import { finding, type Finding } from '@/core/domain/findings';
import type { AdmissionInput, Hospital, Patient, Policy } from '@/core/domain/types';

export interface PolicyValidationResult {
  found: boolean;
  policyNumber: string | null;
  status: Policy['status'] | null;
  /** All of: status ACTIVE, admission date inside the effective window. */
  coverageActiveAtAdmission: boolean;
  expired: boolean;
  notYetEffective: boolean;
  belongsToPatient: boolean;
  emergencyCovered: boolean;
  withinWaitingPeriod: boolean;
  hospitalInNetwork: boolean;
  findings: Finding[];
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  return Math.floor((to - from) / 86_400_000);
}

/**
 * Deterministic policy validation. This function contains no AI and no
 * probability: it answers administrative questions with administrative data.
 */
export function validatePolicy(params: {
  policy: Policy | null;
  patient: Patient | null;
  hospital: Hospital | null;
  admission: AdmissionInput;
  admittedAt: string;
}): PolicyValidationResult {
  const { policy, patient, hospital, admission, admittedAt } = params;
  const findings: Finding[] = [];

  const hospitalInNetwork = hospital?.networkStatus === 'IN_NETWORK';
  if (!hospital) {
    findings.push(
      finding('HOSPITAL_UNKNOWN', 'BLOCKING', `El código de hospital "${admission.hospitalCode}" no existe en la red registrada.`, {
        sourceType: 'ADMISSION',
        sourceId: admission.hospitalCode,
        excerpt: `hospitalCode=${admission.hospitalCode}`,
      }),
    );
  } else if (!hospitalInNetwork) {
    findings.push(
      finding('HOSPITAL_OUT_OF_NETWORK', 'BLOCKING', `${hospital.name} no pertenece a la red del asegurador (${hospital.networkStatus}).`, {
        sourceType: 'ADMISSION',
        sourceId: hospital.code,
        excerpt: `networkStatus=${hospital.networkStatus}`,
      }),
    );
  }

  if (!policy) {
    findings.push(
      finding('POLICY_NOT_FOUND', 'BLOCKING', 'No se encontró una póliza para el asegurado indicado.', {
        sourceType: 'ADMISSION',
        sourceId: admission.policyNumber ?? admission.patientNationalId,
        excerpt: `policyNumber=${admission.policyNumber ?? '(no enviado)'} patientNationalId=${admission.patientNationalId}`,
      }),
    );
    return {
      found: false,
      policyNumber: admission.policyNumber ?? null,
      status: null,
      coverageActiveAtAdmission: false,
      expired: false,
      notYetEffective: false,
      belongsToPatient: false,
      emergencyCovered: false,
      withinWaitingPeriod: false,
      hospitalInNetwork,
      findings,
    };
  }

  const policyRef = { sourceType: 'POLICY' as const, sourceId: policy.policyNumber };
  const belongsToPatient = Boolean(patient && policy.patientId === patient.id);
  if (!belongsToPatient) {
    findings.push(
      finding('POLICY_PATIENT_MISMATCH', 'BLOCKING', 'La póliza indicada no corresponde al asegurado del ingreso.', {
        ...policyRef,
        excerpt: `policy.patientId=${policy.patientId} patient=${patient?.id ?? 'null'}`,
      }),
    );
  }

  const admissionDate = admittedAt.slice(0, 10);
  const expired = admissionDate > policy.effectiveTo;
  const notYetEffective = admissionDate < policy.effectiveFrom;

  if (policy.status !== 'ACTIVE') {
    findings.push(
      finding('POLICY_NOT_ACTIVE', 'BLOCKING', `La póliza ${policy.policyNumber} está en estado ${policy.status}.`, {
        ...policyRef,
        excerpt: `status=${policy.status}`,
      }),
    );
  }
  if (expired) {
    findings.push(
      finding('POLICY_EXPIRED', 'BLOCKING', `La póliza venció el ${policy.effectiveTo} y el ingreso ocurrió el ${admissionDate}.`, {
        ...policyRef,
        excerpt: `effectiveTo=${policy.effectiveTo} admittedAt=${admissionDate}`,
      }),
    );
  }
  if (notYetEffective) {
    findings.push(
      finding('POLICY_NOT_YET_EFFECTIVE', 'BLOCKING', `La póliza inicia vigencia el ${policy.effectiveFrom}, posterior a la fecha de ingreso.`, {
        ...policyRef,
        excerpt: `effectiveFrom=${policy.effectiveFrom} admittedAt=${admissionDate}`,
      }),
    );
  }

  const coverageActiveAtAdmission = policy.status === 'ACTIVE' && !expired && !notYetEffective && belongsToPatient;

  if (!policy.emergencyCoverage) {
    findings.push(
      finding('EMERGENCY_NOT_COVERED', 'BLOCKING', 'El plan contratado no incluye cobertura de emergencias.', {
        ...policyRef,
        excerpt: `emergencyCoverage=false plan=${policy.planCode}`,
      }),
    );
  }

  const elapsed = daysBetween(policy.effectiveFrom, admissionDate);
  const withinWaitingPeriod = elapsed >= 0 && elapsed < policy.waitingPeriodDays;
  if (withinWaitingPeriod) {
    // Emergencies are covered during the waiting period; flag it for the case
    // manager without blocking, because it changes the administrative path.
    findings.push(
      finding(
        'WITHIN_WAITING_PERIOD',
        'WARNING',
        `El ingreso ocurre a ${elapsed} días del inicio de vigencia (período de carencia: ${policy.waitingPeriodDays} días).`,
        { ...policyRef, excerpt: `effectiveFrom=${policy.effectiveFrom} waitingPeriodDays=${policy.waitingPeriodDays}` },
      ),
    );
  }

  if (coverageActiveAtAdmission) {
    findings.push(
      finding('POLICY_ACTIVE', 'INFO', `Póliza ${policy.policyNumber} vigente del ${policy.effectiveFrom} al ${policy.effectiveTo}.`, {
        ...policyRef,
        excerpt: `status=ACTIVE effectiveFrom=${policy.effectiveFrom} effectiveTo=${policy.effectiveTo}`,
      }),
    );
  }

  return {
    found: true,
    policyNumber: policy.policyNumber,
    status: policy.status,
    coverageActiveAtAdmission,
    expired,
    notYetEffective,
    belongsToPatient,
    emergencyCovered: policy.emergencyCoverage,
    withinWaitingPeriod,
    hospitalInNetwork,
    findings,
  };
}
