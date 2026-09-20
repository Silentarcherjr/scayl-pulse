/**
 * SYNTHETIC reference data. No real patient, policy or hospital data is ever
 * allowed in this repository (docs/DECISIONS.md DEC-002).
 *
 * Dates are derived from a reference instant so fixtures never go stale:
 * pass a fixed `now` in tests for determinism.
 */
import type { Hospital, MedicalHistoryEntry, Patient, Policy } from '@/core/domain/types';

export function isoDateOffset(now: Date, days: number): string {
  const d = new Date(now.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface SyntheticDataset {
  hospitals: Hospital[];
  patients: Patient[];
  policies: Policy[];
  medicalHistory: MedicalHistoryEntry[];
}

export function buildSyntheticDataset(now: Date = new Date()): SyntheticDataset {
  const day = (n: number) => isoDateOffset(now, n);

  const hospitals: Hospital[] = [
    {
      id: 'hosp-001',
      code: 'HOSP-PTY-01',
      name: 'Hospital Nacional Metropolitano (sintético)',
      networkStatus: 'IN_NETWORK',
      admissionsContact: 'admisiones@hospital-metropolitano.example',
    },
    {
      id: 'hosp-002',
      code: 'HOSP-PTY-02',
      name: 'Clínica San Miguel (sintético)',
      networkStatus: 'IN_NETWORK',
      admissionsContact: 'admisiones@clinica-sanmiguel.example',
    },
    {
      id: 'hosp-099',
      code: 'HOSP-PTY-99',
      name: 'Centro Médico Costa Verde (sintético, fuera de red)',
      networkStatus: 'OUT_OF_NETWORK',
      admissionsContact: 'admisiones@costaverde.example',
    },
  ];

  const patients: Patient[] = [
    { id: 'pat-001', nationalId: '8-888-1111', fullName: 'María Gómez Salazar', birthDate: '1988-04-12' },
    { id: 'pat-002', nationalId: '8-777-2222', fullName: 'Luis Cedeño Ortega', birthDate: '1995-11-03' },
    { id: 'pat-003', nationalId: '8-666-3333', fullName: 'Ana Batista Rivera', birthDate: '1971-02-27' },
    { id: 'pat-004', nationalId: '8-555-4444', fullName: 'Jorge Pinto Delgado', birthDate: '1980-07-19' },
  ];

  const policies: Policy[] = [
    {
      id: 'pol-001',
      policyNumber: 'POL-1001',
      patientId: 'pat-001',
      insurer: 'SCAYL Seguros (sintético)',
      planCode: 'SALUD-PLENA-300',
      status: 'ACTIVE',
      effectiveFrom: day(-400),
      effectiveTo: day(330),
      waitingPeriodDays: 30,
      emergencyCoverage: true,
      caseManagerContact: 'gestor.casos@scayl-seguros.example',
      exclusions: ['Cirugía estética', 'Tratamientos experimentales'],
    },
    {
      id: 'pol-002',
      policyNumber: 'POL-2002',
      patientId: 'pat-002',
      insurer: 'SCAYL Seguros (sintético)',
      planCode: 'SALUD-ESENCIAL-150',
      status: 'ACTIVE',
      effectiveFrom: day(-200),
      effectiveTo: day(165),
      waitingPeriodDays: 30,
      emergencyCoverage: true,
      caseManagerContact: 'gestor.casos@scayl-seguros.example',
      exclusions: ['Cirugía estética'],
    },
    {
      id: 'pol-003',
      policyNumber: 'POL-3003',
      patientId: 'pat-003',
      insurer: 'SCAYL Seguros (sintético)',
      planCode: 'SALUD-PLENA-300',
      status: 'ACTIVE',
      // Policy started AFTER the hypertension diagnosis below — this is what
      // makes the RED scenario a genuine pre-existing-condition question.
      effectiveFrom: day(-90),
      effectiveTo: day(275),
      waitingPeriodDays: 60,
      emergencyCoverage: true,
      caseManagerContact: 'gestor.casos@scayl-seguros.example',
      exclusions: ['Cirugía estética', 'Tratamientos experimentales'],
    },
    {
      id: 'pol-004',
      policyNumber: 'POL-4004',
      patientId: 'pat-004',
      insurer: 'SCAYL Seguros (sintético)',
      planCode: 'SALUD-ESENCIAL-150',
      status: 'EXPIRED',
      effectiveFrom: day(-800),
      effectiveTo: day(-60),
      waitingPeriodDays: 30,
      emergencyCoverage: true,
      caseManagerContact: 'gestor.casos@scayl-seguros.example',
      exclusions: [],
    },
  ];

  const medicalHistory: MedicalHistoryEntry[] = [
    {
      id: 'mh-001',
      patientId: 'pat-001',
      conditionCode: 'Z88.0',
      conditionLabel: 'Alergia a penicilina',
      diagnosedAt: day(-1500),
      source: 'DECLARED',
      notes: 'Declarada en la suscripción de la póliza.',
    },
    {
      id: 'mh-002',
      patientId: 'pat-002',
      conditionCode: 'S82.6',
      conditionLabel: 'Fractura de maléolo lateral (tobillo derecho)',
      diagnosedAt: day(-1800),
      source: 'CLAIM',
      notes: 'Resuelta. Sin secuelas reportadas.',
    },
    {
      id: 'mh-003',
      patientId: 'pat-003',
      conditionCode: 'I10',
      conditionLabel: 'Hipertensión arterial esencial',
      diagnosedAt: day(-420),
      source: 'PROVIDER_RECORD',
      notes: 'Diagnóstico registrado antes del inicio de la póliza vigente.',
    },
    {
      id: 'mh-004',
      patientId: 'pat-003',
      conditionCode: 'E78.5',
      conditionLabel: 'Dislipidemia mixta',
      diagnosedAt: day(-400),
      source: 'PROVIDER_RECORD',
      notes: 'Control con estatinas.',
    },
  ];

  return { hospitals, patients, policies, medicalHistory };
}
