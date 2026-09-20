'use client';

import { useState } from 'react';
import { CASE_STATUS_LABELS } from '@/core/domain/case-status';
import type { AgentDecision } from '@/core/domain/types';

/**
 * Minimal but real demo surface: runs a scenario through the live pipeline and
 * shows the decision the Safety Gate produced.
 *
 * Workstream B owns the full dashboard and is expected to replace this. It
 * exists so the deployed link is never an empty page (see docs/WORKSTREAMS.md).
 */

interface ScenarioSummary {
  id: string;
  code: 'GREEN' | 'YELLOW' | 'RED' | 'EXTRA';
  title: string;
  narrative: string;
  expectedStatus: string;
  followUps: Array<{ id: string; label: string; expectedStatusAfter: string }>;
}

interface RunStep {
  label: string;
  status: AgentDecision['status'];
  expectedStatus: string;
  matchedExpectation: boolean;
  decision: AgentDecision;
}

interface RunResult {
  caseNumber: string;
  caseId: string;
  finalStatus: string;
  matchedExpectation: boolean;
  steps: RunStep[];
}

const CODE_STYLES: Record<ScenarioSummary['code'], string> = {
  GREEN: 'bg-emerald-500',
  YELLOW: 'bg-amber-500',
  RED: 'bg-rose-500',
  EXTRA: 'bg-slate-400',
};

const STATUS_STYLES: Record<string, string> = {
  VERIFIED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30',
  DOCUMENTS_REQUIRED: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30',
  HUMAN_REVIEW: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-500/30',
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
        STATUS_STYLES[status] ?? 'bg-slate-500/15 text-slate-600 ring-slate-500/30'
      }`}
    >
      {status} · {CASE_STATUS_LABELS[status as keyof typeof CASE_STATUS_LABELS] ?? status}
    </span>
  );
}

export function ScenarioRunner({ scenarios }: { scenarios: ScenarioSummary[] }) {
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<{ scenario: ScenarioSummary; run: RunResult } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(scenario: ScenarioSummary) {
    setRunning(scenario.id);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/demo/scenarios/${scenario.id}/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ applyFollowUps: scenario.followUps.length > 0 }),
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.error?.message ?? 'La ejecución falló');
      setResult({ scenario, run: payload.data as RunResult });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            onClick={() => run(scenario)}
            disabled={running !== null}
            className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--accent)] disabled:opacity-60"
          >
            <div className="flex items-center gap-2">
              <span className={`size-2.5 rounded-full ${CODE_STYLES[scenario.code]}`} aria-hidden />
              <span className="text-sm font-semibold">{scenario.title}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{scenario.narrative}</p>
            <p className="mt-3 font-mono text-[11px] text-[var(--muted)]">
              {running === scenario.id ? 'Ejecutando…' : `Esperado: ${scenario.expectedStatus}`}
            </p>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        {error && <p className="text-sm text-rose-500">⚠️ {error}</p>}

        {!error && !result && (
          <p className="text-sm text-[var(--muted)]">
            Elige un escenario. Se ejecuta a través del pipeline real —el mismo orquestador,
            analizador y Safety Gate que atiende un webhook hospitalario—, no de un mock.
          </p>
        )}

        {result && (
          <div className="flex flex-col gap-5">
            <header className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm">{result.run.caseNumber}</span>
              <StatusPill status={result.run.finalStatus} />
              {result.run.matchedExpectation && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  ✓ coincide con lo esperado
                </span>
              )}
            </header>

            {result.run.steps.map((step, index) => (
              <article key={index} className="rounded-lg border border-[var(--border)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{step.label}</h3>
                  <StatusPill status={step.status} />
                </div>

                <p className="mt-3 text-sm leading-relaxed">{step.decision.summary}</p>

                {step.decision.gateOverrode && (
                  <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-300">
                    🛡️ El Safety Gate restringió la propuesta del modelo:{' '}
                    <strong>{step.decision.modelSuggestedStatus}</strong> → <strong>{step.decision.status}</strong>
                  </p>
                )}

                {step.decision.missingDocuments.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {step.decision.missingDocuments.map((doc) => (
                      <li key={doc.documentType} className="text-xs leading-relaxed">
                        <span
                          className={`mr-2 font-mono font-semibold ${
                            doc.severity === 'BLOCKING' ? 'text-rose-500' : 'text-[var(--muted)]'
                          }`}
                        >
                          {doc.documentType}
                          {doc.severity === 'BLOCKING' ? ' (obligatorio)' : ' (recomendado)'}
                        </span>
                        <span className="text-[var(--muted)]">{doc.reason}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-relaxed text-[var(--muted)]">
                  {step.decision.reason}
                </pre>

                <footer className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-[var(--muted)]">
                  <span>confianza {(step.decision.confidence * 100).toFixed(0)}%</span>
                  <span>origen {step.decision.source}</span>
                  {step.decision.appliedRules.length > 0 && (
                    <span>reglas {step.decision.appliedRules.join(', ')}</span>
                  )}
                </footer>
              </article>
            ))}

            <a
              href={`/api/cases/${result.run.caseId}/events`}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-[var(--accent)] underline-offset-4 hover:underline"
            >
              Ver el timeline completo del caso →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
