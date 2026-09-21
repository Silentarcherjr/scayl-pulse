import { expect } from 'vitest';
import type { CaseEvent, Notification } from '@/core/domain/types';

export function assertTimeline(events: CaseEvent[], caseId: string) {
  expect(events.length).toBeGreaterThan(0);
  expect(events.map((event) => event.seq)).toEqual(events.map((_, index) => index + 1));
  expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
  expect(events.every((event) => event.caseId === caseId)).toBe(true);
  expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
    'ADMISSION_RECEIVED', 'SAFETY_GATE_APPLIED', 'CASE_CLASSIFIED',
    'HOSPITAL_NOTIFIED', 'INSURER_NOTIFIED',
  ]));
}

export function assertNotifications(notifications: Notification[], caseId: string, evaluations: number) {
  expect(notifications).toHaveLength(evaluations * 2);
  for (const channel of ['HOSPITAL_ADMISSIONS', 'INSURER_CASE_MANAGER']) {
    expect(notifications.filter((item) => item.channel === channel)).toHaveLength(evaluations);
  }
  for (const notification of notifications) {
    expect(notification.caseId).toBe(caseId);
    expect(notification.status).toBe('SENT');
    expect(notification.recipient).toMatch(/\.example$/);
    expect(notification.body).toContain('no emite diagnósticos ni decisiones clínicas');
    expect(notification.body).toContain('no interrumpe la atención de emergencia');
  }
}
