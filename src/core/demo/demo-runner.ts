import { DEMO_SCENARIOS, findScenario, type DemoScenario } from '@/data/synthetic/scenarios';
import { ANALYZER_TIMEOUT_MS } from '@/core/ai/evidence-analyzer';
import { CaseOrchestrator, type OrchestratorOptions } from '@/core/orchestrator/case-orchestrator';
import { ApiError } from '@/lib/http';
import type { AgentDecision, EmergencyCase } from '@/core/domain/types';

/** Leaves headroom under the route's 60 s function limit. */
const SCENARIO_BUDGET_MS = 45_000;

export interface ScenarioStep {
  label: string;
  status: AgentDecision['status'];
  expectedStatus: AgentDecision['status'];
  matchedExpectation: boolean;
  decision: AgentDecision;
}

export interface ScenarioRunResult {
  scenarioId: string;
  code: DemoScenario['code'];
  caseId: string;
  caseNumber: string;
  finalStatus: AgentDecision['status'];
  expectedStatus: AgentDecision['status'];
  matchedExpectation: boolean;
  steps: ScenarioStep[];
  case: EmergencyCase;
}

/** Public scenario catalogue for GET /api/demo/scenarios. */
export function listScenarios() {
  return DEMO_SCENARIOS.map((s) => ({
    id: s.id,
    code: s.code,
    title: s.title,
    narrative: s.narrative,
    expectedStatus: s.expectedStatus,
    expectedRequiresHuman: s.expectedRequiresHuman,
    admissionSummary: {
      hospitalCode: s.admission.hospitalCode,
      patientNationalId: s.admission.patientNationalId,
      policyNumber: s.admission.policyNumber ?? null,
      admissionReason: s.admission.admissionReason,
      triageLevel: s.admission.triageLevel,
      estimatedCost: s.admission.estimatedCost ?? null,
      attachedDocumentTypes: (s.admission.attachedDocuments ?? []).map((d) => d.documentType),
    },
    followUps: s.followUps.map((f) => ({
      id: f.id,
      label: f.label,
      description: f.description,
      documentType: f.evidence.documentType,
      expectedStatusAfter: f.expectedStatusAfter,
    })),
  }));
}

/**
 * Runs a scenario end-to-end through the real pipeline.
 *
 * This is NOT a mock: the admission goes through the same orchestrator, the
 * same analyzer and the same Safety Gate as a hospital webhook would.
 */
export async function runScenario(
  scenarioId: string,
  options: OrchestratorOptions & { applyFollowUps?: boolean } = {},
): Promise<ScenarioRunResult> {
  const scenario = findScenario(scenarioId);
  if (!scenario) throw ApiError.notFound(`Scenario ${scenarioId} not found`);

  // A scenario with follow-ups runs the pipeline once per step, each with its
  // own model call, inside a single HTTP request. Share the budget so the
  // last step is not starved by the first.
  const stepCount = options.applyFollowUps ? 1 + scenario.followUps.length : 1;
  const orchestrator = new CaseOrchestrator({
    ...options,
    analyzerTimeoutMs:
      options.analyzerTimeoutMs ??
      Math.min(ANALYZER_TIMEOUT_MS, Math.floor(SCENARIO_BUDGET_MS / stepCount)),
  });
  const initial = await orchestrator.processAdmission(scenario.admission);

  const steps: ScenarioStep[] = [
    {
      label: 'Ingreso inicial',
      status: initial.decision.status,
      expectedStatus: scenario.expectedStatus,
      matchedExpectation: initial.decision.status === scenario.expectedStatus,
      decision: initial.decision,
    },
  ];

  let current = initial.case;
  if (options.applyFollowUps) {
    for (const followUp of scenario.followUps) {
      const result = await orchestrator.submitEvidence(current.id, followUp.evidence);
      current = result.case;
      steps.push({
        label: followUp.label,
        status: result.decision.status,
        expectedStatus: followUp.expectedStatusAfter,
        matchedExpectation: result.decision.status === followUp.expectedStatusAfter,
        decision: result.decision,
      });
    }
  }

  const last = steps[steps.length - 1];
  return {
    scenarioId: scenario.id,
    code: scenario.code,
    caseId: current.id,
    caseNumber: current.caseNumber,
    finalStatus: last.status,
    expectedStatus: last.expectedStatus,
    matchedExpectation: steps.every((s) => s.matchedExpectation),
    steps,
    case: current,
  };
}
