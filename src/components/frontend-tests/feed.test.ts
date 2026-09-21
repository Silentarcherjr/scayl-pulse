import { afterEach, describe, expect, it, vi } from 'vitest';
import { startCaseFeed, type CaseFeedState } from '@/hooks/useCaseFeed';
import { apiRequest } from '../case-api';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser-client';

const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
};
const detail = { case: { id: 'synthetic' } };
function mockRequest() {
  return vi.fn(async (path: string) =>
    path.endsWith('/events') ? { events: [{ seq: 2 }, { seq: 1 }] } : detail,
  );
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Frontend: actualización del expediente', () => {
  it('consulta eventos por polling sin Supabase y limpia el temporizador al salir', async () => {
    vi.useFakeTimers();
    const request = mockRequest();
    const change = vi.fn();
    const feed = startCaseFeed('synthetic', false, change, {
      request: request as typeof apiRequest,
      client: vi.fn(() => null),
    });
    await flush();
    const state: CaseFeedState = change.mock.lastCall![0];
    expect(state.events.map((event) => event.seq)).toEqual([1, 2]);
    expect(state.mode).toBe('polling');
    await vi.advanceTimersByTimeAsync(5000);
    expect(request).toHaveBeenCalledTimes(4);
    feed.stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(request).toHaveBeenCalledTimes(4);
  });
  it('usa polling si el cliente devuelve null aunque el servidor anuncie realtime', async () => {
    vi.useFakeTimers();
    const request = mockRequest();
    const feed = startCaseFeed('synthetic', true, vi.fn(), {
      request: request as typeof apiRequest,
      client: () => null,
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(request).toHaveBeenCalledTimes(4);
    feed.stop();
  });
  it('refresca por realtime, cae a polling al desconectar y recupera eventos al reconectar', async () => {
    vi.useFakeTimers();
    let subscription: (status: string) => void = () => {};
    let eventCallback: () => void = () => {};
    const channel = {
      on: vi.fn((_name: string, _filter: unknown, callback: () => void) => {
        eventCallback = callback;
        return channel;
      }),
      subscribe: vi.fn((callback: (status: string) => void) => {
        subscription = callback;
        return channel;
      }),
    };
    const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() };
    const request = mockRequest();
    const change = vi.fn();
    const feed = startCaseFeed('synthetic', true, change, {
      request: request as typeof apiRequest,
      client: (() => client) as unknown as typeof getSupabaseBrowserClient,
    });
    await flush();
    subscription('SUBSCRIBED');
    await flush();
    expect(change.mock.lastCall![0].mode).toBe('realtime');
    const before = request.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(request).toHaveBeenCalledTimes(before);
    eventCallback();
    await flush();
    expect(request).toHaveBeenCalledTimes(before + 2);
    subscription('CHANNEL_ERROR');
    await flush();
    expect(change.mock.lastCall![0].mode).toBe('polling');
    const offline = request.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(request).toHaveBeenCalledTimes(offline + 2);
    subscription('SUBSCRIBED');
    await flush();
    expect(request).toHaveBeenCalledTimes(offline + 4);
    expect(channel.on.mock.calls[0][1]).toMatchObject({
      table: 'case_events',
      filter: 'case_id=eq.synthetic',
    });
    feed.stop();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
  it('conserva datos y muestra error si falla una actualización', async () => {
    vi.useFakeTimers();
    const request = mockRequest();
    const change = vi.fn();
    const feed = startCaseFeed('synthetic', false, change, {
      request: request as typeof apiRequest,
      client: () => null,
    });
    await flush();
    request.mockRejectedValueOnce(new Error('Sin conexión'));
    await feed.refresh();
    expect(change.mock.lastCall![0]).toMatchObject({
      detail,
      error: 'Sin conexión',
      loading: false,
    });
    await feed.refresh();
    expect(change.mock.lastCall![0].error).toBeNull();
    feed.stop();
  });
  it('no publica resultados tardíos de un expediente al cambiar de caso', async () => {
    vi.useFakeTimers();
    let complete: (value: unknown) => void = () => {};
    const request = vi.fn(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const change = vi.fn();
    const feed = startCaseFeed('old-case', false, change, {
      request: request as typeof apiRequest,
      client: () => null,
    });
    feed.stop();
    complete({ events: [] });
    await flush();
    complete(detail);
    await flush();
    expect(change).toHaveBeenCalledTimes(1);
  });
});
