/**
 * SINGLE SOURCE OF TRUTH for case lifecycle states.
 *
 * Any new state MUST be documented in docs/DECISIONS.md with its rationale
 * before being added here. Frontend, backend and integrations all import
 * from this file — never redeclare these strings anywhere else.
 */

export const CASE_STATUSES = [
  'ADMITTED',
  'CHECKING',
  'VERIFIED',
  'DOCUMENTS_REQUIRED',
  'HUMAN_REVIEW',
  'REASSESSING',
  'RESOLVED',
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

export function isCaseStatus(value: unknown): value is CaseStatus {
  return typeof value === 'string' && (CASE_STATUSES as readonly string[]).includes(value);
}

/**
 * Restrictiveness ranking. The Safety Gate always resolves a conflict in
 * favour of the HIGHER rank, so the LLM can only ever make an outcome more
 * conservative — never more permissive.
 */
const RESTRICTIVENESS: Record<CaseStatus, number> = {
  RESOLVED: 0,
  VERIFIED: 1,
  DOCUMENTS_REQUIRED: 2,
  HUMAN_REVIEW: 3,
  // Transient states never compete in a gate decision; they rank below
  // VERIFIED so that a stale transient value can never win a comparison.
  ADMITTED: -1,
  CHECKING: -1,
  REASSESSING: -1,
};

/** Statuses a case can be left in after a decision. */
export const TERMINAL_DECISION_STATUSES = [
  'VERIFIED',
  'DOCUMENTS_REQUIRED',
  'HUMAN_REVIEW',
] as const satisfies readonly CaseStatus[];

export type DecisionStatus = (typeof TERMINAL_DECISION_STATUSES)[number];

export function isDecisionStatus(value: unknown): value is DecisionStatus {
  return typeof value === 'string' && (TERMINAL_DECISION_STATUSES as readonly string[]).includes(value);
}

/** Returns the most restrictive (most conservative) of the given statuses. */
export function mostRestrictive(...statuses: DecisionStatus[]): DecisionStatus {
  if (statuses.length === 0) {
    throw new Error('mostRestrictive() requires at least one status');
  }
  return statuses.reduce((worst, current) =>
    RESTRICTIVENESS[current] > RESTRICTIVENESS[worst] ? current : worst,
  );
}

/** Transient states: the case is mid-pipeline and no decision is final yet. */
export const TRANSIENT_STATUSES = ['ADMITTED', 'CHECKING', 'REASSESSING'] as const satisfies readonly CaseStatus[];

export function isTransientStatus(status: CaseStatus): boolean {
  return (TRANSIENT_STATUSES as readonly string[]).includes(status);
}

/**
 * Allowed transitions. Enforced by the orchestrator so that an accidental
 * jump (e.g. ADMITTED -> RESOLVED) fails loudly instead of silently
 * corrupting the audit timeline.
 */
export const ALLOWED_TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  ADMITTED: ['CHECKING'],
  CHECKING: ['VERIFIED', 'DOCUMENTS_REQUIRED', 'HUMAN_REVIEW'],
  VERIFIED: ['REASSESSING', 'RESOLVED'],
  DOCUMENTS_REQUIRED: ['REASSESSING', 'RESOLVED', 'HUMAN_REVIEW'],
  HUMAN_REVIEW: ['REASSESSING', 'RESOLVED', 'VERIFIED', 'DOCUMENTS_REQUIRED'],
  REASSESSING: ['VERIFIED', 'DOCUMENTS_REQUIRED', 'HUMAN_REVIEW'],
  RESOLVED: [],
};

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Human-facing labels (ES) — shared so hospital and insurer views agree. */
export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  ADMITTED: 'Ingreso registrado',
  CHECKING: 'Verificando',
  VERIFIED: 'Cobertura verificada',
  DOCUMENTS_REQUIRED: 'Documentación requerida',
  HUMAN_REVIEW: 'Revisión humana',
  REASSESSING: 'Reevaluando',
  RESOLVED: 'Caso cerrado',
};
