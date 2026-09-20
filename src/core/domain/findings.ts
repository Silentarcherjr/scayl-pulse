import type { EvidenceReference } from './types';

export type FindingSeverity = 'BLOCKING' | 'WARNING' | 'INFO';

/**
 * A single deterministic observation about a case. Findings are the only
 * thing the Safety Gate reasons over — it never reads free text.
 */
export interface Finding {
  /** Stable rule identifier, e.g. POLICY_EXPIRED. Shown in appliedRules. */
  code: string;
  severity: FindingSeverity;
  message: string;
  evidence: EvidenceReference;
}

export function finding(
  code: string,
  severity: FindingSeverity,
  message: string,
  evidence: EvidenceReference,
): Finding {
  return { code, severity, message, evidence };
}
