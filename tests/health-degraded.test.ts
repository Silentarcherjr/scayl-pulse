import { describe, expect, it, vi } from 'vitest';

/**
 * `/api/health` es el único endpoint que no puede caerse: la interfaz lo usa
 * para decidir qué contar al usuario sobre el entorno. Si devolvía 500 cuando
 * Supabase no respondía, el panel se quedaba sin ninguna información y el
 * evaluador solo veía un estado en blanco. Una persistencia caída tiene que
 * salir como respuesta honesta, no como error del servidor.
 */
describe('GET /api/health con la persistencia caída', () => {
  it('responde 200 degradado en lugar de 500 cuando no puede contar casos', async () => {
    vi.resetModules();
    vi.doMock('@/core/repository', () => ({
      getRepository: () => ({
        kind: 'supabase',
        countCases: async () => {
          throw new Error('fetch failed');
        },
      }),
    }));
    const { GET } = await import('@/app/api/health/route');
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.status).toBe('degraded');
    expect(payload.data.capacity.storedCases).toBeNull();
    expect(payload.data.persistenceError).toBeTruthy();
    // El mensaje es para una persona, no un volcado del fallo interno.
    expect(payload.data.persistenceError).not.toMatch(/fetch failed|Error:|at .*:\d+/);
    vi.doUnmock('@/core/repository');
    vi.resetModules();
  });

  it('informa como "up" y con la ocupación real cuando la persistencia responde', async () => {
    vi.resetModules();
    vi.doMock('@/core/repository', () => ({
      getRepository: () => ({ kind: 'in-memory', countCases: async () => 3 }),
    }));
    const { GET } = await import('@/app/api/health/route');
    const payload = await (await GET()).json();

    expect(payload.data.status).toBe('up');
    expect(payload.data.capacity.storedCases).toBe(3);
    expect(payload.data.persistenceError).toBeNull();
    vi.doUnmock('@/core/repository');
    vi.resetModules();
  });
});
