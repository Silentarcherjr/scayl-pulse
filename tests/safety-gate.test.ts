import { describe, expect, it } from 'vitest';
import { runScenario } from '@/core/demo/demo-runner';
import { CaseOrchestrator } from '@/core/orchestrator/case-orchestrator';
import { DEMO_SCENARIOS, findScenario } from '@/data/synthetic/scenarios';
import { mostRestrictive } from '@/core/domain/case-status';
import {
  FailingProvider,
  MalformedProvider,
  OverlyPermissiveProvider,
  ThrowingProvider,
  newRepository,
} from './helpers';

const green = findScenario('green-verified')!;
const red = findScenario('red-human-review')!;
const expired = findScenario('extra-expired-policy')!;
const yellow = findScenario('yellow-documents-required')!;

describe('Safety Gate — reglas determinísticas por encima del modelo', () => {
  it('una póliza vencida NUNCA produce VERIFIED, ni aunque el modelo lo proponga', async () => {
    const orchestrator = new CaseOrchestrator({
      repository: newRepository(),
      aiProvider: new OverlyPermissiveProvider(),
    });

    const result = await orchestrator.processAdmission(expired.admission);

    expect(result.decision.status).toBe('HUMAN_REVIEW');
    expect(result.decision.status).not.toBe('VERIFIED');
    expect(result.decision.modelSuggestedStatus).toBe('VERIFIED');
    expect(result.decision.gateOverrode).toBe(true);
    expect(result.decision.appliedRules).toContain('POLICY_EXPIRED');
  });

  it('el LLM no puede saltarse el Safety Gate en un caso con preexistencia sin aclarar', async () => {
    const orchestrator = new CaseOrchestrator({
      repository: newRepository(),
      aiProvider: new OverlyPermissiveProvider(),
    });

    const result = await orchestrator.processAdmission(red.admission);

    expect(result.decision.status).toBe('HUMAN_REVIEW');
    expect(result.decision.requiresHuman).toBe(true);
    expect(result.decision.gateOverrode).toBe(true);
    // The model's reassuring summary must not be what the user sees.
    expect(result.decision.summary).not.toContain('Todo en orden');
  });

  it('descarta las citas de evidencia que el modelo inventa', async () => {
    const orchestrator = new CaseOrchestrator({
      repository: newRepository(),
      aiProvider: new OverlyPermissiveProvider(),
    });

    const result = await orchestrator.processAdmission(green.admission);
    const citedIds = result.decision.evidence.map((e) => e.sourceId);

    expect(citedIds).not.toContain('POL-INEXISTENTE-9999');
    expect(citedIds).not.toContain('mh-no-existe');
  });

  it('confianza por debajo del umbral escala a HUMAN_REVIEW aunque el caso esté limpio', async () => {
    const orchestrator = new CaseOrchestrator({
      repository: newRepository(),
      aiProvider: new OverlyPermissiveProvider(0.4),
    });

    const result = await orchestrator.processAdmission(green.admission);

    expect(result.decision.status).toBe('HUMAN_REVIEW');
    expect(result.decision.appliedRules).toContain('LOW_CONFIDENCE');
  });

  it('el modelo SÍ puede endurecer el resultado (nunca ampliarlo)', () => {
    expect(mostRestrictive('VERIFIED', 'HUMAN_REVIEW')).toBe('HUMAN_REVIEW');
    expect(mostRestrictive('HUMAN_REVIEW', 'VERIFIED')).toBe('HUMAN_REVIEW');
    expect(mostRestrictive('VERIFIED', 'DOCUMENTS_REQUIRED')).toBe('DOCUMENTS_REQUIRED');
    expect(mostRestrictive('DOCUMENTS_REQUIRED', 'HUMAN_REVIEW')).toBe('HUMAN_REVIEW');
  });

  it('los documentos obligatorios los decide la regla, no el modelo', async () => {
    const orchestrator = new CaseOrchestrator({
      repository: newRepository(),
      aiProvider: new OverlyPermissiveProvider(),
    });

    const result = await orchestrator.processAdmission(yellow.admission);

    expect(result.decision.status).toBe('DOCUMENTS_REQUIRED');
    // The model said nothing was missing; the ruleset still blocks the case.
    expect(result.decision.missingDocuments.filter((m) => m.severity === 'BLOCKING').length).toBeGreaterThan(0);
  });
});

