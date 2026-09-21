'use client';

import { useState } from 'react';
import type { AgentDecision } from '@/core/domain/types';
import { CASE_STATUS_LABELS } from '@/core/domain/case-status';
import { StatusPill } from './DecisionPanel';
import { errorMessage, postJson, type ScenarioSummary } from './case-api';

interface RunResult {
  caseId: string;
  caseNumber: string;
  finalStatus: AgentDecision['status'];
  matchedExpectation: boolean;
  steps: Array<{ label: string; status: AgentDecision['status']; matchedExpectation: boolean }>;
}

export function ScenarioRunner({
  scenarios,
  onCreated,
}: {
  scenarios: ScenarioSummary[];
  onCreated: (caseId: string) => void;
}) {
  const [running, setRunning] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(scenario: ScenarioSummary) {
    if (running) return;
    setRunning(scenario.id);
    setError(null);
    setResult(null);
    try {
      const data = await postJson<RunResult>(
        `/api/demo/scenarios/${encodeURIComponent(scenario.id)}/run`,
        { applyFollowUps: followUps },
      );
      setResult(data);
      onCreated(data.caseId);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="stack">
      <p className="muted">
        Cada escenario abre un expediente sintético usando el pipeline real. Elige el ingreso
        inicial para aportar evidencia después, o incluye los seguimientos para ver el recorrido
        completo.
      </p>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={followUps}
          disabled={!!running}
          onChange={(event) => setFollowUps(event.target.checked)}
        />
        Incluir evidencia de seguimiento y reevaluaciones
      </label>
      <div className="scenario-grid">
        {scenarios.map((scenario) => (
          <button
            className="scenario-card"
            key={scenario.id}
            onClick={() => run(scenario)}
            disabled={!!running}
          >
            <span className={`scenario-code code-${scenario.code}`}>{scenario.code}</span>
            <h3>{scenario.title}</h3>
            <p>{scenario.narrative}</p>
            <span className="muted">
              Esperado:{' '}
              {
                CASE_STATUS_LABELS[
                  followUps && scenario.followUps.length
                    ? scenario.followUps[scenario.followUps.length - 1].expectedStatusAfter
                    : scenario.expectedStatus
                ]
              }
            </span>
            <strong className="scenario-cta">
              {running === scenario.id ? 'Ejecutando…' : 'Crear expediente →'}
            </strong>
          </button>
        ))}
      </div>
      {running && (
        <p role="status">
          Evaluando el escenario. El recorrido con seguimientos puede tardar hasta un minuto.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div
          className={`notice ${result.matchedExpectation ? 'success' : 'warning'}`}
          role="status"
        >
          <div className="section-heading">
            <strong>{result.caseNumber}</strong>
            <StatusPill status={result.finalStatus} />
          </div>
          <p>
            {result.matchedExpectation
              ? '✓ Todos los pasos coinciden con lo esperado.'
              : 'El resultado difiere de lo esperado. Revisa la decisión y sus comprobaciones.'}
          </p>
          <ol className="scenario-steps">
            {result.steps.map((step, index) => (
              <li key={index}>
                {step.label}: {CASE_STATUS_LABELS[step.status]}{' '}
                {step.matchedExpectation ? '✓' : '⚠'}
              </li>
            ))}
          </ol>
          <button onClick={() => onCreated(result.caseId)}>Abrir expediente y timeline</button>
        </div>
      )}
    </div>
  );
}
