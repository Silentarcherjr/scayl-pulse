import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, postJson } from '../case-api';

afterEach(() => vi.unstubAllGlobals());
describe('Frontend: errores HTTP', () => {
  it.each(['CAPACITY_REACHED', 'CONFLICT', 'UNAUTHORIZED'])(
    'explica %s y no reintenta escrituras automáticamente',
    async (code) => {
      const fetch = vi.fn(
        async () => new Response(JSON.stringify({ ok: false, error: { code } }), { status: 409 }),
      );
      vi.stubGlobal('fetch', fetch);
      await expect(postJson('/api/admissions', {})).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('muestra los campos inválidos que devuelve Zod', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: false,
              error: { code: 'VALIDATION_ERROR', details: [{ path: ['hospitalCode'] }] },
            }),
            { status: 422 },
          ),
      ),
    );
    await expect(apiRequest('/api/admissions')).rejects.toThrow('hospitalCode');
  });
  it('presenta una respuesta no JSON como error recuperable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>error</html>', { status: 502 })),
    );
    await expect(apiRequest('/api/cases')).rejects.toThrow('respuesta ilegible');
  });
});