describe('Resiliencia del proveedor de IA', () => {
  it('una respuesta malformada de Gemini no rompe el caso y se resuelve con reglas', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository, aiProvider: new MalformedProvider() });

    const result = await orchestrator.processAdmission(green.admission);

    expect(result.decision.status).toBe('VERIFIED');
    const events = await repository.listEvents(result.case.id);
    // The failed model attempt is recorded, then the fallback succeeds.
    expect(events.some((e) => e.type === 'AI_ANALYSIS_COMPLETED')).toBe(true);
    const interactions = await repository.listAiInteractions(result.case.id);
    expect(interactions.some((i) => i.provider === 'google-gemini' && !i.valid)).toBe(true);
    expect(interactions.some((i) => i.provider === 'deterministic-fallback' && i.valid)).toBe(true);
  });

  it('un JSON no parseable tampoco rompe el caso', async () => {
    const orchestrator = new CaseOrchestrator({
      repository: newRepository(),
      aiProvider: new MalformedProvider('<html>502 Bad Gateway</html>'),
    });

    const result = await orchestrator.processAdmission(red.admission);
    expect(result.decision.status).toBe('HUMAN_REVIEW');
  });

  it('un timeout o rate limit de Gemini no interrumpe el procesamiento', async () => {
    const repository = newRepository();
    const orchestrator = new CaseOrchestrator({ repository, aiProvider: new FailingProvider() });

    const result = await orchestrator.processAdmission(yellow.admission);

    expect(result.decision.status).toBe('DOCUMENTS_REQUIRED');
    const interactions = await repository.listAiInteractions(result.case.id);
    expect(interactions[0].error).toContain('timed out');
  });

  it('un SDK que lanza excepción no tumba el procesamiento del caso', async () => {
    const orchestrator = new CaseOrchestrator({
      repository: newRepository(),
      aiProvider: new ThrowingProvider(),
    });

    const result = await orchestrator.processAdmission(green.admission);
    expect(result.decision.status).toBe('VERIFIED');
  });

  it('los tres escenarios obligatorios siguen siendo reproducibles sin IA disponible', async () => {
    for (const scenario of DEMO_SCENARIOS) {
      const orchestrator = new CaseOrchestrator({
        repository: newRepository(),
        aiProvider: new FailingProvider(),
      });
      const result = await orchestrator.processAdmission(scenario.admission);
      expect(result.decision.status, `escenario ${scenario.id}`).toBe(scenario.expectedStatus);
    }
  });
});

describe('Garantías de producto', () => {
  it('ninguna decisión afirma haber tomado una decisión médica', async () => {
    const result = await runScenario('red-human-review', { repository: newRepository() });
    const decision = result.steps[0].decision;
    expect(decision.summary.toLowerCase()).not.toContain('diagnóstico de');
    expect(decision.reason).toContain('SCAYL Pulse no emite diagnósticos');
  });
});

describe('Honestidad sobre el origen de la decisión', () => {
  it('sin Gemini configurado, la decisión NO se etiqueta como asistida por IA', async () => {
    // The product promise is that a deterministic fallback is never dressed up
    // as a model call. This is the test that keeps us honest.
    const orchestrator = new CaseOrchestrator({ repository: newRepository() });
    const result = await orchestrator.processAdmission(green.admission);

    expect(result.decision.source).toBe('DETERMINISTIC');
    expect(result.decision.source).not.toBe('AI_ASSISTED');
  });

  it('con el modelo caído, la decisión se marca AI_UNAVAILABLE, no AI_ASSISTED', async () => {
    const orchestrator = new CaseOrchestrator({
      repository: newRepository(),
      aiProvider: new FailingProvider(),
    });
    const result = await orchestrator.processAdmission(green.admission);

    expect(result.decision.source).toBe('AI_UNAVAILABLE');
    expect(result.decision.status).toBe('VERIFIED');
  });

  it('solo una respuesta válida de un modelo real produce AI_ASSISTED', async () => {
    const orchestrator = new CaseOrchestrator({
      repository: newRepository(),
      aiProvider: new OverlyPermissiveProvider(),
    });
    const result = await orchestrator.processAdmission(green.admission);

    expect(result.decision.source).toBe('AI_ASSISTED');
  });

  it('una respuesta malformada del modelo degrada a AI_UNAVAILABLE', async () => {
    const orchestrator = new CaseOrchestrator({
      repository: newRepository(),
      aiProvider: new MalformedProvider(),
    });
    const result = await orchestrator.processAdmission(green.admission);

    expect(result.decision.source).toBe('AI_UNAVAILABLE');
  });
});
