'use client';

import { useState, type FormEvent } from 'react';
import type { AdmissionInput, DocumentType } from '@/core/domain/types';
import { DOCUMENT_LABELS } from './DecisionPanel';
import { errorMessage, postJson } from './case-api';

export function DocumentFields({ prefix = '' }: { prefix?: string }) {
  return (
    <div className="form-grid">
      <label>
        Tipo de documento
        <select name={`${prefix}documentType`} required>
          {Object.entries(DOCUMENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Título
        <input name={`${prefix}title`} required maxLength={200} />
      </label>
      <label className="full-width">
        Contenido sintético
        <textarea name={`${prefix}content`} required maxLength={20000} rows={4} />
      </label>
    </div>
  );
}

export function AdmissionForm({ onCreated }: { onCreated: (caseId: string) => void }) {
  const [documents, setDocuments] = useState<number[]>([]);
  const [nextId, setNextId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) ?? '').trim();
    const input: AdmissionInput = {
      hospitalCode: value('hospitalCode'),
      patientNationalId: value('patientNationalId'),
      admissionReason: value('admissionReason'),
      triageLevel: value('triageLevel') as AdmissionInput['triageLevel'],
      ...(value('policyNumber') ? { policyNumber: value('policyNumber') } : {}),
      ...(value('admissionReasonCode')
        ? { admissionReasonCode: value('admissionReasonCode') }
        : {}),
      ...(value('estimatedCost') ? { estimatedCost: Number(value('estimatedCost')) } : {}),
      attachedDocuments: documents.map((id) => ({
        documentType: value(`${id}-documentType`) as DocumentType,
        title: value(`${id}-title`),
        content: value(`${id}-content`),
      })),
    };
    setBusy(true);
    setError(null);
    try {
      const result = await postJson<{ caseId: string }>('/api/admissions', input);
      form.reset();
      setDocuments([]);
      onCreated(result.caseId);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="stack">
      <p className="muted">
        Solo datos sintéticos. Escribe un ingreso y adjunta el texto de sus documentos. El triaje lo
        proporciona el hospital; este sistema no lo decide.
      </p>
      <fieldset disabled={busy} className="stack">
        <div className="form-grid">
          <label>
            Código del hospital
            <input name="hospitalCode" required maxLength={50} placeholder="HOSP-PTY-01" />
          </label>
          <label>
            Cédula sintética
            <input name="patientNationalId" required maxLength={50} placeholder="8-888-1111" />
          </label>
          <label>
            Póliza (opcional)
            <input name="policyNumber" maxLength={50} placeholder="POL-1001" />
          </label>
          <label>
            Triaje registrado
            <select name="triageLevel" required defaultValue="">
              <option value="" disabled>
                Selecciona el triaje
              </option>
              <option value="RED">Rojo</option>
              <option value="ORANGE">Naranja</option>
              <option value="YELLOW">Amarillo</option>
              <option value="GREEN">Verde</option>
              <option value="BLUE">Azul</option>
            </select>
          </label>
          <label className="full-width">
            Motivo del ingreso
            <textarea name="admissionReason" required maxLength={1000} rows={3} />
          </label>
          <label>
            Código del motivo (opcional)
            <input name="admissionReasonCode" maxLength={50} placeholder="S51.8" />
            <small>Sin código, no se evalúa la tabla de preexistencias.</small>
          </label>
          <label>
            Costo estimado en B/. (opcional)
            <input type="number" name="estimatedCost" min={0} max={10000000} step="0.01" />
          </label>
        </div>
        {documents.map((id, index) => (
          <section className="document-editor" key={id}>
            <div className="section-heading">
              <h3>Documento {index + 1}</h3>
              <button
                type="button"
                onClick={() => setDocuments((items) => items.filter((item) => item !== id))}
              >
                Quitar documento {index + 1}
              </button>
            </div>
            <DocumentFields prefix={`${id}-`} />
          </section>
        ))}
        <div className="button-row">
          <button
            type="button"
            disabled={documents.length >= 20}
            onClick={() => {
              setDocuments((items) => [...items, nextId]);
              setNextId((id) => id + 1);
            }}
          >
            + Adjuntar texto de documento
          </button>
          <span className="muted">{documents.length}/20 · sin archivos ni OCR</span>
        </div>
        <button className="primary" type="submit">
          {busy ? 'Registrando y evaluando…' : 'Registrar ingreso sintético'}
        </button>
      </fieldset>
      {busy && <p role="status">El análisis puede tardar varios segundos. Espera a que termine.</p>}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
