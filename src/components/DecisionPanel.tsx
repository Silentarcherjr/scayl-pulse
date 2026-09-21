import { CASE_STATUS_LABELS, type CaseStatus } from '@/core/domain/case-status';
import type { AgentDecision, DecisionSource, DocumentType } from '@/core/domain/types';

export const SOURCE_LABELS: Record<DecisionSource, string> = {
  AI_ASSISTED: 'Análisis con IA · decisión validada por reglas',
  AI_UNAVAILABLE: 'IA no disponible · decisión basada en reglas',
  DETERMINISTIC: 'Modo determinístico · sin proveedor de IA',
};
export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  ADMISSION_FORM: 'Formulario de ingreso',
  PATIENT_ID: 'Identificación del paciente',
  MEDICAL_REPORT: 'Informe médico',
  TRIAGE_NOTE: 'Nota de triaje',
  LAB_RESULT: 'Resultado de laboratorio',
  IMAGING_REPORT: 'Informe de imagen',
  SPECIALIST_REPORT: 'Informe de especialista',
  COST_ESTIMATE: 'Estimado de costos',
  AUTHORIZATION_REQUEST: 'Solicitud de autorización',
  OTHER: 'Otro documento',
};
export function StatusPill({ status }: { status: CaseStatus }) {
  return <span className={`status-pill status-${status}`}>{CASE_STATUS_LABELS[status]}</span>;
}
const CHECK_LABELS = {
  PASSED: '✓ Cumple',
  WARNING: '⚠ Atención',
  FAILED: '✕ No cumple',
  NOT_EVALUATED: '— No evaluado',
};

export function DecisionPanel({
  decision,
  historical = false,
}: {
  decision: AgentDecision;
  historical?: boolean;
}) {
  return (
    <div className="decision-content">
      <div className="section-heading">
        <StatusPill status={decision.status} />
        <span className="eyebrow">
          {historical ? 'Decisión anterior conservada' : 'Decisión administrativa'}
        </span>
      </div>
      <p className="decision-summary">{decision.summary}</p>
      <p className="source-label">{SOURCE_LABELS[decision.source]}</p>
      {decision.gateOverrode && (
        <div className="notice warning">
          <strong>El Safety Gate corrigió al modelo</strong>
          <p>
            {decision.modelSuggestedStatus
              ? CASE_STATUS_LABELS[decision.modelSuggestedStatus]
              : 'Propuesta del modelo'}{' '}
            → {CASE_STATUS_LABELS[decision.status]}
          </p>
        </div>
      )}
      {(decision.requiresHuman || decision.status === 'HUMAN_REVIEW') && (
        <div className="notice review">
          <strong>Se necesita revisión humana</strong>
          <p>
            Hay un conflicto o incertidumbre pendiente. El motivo y la evidencia disponibles se
            detallan a continuación. La atención de emergencia no se detiene.
          </p>
        </div>
      )}
      <div>
        <h3>Motivo{decision.status === 'HUMAN_REVIEW' ? ' e incertidumbre' : ''}</h3>
        <p className="multiline">{decision.reason}</p>
      </div>
      <div className="next-action">
        <span className="eyebrow">Acción recomendada</span>
        <p>{decision.recommendedAction}</p>
      </div>
      <p className="muted">
        Solidez del análisis documental: {Math.round(decision.confidence * 100)} %. No mide gravedad
        ni certeza clínica.
      </p>
      <div>
        <h3>Documentación pendiente</h3>
        {decision.missingDocuments.length === 0 ? (
          <p className="muted">No se han identificado documentos pendientes.</p>
        ) : (
          <ul className="plain-list">
            {decision.missingDocuments.map((document, index) => (
              <li
                className={`document document-${document.severity}`}
                key={`${document.documentType}-${index}`}
              >
                <strong>{DOCUMENT_LABELS[document.documentType]}</strong>
                <span className="document-tag">
                  {document.severity === 'BLOCKING'
                    ? 'Obligatorio · bloquea la verificación'
                    : 'Recomendado · no bloquea'}
                </span>
                <p>{document.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <details className="checks" open={!historical}>
        <summary>
          ¿Por qué tomó esta decisión?{' '}
          <span className="muted">{decision.checks.length} comprobaciones</span>
        </summary>
        <ul className="plain-list">
          {decision.checks.map((check) => (
            <li className="check" key={check.code}>
              <span className={`check-result check-${check.status}`}>
                {CHECK_LABELS[check.status]}
              </span>
              <div>
                <strong>{check.label}</strong>
                <p>{check.detail}</p>
                {check.evidence && (
                  <blockquote>
                    {check.evidence.excerpt}
                    <cite>
                      {check.evidence.sourceType} · {check.evidence.sourceId}
                    </cite>
                  </blockquote>
                )}
                {check.imposedFloor && (
                  <p className="muted">
                    Estado mínimo requerido: {CASE_STATUS_LABELS[check.imposedFloor]}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </details>
      <details open={!historical}>
        <summary>Evidencia utilizada · {decision.evidence.length}</summary>
        {decision.evidence.length ? (
          <ul className="plain-list references">
            {decision.evidence.map((reference, index) => (
              <li key={`${reference.sourceId}-${index}`}>
                <span className="eyebrow">
                  {reference.sourceType} · {reference.sourceId}
                </span>
                <p>{reference.excerpt}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">La decisión no incluye referencias de evidencia.</p>
        )}
      </details>
    </div>
  );
}
