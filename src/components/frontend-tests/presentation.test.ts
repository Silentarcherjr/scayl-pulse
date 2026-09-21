import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AgentDecision, CaseEvent } from '@/core/domain/types';
import { DecisionPanel } from '../DecisionPanel';
import { CaseTimeline } from '../CaseDetail';

const decision: AgentDecision = {
  status: 'HUMAN_REVIEW',
  confidence: 0.5,
  summary: 'Se necesita revisión de evidencia sintética.',
  reason: 'Conflicto documental.\nNo se ha aclarado la relación.',
  evidence: [
    { sourceType: 'DOCUMENT', sourceId: 'synthetic-1', excerpt: 'Evidencia sintética citada.' },
  ],
  missingDocuments: [
    { documentType: 'MEDICAL_REPORT', severity: 'BLOCKING', reason: 'Informe obligatorio.' },
    { documentType: 'LAB_RESULT', severity: 'ADVISORY', reason: 'Información complementaria.' },
  ],
  recommendedAction: 'Solicitar revisión humana.',
  requiresHuman: true,
  generatedAt: new Date().toISOString(),
  source: 'AI_UNAVAILABLE',
  appliedRules: ['EVIDENCE_SUFFICIENCY'],
  gateOverrode: true,
  modelSuggestedStatus: 'VERIFIED',
  checks: [
    {
      code: 'POLICY_ACTIVE',
      label: 'Póliza vigente',
      status: 'PASSED',
      detail: 'Vigencia comprobada.',
    },
    {
      code: 'EVIDENCE_SUFFICIENCY',
      label: 'Evidencia insuficiente',
      status: 'FAILED',
      detail: 'Falta aclaración.',
      imposedFloor: 'HUMAN_REVIEW',
    },
  ],
};

describe('Frontend: decisiones auditables', () => {
  it('distingue IA no disponible, corrección del Gate y documentos obligatorios/recomendados', () => {
    const html = renderToStaticMarkup(createElement(DecisionPanel, { decision }));
    expect(html).toContain('IA no disponible · decisión basada en reglas');
    expect(html).toContain('El Safety Gate corrigió al modelo');
    expect(html).toContain('Obligatorio · bloquea la verificación');
    expect(html).toContain('Recomendado · no bloquea');
    expect(html).toContain('La atención de emergencia no se detiene');
    expect(html).toContain('Motivo e incertidumbre');
    expect(html).toContain('Evidencia sintética citada.');
    expect(html).toContain('Solicitar revisión humana.');
    expect(html).toContain('class="multiline"');
    expect(html.indexOf('Póliza vigente')).toBeLessThan(html.indexOf('Evidencia insuficiente'));
    expect(html).toContain('✓ Cumple');
  });
  it('no atribuye el modo determinístico a un modelo', () => {
    const html = renderToStaticMarkup(
      createElement(DecisionPanel, {
        decision: { ...decision, source: 'DETERMINISTIC', gateOverrode: false },
      }),
    );
    expect(html).toContain('Modo determinístico · sin proveedor de IA');
    expect(html).not.toContain('El Safety Gate corrigió al modelo');
    expect(html).not.toContain('Análisis con IA');
  });
  it('ordena por seq aun con horas invertidas y conserva la decisión superada', () => {
    const now = Date.now();
    const event = (seq: number, time: number): CaseEvent => ({
      id: `event-${seq}`,
      caseId: 'synthetic-case',
      seq,
      createdAt: new Date(time).toISOString(),
      type: 'CASE_CLASSIFIED',
      actor: 'SYSTEM',
      statusBefore: null,
      statusAfter: decision.status,
      message: `evento-secuencia-${seq}`,
      payload: {},
    });
    const events = [event(2, now - 10000), event(1, now)];
    const html = renderToStaticMarkup(
      createElement(CaseTimeline, {
        events,
        history: [{ seq: 1, at: decision.generatedAt, type: 'CASE_CLASSIFIED', decision }],
      }),
    );
    expect(html.indexOf('evento-secuencia-1')).toBeLessThan(html.indexOf('evento-secuencia-2'));
    expect(html).toContain('Decisión anterior conservada');
    expect(html).toContain(decision.summary);
    expect(events.map((item) => item.seq)).toEqual([2, 1]);
  });
});
