import type { DecisionStatus } from '@/core/domain/case-status';

/**
 * Catalogue of deterministic rules. Each entry declares the WORST status the
 * case can be left in when the rule fires. The Safety Gate never invents a
 * floor that is not listed here, and the model can never remove one.
 *
 * Adding or changing a row is an architectural change → docs/DECISIONS.md.
 */
export interface SafetyRule {
  code: string;
  /** Floor imposed when the rule fires. */
  floor: DecisionStatus;
  description: string;
}

export const SAFETY_RULES: SafetyRule[] = [
  { code: 'POLICY_NOT_FOUND', floor: 'HUMAN_REVIEW', description: 'No existe póliza para el asegurado del ingreso.' },
  { code: 'POLICY_NOT_ACTIVE', floor: 'HUMAN_REVIEW', description: 'La póliza no está en estado ACTIVE.' },
  { code: 'POLICY_EXPIRED', floor: 'HUMAN_REVIEW', description: 'La póliza estaba vencida en la fecha del ingreso. Nunca puede resultar en VERIFIED.' },
  { code: 'POLICY_NOT_YET_EFFECTIVE', floor: 'HUMAN_REVIEW', description: 'El ingreso es anterior al inicio de vigencia.' },
  { code: 'POLICY_PATIENT_MISMATCH', floor: 'HUMAN_REVIEW', description: 'La póliza no pertenece al asegurado del ingreso.' },
  { code: 'EMERGENCY_NOT_COVERED', floor: 'HUMAN_REVIEW', description: 'El plan no cubre emergencias.' },
  { code: 'HOSPITAL_UNKNOWN', floor: 'HUMAN_REVIEW', description: 'El hospital emisor del webhook no está registrado.' },
  { code: 'HOSPITAL_OUT_OF_NETWORK', floor: 'HUMAN_REVIEW', description: 'El hospital está fuera de la red del asegurador.' },
  { code: 'PRE_EXISTING_UNRESOLVED', floor: 'HUMAN_REVIEW', description: 'Antecedente potencialmente relacionado y anterior a la póliza, sin evidencia que lo aclare.' },
  { code: 'REQUIRED_DOCUMENTS_MISSING', floor: 'DOCUMENTS_REQUIRED', description: 'Falta al menos un documento obligatorio.' },
  { code: 'LOW_CONFIDENCE', floor: 'HUMAN_REVIEW', description: 'La confianza del análisis está por debajo del umbral operativo.' },
  { code: 'AI_OUTPUT_INVALID', floor: 'HUMAN_REVIEW', description: 'La salida del modelo no cumplió el esquema y el caso no era resoluble solo con reglas.' },
];

export const SAFETY_RULES_BY_CODE = new Map(SAFETY_RULES.map((r) => [r.code, r]));

/** Below this, an AI-assisted decision is escalated to a human. */
export const CONFIDENCE_THRESHOLD = 0.7;

/** Confidence assigned when the outcome comes purely from deterministic rules. */
export const DETERMINISTIC_CONFIDENCE = 0.95;
