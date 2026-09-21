'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { CASE_STATUSES, CASE_STATUS_LABELS, type CaseStatus } from '@/core/domain/case-status';
import { AdmissionForm } from './AdmissionForm';
import { CaseDetail } from './CaseDetail';
import { ScenarioRunner } from './ScenarioRunner';
import { StatusPill } from './DecisionPanel';
import {
  apiRequest,
  dateLabel,
  errorMessage,
  type CaseListItem,
  type HealthData,
  type ScenarioSummary,
} from './case-api';

function subscribeLocation(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}
const selectedCase = () => new URLSearchParams(window.location.search).get('case');

export function PulseDashboard() {
  const [view, setView] = useState<'hospital' | 'insurer'>('hospital');
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const selected = useSyncExternalStore(subscribeLocation, selectedCase, () => null);
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CaseStatus | ''>('');
  const [entry, setEntry] = useState<'scenarios' | 'admission' | null>(null);

  useEffect(() => {
    let disposed = false;
    let running = false;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    async function refresh() {
      if (running) return;
      running = true;
      const results = await Promise.allSettled([
        apiRequest<{ cases: CaseListItem[] }>('/api/cases?limit=200', options),
        apiRequest<HealthData>('/api/health', options),
      ]);
      if (!disposed) {
        if (results[0].status === 'fulfilled') {
          setCases(results[0].value.cases);
          setError(null);
        } else setError(errorMessage(results[0].reason));
        if (results[1].status === 'fulfilled') {
          setHealth(results[1].value);
          setHealthError(null);
        } else setHealthError(errorMessage(results[1].reason));
        setLoading(false);
      }
      running = false;
    }
    void refresh();
    void apiRequest<{ scenarios: ScenarioSummary[] }>('/api/demo/scenarios', options)
      .then((data) => {
        if (!disposed) {
          setScenarios(data.scenarios);
          setCatalogError(null);
        }
      })
      .catch((error) => {
        if (!disposed) setCatalogError(errorMessage(error));
      });
    const timer = setInterval(() => {
      void refresh();
    }, 10000);
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [revision]);

  const openCase = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('case', id);
    window.history.pushState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.setTimeout(
      () =>
        document
          .getElementById('case-detail')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      0,
    );
  }, []);
  const onCreated = (id: string) => {
    openCase(id);
    setRevision((value) => value + 1);
  };
  const visible = cases.filter(
    (item) =>
      (!filter || item.status === filter) &&
      `${item.caseNumber} ${item.hospitalCode} ${item.admissionReason}`
        .toLocaleLowerCase('es')
        .includes(query.toLocaleLowerCase('es')),
  );

  return (
    <div className="pulse-app">
      <a href="#workspace" className="skip-link">
        Ir a los expedientes
      </a>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="SCAYL Pulse, inicio">
          <span className="brand-mark" aria-hidden="true">
            S<span>+</span>
          </span>
          <span>
            SCAYL <strong>Pulse</strong>
            <small>EXPEDIENTE VIVO DE EMERGENCIA</small>
          </span>
        </Link>
        <div className="view-switch" aria-label="Vista de trabajo">
          <button aria-pressed={view === 'hospital'} onClick={() => setView('hospital')}>
            Hospital
          </button>
          <button aria-pressed={view === 'insurer'} onClick={() => setView('insurer')}>
            Aseguradora
          </button>
        </div>
      </header>
      <main className="dashboard-shell">
        <section className="hero">
          <div>
            <p className="eyebrow">
              {view === 'hospital' ? 'Admisiones hospitalarias' : 'Gestión de cobertura'} · entorno
              sintético
            </p>
            <h1>Cada ingreso, una historia completa.</h1>
            <p className="muted">
              {view === 'hospital'
                ? 'Registra ingresos, aporta evidencia y sigue la verificación administrativa.'
                : 'Revisa conflictos, entiende cada decisión y documenta el cierre humano.'}
            </p>
          </div>
          <div className="button-row">
            <button
              onClick={() => setEntry(entry === 'scenarios' ? null : 'scenarios')}
              aria-expanded={entry === 'scenarios'}
              aria-controls="entry-panel"
            >
              Simular escenario
            </button>
            <button
              className="primary"
              onClick={() => setEntry(entry === 'admission' ? null : 'admission')}
              aria-expanded={entry === 'admission'}
              aria-controls="entry-panel"
            >
              + Nuevo ingreso
            </button>
          </div>
        </section>
        <div className="safety-banner">
          <span aria-hidden="true">✚</span>
          <p>
            <strong>La atención de emergencia no se detiene.</strong> SCAYL Pulse no diagnostica ni
            toma decisiones médicas. Solo datos sintéticos.
          </p>
        </div>
        <section className="metrics" aria-label="Resumen de los últimos 200 casos">
          <div>
            <span>Expedientes cargados</span>
            <strong>{loading ? '—' : cases.length}</strong>
          </div>
          <div>
            <span>Cobertura verificada</span>
            <strong>
              {loading ? '—' : cases.filter((item) => item.status === 'VERIFIED').length}
            </strong>
          </div>
          <div>
            <span>Documentación pendiente</span>
            <strong>
              {loading ? '—' : cases.filter((item) => item.status === 'DOCUMENTS_REQUIRED').length}
            </strong>
          </div>
          <div>
            <span>Revisión humana</span>
            <strong>
              {loading ? '—' : cases.filter((item) => item.status === 'HUMAN_REVIEW').length}
            </strong>
          </div>
        </section>
        <div className="runtime-line" role="status">
          {health ? (
            <>
              <span>
                Persistencia: {health.persistence === 'supabase' ? 'Supabase' : 'memoria temporal'}
              </span>
              <span>
                {health.aiProvider.includes('deterministic')
                  ? 'Demo sin modelo de IA'
                  : `Proveedor configurado: ${health.aiProvider}${health.geminiModel ? ` · ${health.geminiModel}` : ''}`}
              </span>
              <span>
                Capacidad: {health.capacity.storedCases}/{health.capacity.maxCases}
              </span>
            </>
          ) : (
            <span>Comprobando entorno…</span>
          )}
          {healthError && <span>No se pudo actualizar el estado del entorno.</span>}
        </div>
        {health?.persistenceNote && (
          <p className="notice warning">
            Esta sesión usa almacenamiento temporal. Los expedientes pueden desaparecer al reiniciar
            el servidor.
          </p>
        )}
        {entry && (
          <section className="panel entry-panel" id="entry-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Nuevo expediente</p>
                <h2>{entry === 'scenarios' ? 'Simulador de ingresos' : 'Ingreso libre'}</h2>
              </div>
              <button onClick={() => setEntry(null)}>Cerrar panel</button>
            </div>
            {entry === 'scenarios' ? (
              catalogError ? (
                <div className="notice error" role="alert">
                  {catalogError}
                  <button onClick={() => setRevision((value) => value + 1)}>Reintentar</button>
                </div>
              ) : scenarios.length ? (
                <ScenarioRunner scenarios={scenarios} onCreated={onCreated} />
              ) : (
                <p role="status">Cargando escenarios…</p>
              )
            ) : (
              <AdmissionForm onCreated={onCreated} />
            )}
          </section>
        )}
        <div className="workspace" id="workspace">
          <aside className="panel case-index">
            <div className="section-heading">
              <h2>Expedientes</h2>
              <button className="text-button" onClick={() => setRevision((value) => value + 1)}>
                Actualizar
              </button>
            </div>
            <label>
              Buscar expediente
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Número, hospital o motivo"
              />
            </label>
            <label>
              Estado
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as CaseStatus | '')}
              >
                <option value="">Todos los estados</option>
                {CASE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {CASE_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">
              {visible.length} de {cases.length} · últimos 200 · actualización cada 10 s
            </p>
            {error && (
              <p className="notice error" role="alert">
                {error} {cases.length > 0 && 'Se muestran los últimos datos recibidos.'}
              </p>
            )}
            {loading && <p role="status">Cargando expedientes…</p>}
            {!loading && !visible.length && (
              <div className="empty-state">
                <h3>{cases.length ? 'Sin coincidencias' : 'Todavía no hay expedientes'}</h3>
                <p>
                  {cases.length
                    ? 'Prueba otro filtro o búsqueda.'
                    : 'Registra un ingreso o ejecuta un escenario para comenzar.'}
                </p>
              </div>
            )}
            <ul className="plain-list case-list">
              {visible.map((item) => (
                <li key={item.id}>
                  <button
                    className={`case-card ${selected === item.id ? 'selected' : ''}`}
                    aria-pressed={selected === item.id}
                    onClick={() => openCase(item.id)}
                  >
                    <div className="section-heading">
                      <strong>{item.caseNumber}</strong>
                      <span aria-hidden="true">↗</span>
                    </div>
                    <StatusPill status={item.status} />
                    <p>{item.admissionReason}</p>
                    <span className="muted">
                      {item.hospitalCode} · {dateLabel(item.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <section id="case-detail" className="case-detail" aria-label="Detalle del expediente">
            {selected ? (
              <CaseDetail
                key={selected}
                caseId={selected}
                view={view}
                realtimeAvailable={health?.realtimeAvailable ?? false}
                onChanged={() => setRevision((value) => value + 1)}
              />
            ) : (
              <div className="panel empty-detail">
                <span className="empty-symbol" aria-hidden="true">
                  ↗
                </span>
                <p className="eyebrow">Trazabilidad desde el primer ingreso</p>
                <h2>Abre un expediente vivo</h2>
                <p>
                  Consulta la decisión, las comprobaciones y la evidencia. Cada reevaluación se
                  conserva en el timeline.
                </p>
                <button onClick={() => setEntry('scenarios')}>Probar un escenario</button>
              </div>
            )}
          </section>
        </div>
        <footer className="app-footer">
          <span>SCAYL Pulse · hackIAthon Panamá</span>
          <span>Vistas de demostración · sin autenticación ni separación de acceso</span>
        </footer>
      </main>
    </div>
  );
}
