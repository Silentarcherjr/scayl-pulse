'use client';

import { useState, type FormEvent } from 'react';
import { CASE_STATUS_LABELS } from '@/core/domain/case-status';
import type { CaseEvent, CaseSummary, DocumentType } from '@/core/domain/types';
import { useCaseFeed } from '@/hooks/useCaseFeed';
import { DocumentFields } from './AdmissionForm';
import { DecisionPanel, DOCUMENT_LABELS, SOURCE_LABELS, StatusPill } from './DecisionPanel';
import { apiRequest, dateLabel, errorMessage, postJson, type CaseDetailData } from './case-api';

const ACTOR_LABELS = {
  SYSTEM: 'Sistema',
  HOSPITAL: 'Hospital',
  INSURER: 'Aseguradora',
  AI_AGENT: 'Analizador',
  SAFETY_GATE: 'Safety Gate',
  DEMO_RUNNER: 'Simulador',
};
const OUTCOME_LABELS = {
  COVERAGE_CONFIRMED: 'Cobertura confirmada',
  COVERAGE_DENIED: 'Cobertura denegada (administrativa)',
  CANCELLED: 'Cancelado',
};

export function CaseTimeline({
  events,
  history,
}: {
  events: CaseEvent[];
  history: CaseDetailData['decisionHistory'];
}) {
  return (
    <ol className="timeline">
      {[...events]
        .sort((a, b) => a.seq - b.seq)
        .map((event) => {
          const decision = history.find((item) => item.seq === event.seq)?.decision;
          return (
            <li key={event.id} className={decision ? 'timeline-decision' : ''}>
              <span className="timeline-seq">{event.seq}</span>
              <div>
                <div className="section-heading">
                  <span className="eyebrow">{ACTOR_LABELS[event.actor]}</span>
                  <time dateTime={event.createdAt}>{dateLabel(event.createdAt)}</time>
                </div>
                <p className="multiline">{event.message}</p>
                {event.statusAfter && event.statusAfter !== event.statusBefore && (
                  <div className="status-transition">
                    {event.statusBefore && (
                      <>
                        <span>{CASE_STATUS_LABELS[event.statusBefore]}</span>
                        <span aria-hidden="true">→</span>
                      </>
                    )}
                    <StatusPill status={event.statusAfter} />
                  </div>
                )}
                {decision && (
                  <details className="historical-decision">
                    <summary>Ver decisión de este momento</summary>
                    <DecisionPanel decision={decision} historical />
                  </details>
                )}
              </div>
            </li>
          );
        })}
    </ol>
  );
}

