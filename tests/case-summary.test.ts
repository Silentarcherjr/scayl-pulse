import { describe, expect, it } from 'vitest';
import { getCaseSummary } from '@/core/summary/case-summary';
import { CaseOrchestrator } from '@/core/orchestrator/case-orchestrator';
import { findScenario } from '@/data/synthetic/scenarios';
import { FailingProvider, newRepository } from './helpers';
import type { AiProvider, AnalyzerResponse } from '@/core/ai/provider';

const red = findScenario('red-human-review')!;
const green = findScenario('green-verified')!;

class SummaryProvider implements AiProvider {
  readonly name = 'google-gemini';
  readonly model = 'test-summary';
  readonly isModelBacked = true;
  calls = 0;

  async analyze(): Promise<AnalyzerResponse> {
    this.calls += 1;
    // Also used as the evidence analyzer in these tests, so it must return
    // something valid for both schemas; the summary parser takes what it needs.
    const payload = {
      headline: 'Caso de prueba',
      whatHappened: 'El hospital registró un ingreso y el sistema lo evaluó.',
      whatChanged: null,
      whatIsNeeded: 'Revisar el antecedente con el asegurado.',
      keyPoints: ['Punto uno', 'Punto dos'],
    };
    return { raw: JSON.stringify(payload), error: null, latencyMs: 10, modelUsed: 'test-summary' };
  }
}

describe('IDEA-003 — resumen para el gestor, bajo demanda', () => {
  it('se genera con el modelo y queda etiquetado como asistido por IA', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });
    const { case: caseRecord } = await orchestrator.processAdmission(red.admission);

    const provider = new SummaryProvider();
    const summary = await getCaseSummary({ repository, caseRecord, provider });

    expect(summary.source).toBe('AI_ASSISTED');
    expect(summary.model).toBe('test-summary');
    expect(summary.headline).toBe('Caso de prueba');
    expect(provider.calls).toBe(1);
  });

  it('se reutiliza sin volver a llamar al modelo mientras la decisión no cambie', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });
    const { case: caseRecord } = await orchestrator.processAdmission(red.admission);

    const provider = new SummaryProvider();
    await getCaseSummary({ repository, caseRecord, provider });
    const second = await getCaseSummary({ repository, caseRecord, provider });

    expect(provider.calls).toBe(1);
    expect(second.headline).toBe('Caso de prueba');
  });

  it('refresh=true fuerza una regeneración', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });
    const { case: caseRecord } = await orchestrator.processAdmission(green.admission);

    const provider = new SummaryProvider();
    await getCaseSummary({ repository, caseRecord, provider });
    await getCaseSummary({ repository, caseRecord, provider, refresh: true });

    expect(provider.calls).toBe(2);
  });

  it('se invalida cuando el caso se reevalúa y la decisión cambia', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });
    const first = await orchestrator.processAdmission(red.admission);

    const provider = new SummaryProvider();
    await getCaseSummary({ repository, caseRecord: first.case, provider });

    const updated = await orchestrator.submitEvidence(first.case.id, red.followUps[0].evidence);
    await getCaseSummary({ repository, caseRecord: updated.case, provider });

    expect(provider.calls).toBe(2);
  });

  it('sin modelo disponible produce un resumen determinístico, marcado como tal', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });
    const { case: caseRecord } = await orchestrator.processAdmission(red.admission);

    const summary = await getCaseSummary({ repository, caseRecord });

    expect(summary.source).toBe('DETERMINISTIC');
    expect(summary.model).toBeNull();
    expect(summary.headline).toContain('HUMAN_REVIEW');
    expect(summary.whatIsNeeded.length).toBeGreaterThan(10);
  });

  it('un fallo del modelo no rompe la petición y se marca AI_UNAVAILABLE', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });
    const { case: caseRecord } = await orchestrator.processAdmission(red.admission);

    const summary = await getCaseSummary({ repository, caseRecord, provider: new FailingProvider() });

    expect(summary.source).toBe('AI_UNAVAILABLE');
    expect(summary.headline.length).toBeGreaterThan(0);
  });

  it('queda registrado en el timeline, que sigue siendo append-only', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });
    const { case: caseRecord } = await orchestrator.processAdmission(red.admission);

    const before = await repository.listEvents(caseRecord.id);
    await getCaseSummary({ repository, caseRecord, provider: new SummaryProvider() });
    const after = await repository.listEvents(caseRecord.id);

    expect(after.length).toBe(before.length + 1);
    expect(after[after.length - 1].type).toBe('CASE_SUMMARY_GENERATED');
    // Previous events are untouched.
    expect(JSON.stringify(after.slice(0, before.length))).toBe(JSON.stringify(before));
  });

  it('el resumen nunca cambia la decisión del caso', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository });
    const { case: caseRecord, decision } = await orchestrator.processAdmission(red.admission);

    await getCaseSummary({ repository, caseRecord, provider: new SummaryProvider() });
    const reloaded = await repository.getCase(caseRecord.id);

    expect(reloaded?.status).toBe(caseRecord.status);
    expect(reloaded?.currentDecision?.status).toBe(decision.status);
    expect(reloaded?.currentDecision?.generatedAt).toBe(decision.generatedAt);
  });
});
