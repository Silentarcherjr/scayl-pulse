import type { CaseStatus } from '@/core/domain/case-status';
import type {
  AdmissionInput,
  AgentDecision,
  CaseEvent,
  CaseEvidence,
  CaseResolution,
  EmergencyCase,
  Hospital,
  Notification,
  Patient,
  Policy,
} from '@/core/domain/types';

// HTTP view models compose shared domain types; no business rules live here.
export interface CaseListItem extends Pick<
  EmergencyCase,
  'id' | 'caseNumber' | 'status' | 'createdAt' | 'updatedAt' | 'scenarioId'
> {
  hospitalCode: string;
  admissionReason: string;
  triageLevel: AdmissionInput['triageLevel'];
  requiresHuman: boolean;
}
export interface CaseDetailData {
  case: EmergencyCase;
  hospital: Hospital | null;
  patient: Pick<Patient, 'id' | 'fullName' | 'birthDate'> | null;
  policy: Policy | null;
  decision: AgentDecision | null;
  resolution: CaseResolution | null;
  evidence: CaseEvidence[];
  notifications: Notification[];
  eventCount: number;
  decisionHistory: Array<{ seq: number; at: string; type: string; decision: AgentDecision }>;
}
export interface EventsData {
  caseId: string;
  status: CaseStatus;
  count: number;
  events: CaseEvent[];
}
export interface ScenarioSummary {
  id: string;
  code: 'GREEN' | 'YELLOW' | 'RED' | 'EXTRA';
  title: string;
  narrative: string;
  expectedStatus: AgentDecision['status'];
  followUps: Array<{ id: string; label: string; expectedStatusAfter: AgentDecision['status'] }>;
}
export interface HealthData {
  persistence: string;
  persistenceNote: string | null;
  realtimeAvailable: boolean;
  aiProvider: string;
  geminiModel: string | null;
  /** `storedCases` es null cuando la persistencia no respondió al contar. */
  capacity: { storedCases: number | null; maxCases: number };
  persistenceError?: string | null;
  status?: string;
}
const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: 'El caso o escenario ya no está disponible. Actualiza la lista.',
  CONFLICT: 'El caso está cerrado o se está evaluando. Actualiza el expediente antes de continuar.',
  UNAUTHORIZED:
    'Este entorno requiere autorización para registrar ingresos. Usa el simulador o consulta al responsable del despliegue.',
  CAPACITY_REACHED:
    'Se alcanzó el límite de casos de la demo. El responsable del entorno debe liberar capacidad.',
  INTERNAL_ERROR:
    'El servidor no pudo completar la operación. Revisa el expediente antes de volver a enviarla.',
};
/**
 * Tope de seguridad. Sin él, una petición que nunca responde —Supabase o
 * Gemini colgados— deja un «Cargando…» girando para siempre y el evaluador no
 * tiene forma de saber que el sistema ya no va a contestar. Es generoso a
 * propósito: un escenario con seguimientos y modelo real supera los 40 s.
 */
const DEFAULT_TIMEOUT_MS = 120_000;
/** Las lecturas de fondo se repiten solas, así que cortan mucho antes. */
export const POLL_TIMEOUT_MS = 15_000;

export interface ApiOptions extends RequestInit {
  timeoutMs?: number;
}
export async function apiRequest<T>(path: string, init: ApiOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = init;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', forwardAbort, { once: true });
  let response: Response;
  try {
    response = await fetch(path, { cache: 'no-store', ...rest, signal: controller.signal });
  } catch (error) {
    // Un desmontaje no es un fallo: el llamador ya dejó de esperar.
    if (signal?.aborted) throw error;
    if (timedOut)
      throw new Error(
        'El servidor tardó demasiado en responder. Actualiza el expediente; si estabas enviando datos, compruébalo antes de repetir la operación.',
      );
    throw new Error(
      'No se pudo conectar. Si estabas enviando datos, actualiza la lista antes de repetir la operación.',
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      'El servidor devolvió una respuesta ilegible. Actualiza antes de volver a enviar datos.',
    );
  }
  if (!response.ok || !payload.ok) {
    const code = payload.error?.code;
    if (code === 'VALIDATION_ERROR') {
      const issues = Array.isArray(payload.error?.details) ? payload.error.details : [];
      const fields = issues
        .map((issue: { path?: string[] }) => issue.path?.join('.'))
        .filter(Boolean);
      throw new Error(
        `Revisa los datos del formulario${fields.length ? `: ${fields.join(', ')}` : '.'}`,
      );
    }
    throw new Error(
      ERROR_MESSAGES[code] ?? `No se pudo completar la solicitud (HTTP ${response.status}).`,
    );
  }
  return payload.data as T;
}
export function postJson<T>(path: string, body: unknown) {
  return apiRequest<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
export const dateLabel = (value: string) =>
  new Date(value).toLocaleString('es-PA', { dateStyle: 'medium', timeStyle: 'short' });