export function CaseDetail({
  caseId,
  view,
  realtimeAvailable,
  onChanged,
}: {
  caseId: string;
  view: 'hospital' | 'insurer';
  realtimeAvailable: boolean;
  onChanged: () => void;
}) {
  const feed = useCaseFeed(caseId, realtimeAvailable);
  const [tab, setTab] = useState<'decision' | 'timeline' | 'evidence' | 'notifications'>(
    'decision',
  );
  const [busy, setBusy] = useState<'evidence' | 'summary' | 'resolve' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ value: CaseSummary; version: string } | null>(null);
  const detail = feed.detail;
  const base = `/api/cases/${encodeURIComponent(caseId)}`;
  const version = detail ? `${detail.decision?.generatedAt}:${detail.case.status}` : '';
  const locked =
    !detail ||
    ['RESOLVED', 'ADMITTED', 'CHECKING', 'REASSESSING'].includes(detail.case.status) ||
    !!feed.error;

  function changed() {
    feed.refresh();
    onChanged();
  }

  async function addEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || locked) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) ?? '').trim();
    const codes = value('conditionCodes')
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean);
    setBusy('evidence');
    setError(null);
    setNotice(null);
    try {
      await postJson(base + '/evidence', {
        documentType: value('documentType') as DocumentType,
        title: value('title'),
        content: value('content'),
        submittedBy: value('submittedBy'),
        ...(codes.length ? { metadata: { addressesConditionCodes: codes } } : {}),
      });
      form.reset();
      setSummary(null);
      setNotice(
        'Evidencia registrada y expediente reevaluado. La decisión anterior permanece en el timeline.',
      );
      changed();
    } catch (error) {
      setError(errorMessage(error));
      feed.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function generateSummary() {
    if (busy) return;
    setBusy('summary');
    setError(null);
    setNotice(null);
    try {
      const result = await apiRequest<{ summary: CaseSummary }>(base + '/summary');
      setSummary({ value: result.summary, version });
      feed.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function resolveCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || locked) return;
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? '').trim();
    setBusy('resolve');
    setError(null);
    setNotice(null);
    try {
      await postJson(base + '/resolve', {
        outcome: value('outcome'),
        resolvedBy: value('resolvedBy'),
        reason: value('reason'),
        notes: value('notes'),
      });
      setSummary(null);
      setNotice('Cierre humano registrado. El expediente queda disponible para auditoría.');
      changed();
    } catch (error) {
      setError(errorMessage(error));
      feed.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!detail)
    return (
      <div className="panel empty-state">
        {feed.loading ? (
          <p role="status">Abriendo expediente…</p>
        ) : (
          <>
            <p role="alert" className="notice error">
              {feed.error ?? 'Expediente no disponible.'}
            </p>
            <button onClick={feed.refresh}>Reintentar</button>
          </>
        )}
      </div>
    );
  const isClosed = detail.case.status === 'RESOLVED';
  const notifications = detail.notifications.filter(
    (notification) =>
      notification.channel ===
      (view === 'hospital' ? 'HOSPITAL_ADMISSIONS' : 'INSURER_CASE_MANAGER'),
  );
  const validSummary =
    summary &&
    summary.version === version &&
    summary.value.decisionGeneratedAt === (detail.decision?.generatedAt ?? null)
      ? summary.value
      : null;

  return (
    <div className="stack">
      <article className="panel">
        <header className="detail-header">
          <div>
            <p className="eyebrow">Expediente vivo</p>
            <h2>{detail.case.caseNumber}</h2>
            <p>{detail.patient?.fullName ?? 'Paciente sin identificar'}</p>
          </div>
          <div className="detail-status">
            <StatusPill status={detail.case.status} />
            <span className={`connection ${feed.error ? 'connection-error' : ''}`}>
              {feed.error
                ? 'Datos sin actualizar'
                : feed.mode === 'realtime'
                  ? '● En tiempo real'
                  : '↻ Actualización cada 5 s'}
            </span>
            <button className="text-button" onClick={feed.refresh}>
              Actualizar expediente
            </button>
          </div>
        </header>
        <p className="admission-reason">{detail.case.admission.admissionReason}</p>
        <dl className="case-facts">
          <div>
            <dt>Hospital</dt>
            <dd>{detail.hospital?.name ?? detail.case.admission.hospitalCode}</dd>
          </div>
          <div>
            <dt>Póliza</dt>
            <dd>
              {detail.policy?.policyNumber ??
                detail.case.admission.policyNumber ??
                'No informada en el ingreso'}
            </dd>
          </div>
          <div>
            <dt>Ingreso</dt>
            <dd>{dateLabel(detail.case.admission.admittedAt ?? detail.case.createdAt)}</dd>
          </div>
          <div>
            <dt>Costo estimado</dt>
            <dd>
              {detail.case.admission.estimatedCost !== undefined
                ? `B/. ${detail.case.admission.estimatedCost.toLocaleString('es-PA', { minimumFractionDigits: 2 })}`
                : 'No informado'}
            </dd>
          </div>
        </dl>
        {feed.error && (
          <p className="notice error" role="alert">
            {feed.error} Se conservan los últimos datos recibidos; actualiza antes de realizar
            cambios.
          </p>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice success" role="status">
            {notice}
          </p>
        )}
        {busy && (
          <p className="notice" role="status">
            {busy === 'summary'
              ? 'Preparando resumen; puede tardar más de 10 segundos…'
              : busy === 'evidence'
                ? 'Guardando evidencia y reevaluando…'
                : 'Registrando cierre humano…'}
          </p>
        )}
        {isClosed && detail.resolution && (
          <section className="resolution">
            <h3>Cierre humano · {OUTCOME_LABELS[detail.resolution.outcome]}</h3>
            <p>
              {detail.resolution.resolvedBy} · {dateLabel(detail.resolution.resolvedAt)}
            </p>
            <p className="multiline">{detail.resolution.reason}</p>
            {detail.resolution.notes && <p className="multiline">{detail.resolution.notes}</p>}
            {detail.resolution.overrodeSystemRecommendation && (
              <p className="notice warning">
                <strong>La persona confirmó cobertura contra la recomendación del sistema.</strong>{' '}
                Estado previo: {CASE_STATUS_LABELS[detail.resolution.statusAtResolution]}.
              </p>
            )}
            <p className="muted">
              Cierre terminal. No se puede reabrir ni añadir evidencia. La atención de emergencia no
              se detiene.
            </p>
          </section>
        )}
        <div className="detail-tabs" role="tablist" aria-label="Contenido del expediente">
          {(
            [
              ['decision', 'Decisión'],
              ['timeline', `Timeline · ${feed.events.length}`],
              ['evidence', `Evidencia · ${detail.evidence.length}`],
              ['notifications', 'Notificaciones'],
            ] as const
          ).map(([id, label], index, tabs) => (
            <button
              key={id}
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={(event) => {
                let next = index;
                if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
                else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
                else if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = tabs.length - 1;
                else return;
                event.preventDefault();
                setTab(tabs[next][0]);
                document.getElementById(`tab-${tabs[next][0]}`)?.focus();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <section
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
          tabIndex={0}
          className="tab-content"
        >
          {tab === 'decision' && (
            <>
              {isClosed && <p className="eyebrow">Última evaluación automática antes del cierre</p>}
              {detail.decision ? (
                <DecisionPanel decision={detail.decision} />
              ) : (
                <p role="status">
                  La evaluación está en curso. La decisión aparecerá aquí cuando finalice.
                </p>
              )}
            </>
          )}
          {tab === 'timeline' && (
            <>
              <div className="section-heading">
                <h3>La historia completa, sin borrar decisiones</h3>
              </div>
              <p className="muted">
                Secuencia de auditoría ascendente. Las horas se muestran en tu zona local.
              </p>
              {feed.events.length ? (
                <CaseTimeline events={feed.events} history={detail.decisionHistory} />
              ) : (
                <p>Aún no hay eventos disponibles.</p>
              )}
            </>
          )}
          {tab === 'evidence' && (
            <div className="stack">
              <h3>Documentos del expediente</h3>
              {detail.evidence.length ? (
                detail.evidence.map((document) => (
                  <details key={document.id} className="evidence-item">
                    <summary>
                      {document.title}
                      <span className="muted">{DOCUMENT_LABELS[document.documentType]}</span>
                    </summary>
                    <p className="multiline">{document.content}</p>
                    <p className="muted">
                      {document.submittedBy} · {dateLabel(document.createdAt)}
                    </p>
                    {Array.isArray(document.metadata?.addressesConditionCodes) && (
                      <p className="muted">
                        Antecedentes declarados:{' '}
                        {document.metadata.addressesConditionCodes
                          .filter((code): code is string => typeof code === 'string')
                          .join(', ')}
                      </p>
                    )}
                  </details>
                ))
              ) : (
                <p className="muted">El ingreso no incluye documentos.</p>
              )}
              {!isClosed && (
                <form onSubmit={addEvidence} className="stack evidence-form">
                  <h3>Aportar nueva evidencia</h3>
                  <p className="muted">
                    El documento se conserva y dispara una reevaluación. Usa únicamente texto
                    sintético.
                  </p>
                  <fieldset disabled={!!busy || locked} className="stack">
                    <DocumentFields />
                    <div className="form-grid">
                      <label>
                        Quién aporta el documento
                        <input
                          name="submittedBy"
                          required
                          maxLength={120}
                          placeholder="Nombre o identificador sintético"
                        />
                      </label>
                      <label>
                        Códigos de antecedentes aclarados (opcional)
                        <input name="conditionCodes" placeholder="I10, E78.5" />
                        <small>
                          Solo los que el contenido del documento aclara; separados por comas.
                        </small>
                      </label>
                    </div>
                    <button type="submit" className="primary">
                      Adjuntar y reevaluar
                    </button>
                  </fieldset>
                  {locked && (
                    <p className="muted">
                      Espera a que el expediente termine de evaluarse y esté actualizado.
                    </p>
                  )}
                </form>
              )}
            </div>
          )}
          {tab === 'notifications' && (
            <div className="stack">
              <h3>
                {view === 'hospital' ? 'Admisiones del hospital' : 'Gestor de la aseguradora'}
              </h3>
              <p className="muted">
                Notificaciones de demostración guardadas por el sistema; no se envían correos ni SMS
                reales.
              </p>
              <div className="delivery-grid">
                {(['HOSPITAL_ADMISSIONS', 'INSURER_CASE_MANAGER'] as const).map((channel) => (
                  <div className="notice" key={channel}>
                    <strong>
                      {channel === 'HOSPITAL_ADMISSIONS' ? 'Hospital' : 'Aseguradora'}
                    </strong>
                    <p>
                      {
                        detail.notifications.filter(
                          (item) => item.channel === channel && item.status === 'SENT',
                        ).length
                      }{' '}
                      registradas ·{' '}
                      {
                        detail.notifications.filter(
                          (item) => item.channel === channel && item.status === 'FAILED',
                        ).length
                      }{' '}
                      fallidas
                    </p>
                  </div>
                ))}
              </div>
              {notifications.length ? (
                notifications.map((notification) => (
                  <article className="notification" key={notification.id}>
                    <div className="section-heading">
                      <h3>{notification.subject}</h3>
                      <span>{notification.status === 'SENT' ? '✓ Registrada' : '✕ Fallida'}</span>
                    </div>
                    <p className="muted">
                      {notification.recipient} · {dateLabel(notification.createdAt)}
                    </p>
                    <p className="multiline">{notification.body}</p>
                  </article>
                ))
              ) : (
                <p>No hay notificaciones de este destinatario.</p>
              )}
            </div>
          )}
        </section>
      </article>
      {view === 'hospital' && !isClosed && (
        <div className="panel hospital-action">
          <div>
            <h3>El expediente sigue vivo</h3>
            <p>
              Cuando llegue un documento, añádelo para actualizar la evaluación y avisar a ambas
              partes.
            </p>
          </div>
          <button
            onClick={() => {
              setTab('evidence');
              document.getElementById('tab-evidence')?.focus();
            }}
          >
            Aportar evidencia
          </button>
        </div>
      )}
      {view === 'insurer' && (
        <section className="panel stack">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Apoyo a la revisión</p>
              <h2>Resumen para el gestor</h2>
            </div>
            <button onClick={generateSummary} disabled={!!busy || !detail.decision || !!feed.error}>
              {validSummary ? 'Consultar resumen' : 'Preparar resumen'}
            </button>
          </div>
          <p className="muted">
            Se prepara solo cuando lo solicitas. Explica el expediente y no cambia la decisión.
          </p>
          {validSummary && (
            <article className="summary-content">
              <p className="source-label">{SOURCE_LABELS[validSummary.source]}</p>
              <h3>{validSummary.headline}</h3>
              <p>{validSummary.whatHappened}</p>
              {validSummary.whatChanged && (
                <>
                  <h3>Qué cambió</h3>
                  <p>{validSummary.whatChanged}</p>
                </>
              )}
              <h3>Qué se necesita</h3>
              <p>{validSummary.whatIsNeeded}</p>
              <ul>
                {validSummary.keyPoints.map((point, index) => (
                  <li key={index}>{point}</li>
                ))}
              </ul>
            </article>
          )}
          {!isClosed && (
            <details className="resolve-form">
              <summary>Registrar cierre humano del expediente</summary>
              <form onSubmit={resolveCase} className="stack">
                <p>
                  El cierre es definitivo y queda en el timeline con tu nombre y motivo. La atención
                  de emergencia no se detiene.
                </p>
                <fieldset disabled={!!busy || locked} className="stack">
                  <div className="form-grid">
                    <label>
                      Resultado administrativo
                      <select name="outcome" required defaultValue="">
                        <option value="" disabled>
                          Selecciona un resultado
                        </option>
                        {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Quién cierra
                      <input
                        name="resolvedBy"
                        required
                        minLength={2}
                        maxLength={120}
                        autoComplete="off"
                      />
                    </label>
                    <label className="full-width">
                      Motivo del cierre
                      <textarea name="reason" required minLength={10} maxLength={2000} rows={3} />
                    </label>
                    <label className="full-width">
                      Notas (opcional)
                      <textarea name="notes" maxLength={2000} rows={2} />
                    </label>
                  </div>
                  <label className="checkbox-label">
                    <input type="checkbox" required />
                    He revisado la evidencia y confirmo que este cierre es definitivo.
                  </label>
                  <button type="submit" className="primary">
                    Registrar cierre definitivo
                  </button>
                </fieldset>
                {locked && (
                  <p className="muted">
                    El cierre estará disponible cuando termine la evaluación y el expediente esté
                    actualizado.
                  </p>
                )}
              </form>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
