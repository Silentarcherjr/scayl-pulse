/**
 * Declared clinical-adjacency table.
 *
 * The LLM is NEVER asked to invent whether a prior condition relates to the
 * current admission. The deterministic layer answers that question from this
 * explicit, reviewable table; the model may only add narrative context on top.
 * (docs/DECISIONS.md DEC-004)
 *
 * Synthetic and intentionally small — a production system would source this
 * from the insurer's clinical policy, not from a model.
 */

export interface ClinicalRelation {
  /** Admission reason code (ICD-10-ish) this rule applies to. */
  admissionReasonCode: string;
  /** Prior-condition codes considered potentially related. */
  relatedConditionCodes: string[];
  /** Plain-language rationale shown to the case manager. */
  rationale: string;
}

export const CLINICAL_RELATIONS: ClinicalRelation[] = [
  {
    admissionReasonCode: 'R07.9',
    relatedConditionCodes: ['I10', 'E78.5', 'I20', 'I21', 'I25'],
    rationale:
      'El dolor torácico puede estar relacionado con factores de riesgo cardiovascular previos (hipertensión, dislipidemia, cardiopatía isquémica).',
  },
  {
    admissionReasonCode: 'I21',
    relatedConditionCodes: ['I10', 'E78.5', 'I25', 'E11'],
    rationale: 'El infarto agudo de miocardio se asocia a factores de riesgo cardiovascular previos.',
  },
  {
    admissionReasonCode: 'R10.3',
    relatedConditionCodes: ['K35', 'K36', 'K57'],
    rationale: 'El dolor en fosa ilíaca derecha puede relacionarse con patología apendicular o diverticular previa.',
  },
  {
    admissionReasonCode: 'E11.1',
    relatedConditionCodes: ['E11', 'E78.5'],
    rationale: 'La descompensación diabética se relaciona con diabetes previamente diagnosticada.',
  },
];

/** Strips accents and lowercases, so "Hipertensión" matches "hipertension". */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function relationsFor(admissionReasonCode: string | undefined): ClinicalRelation | undefined {
  if (!admissionReasonCode) return undefined;
  return CLINICAL_RELATIONS.find((r) => r.admissionReasonCode === admissionReasonCode);
}
