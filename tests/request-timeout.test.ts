import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, POLL_TIMEOUT_MS } from '@/components/case-api';

/**
 * Una petición del navegador que nunca responde dejaba un «Cargando…» girando
 * sin límite: con Supabase o Gemini colgados, el evaluador no tenía forma de
 * saber que el sistema ya no iba a contestar. El tope de tiempo es la garantía
 * de que todo estado transitorio termina, con éxito o con un mensaje.
 */
const hangingFetch = () =>
  vi.fn(
    (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
        );
      }),
  );

afterEach(() => vi.unstubAllGlobals());

describe('Tope de tiempo de las peticiones del navegador', () => {
  it('convierte una petición colgada en un error legible, no en una espera infinita', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    await expect(apiRequest('/api/cases', { timeoutMs: 40 })).rejects.toThrow(
      /tardó demasiado en responder/i,
    );
  });

  it('no filtra jerga técnica ni stack en el mensaje del tope de tiempo', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const error = await apiRequest('/api/health', { timeoutMs: 40 }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toMatch(/abort|signal|timeout|at .*:\d+/i);
  });

  it('distingue un desmontaje de un tope de tiempo: cancelar no es fallar', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const controller = new AbortController();
    const pending = apiRequest('/api/cases', { signal: controller.signal, timeoutMs: 10_000 });
    controller.abort();
    // El llamador dejó de esperar: se propaga el aborto, no el mensaje de lentitud.
    await expect(pending).rejects.toThrow(/aborted/i);
  });

  it('una respuesta dentro del plazo no se ve afectada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { cases: [] } }))),
    );
    await expect(apiRequest('/api/cases', { timeoutMs: 5_000 })).resolves.toEqual({ cases: [] });
  });

  it('las lecturas de fondo cortan mucho antes que el tope general', () => {
    // Un escenario con seguimientos y modelo real supera los 40 s, así que el
    // tope general es generoso; lo que se repite solo no tiene por qué esperar.
    expect(POLL_TIMEOUT_MS).toBeLessThanOrEqual(20_000);
    expect(POLL_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
  });
});
