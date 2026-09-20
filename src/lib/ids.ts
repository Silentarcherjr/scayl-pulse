import { randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

/** Human-readable case reference shown to hospital and insurer staff. */
export function newCaseNumber(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const suffix = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `PULSE-${y}-${suffix}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
