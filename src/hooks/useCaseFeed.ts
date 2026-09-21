'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser-client';
import {
  apiRequest,
  errorMessage,
  POLL_TIMEOUT_MS,
  type CaseDetailData,
  type EventsData,
} from '@/components/case-api';

export interface CaseFeedState {
  detail: CaseDetailData | null;
  events: EventsData['events'];
  loading: boolean;
  error: string | null;
  mode: 'polling' | 'realtime';
}

/** Serial refreshes prevent an older HTTP snapshot overwriting a newer one. */
export function startCaseFeed(
  caseId: string,
  realtimeAvailable: boolean,
  onChange: (state: CaseFeedState) => void,
  dependencies = { request: apiRequest, client: getSupabaseBrowserClient },
) {
  let state: CaseFeedState = {
    detail: null,
    events: [],
    loading: true,
    error: null,
    mode: 'polling',
  };
  let disposed = false;
  let running = false;
  let queued = false;
  const controller = new AbortController();
  const emit = () => {
    if (!disposed) onChange({ ...state });
  };
  const refresh = async () => {
    if (disposed) return;
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      const reads = { signal: controller.signal, timeoutMs: POLL_TIMEOUT_MS };
      const events = await dependencies.request<EventsData>(
        `/api/cases/${encodeURIComponent(caseId)}/events`,
        reads,
      );
      const detail = await dependencies.request<CaseDetailData>(
        `/api/cases/${encodeURIComponent(caseId)}`,
        reads,
      );
      state = {
        ...state,
        detail,
        events: [...events.events].sort((a, b) => a.seq - b.seq),
        loading: false,
        error: null,
      };
    } catch (error) {
      state = { ...state, loading: false, error: errorMessage(error) };
    } finally {
      running = false;
      emit();
      if (queued && !disposed) {
        queued = false;
        void refresh();
      }
    }
  };
  emit();
  void refresh();
  // Poll until subscribed; resume on disconnect. Re-fetch on reconnect to fill gaps.
  const timer = setInterval(() => {
    if (state.mode === 'polling') void refresh();
  }, 5000);
  let client: ReturnType<typeof getSupabaseBrowserClient> = null;
  let channel: ReturnType<
    NonNullable<ReturnType<typeof getSupabaseBrowserClient>>['channel']
  > | null = null;
  try {
    client = realtimeAvailable ? dependencies.client() : null;
    if (client) {
      channel = client
        .channel(`case-feed-${caseId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'case_events',
            filter: `case_id=eq.${caseId}`,
          },
          () => {
            void refresh();
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'cases', filter: `id=eq.${caseId}` },
          () => {
            void refresh();
          },
        )
        .subscribe((status) => {
          if (disposed) return;
          state = { ...state, mode: status === 'SUBSCRIBED' ? 'realtime' : 'polling' };
          emit();
          void refresh();
        });
    }
  } catch {
    state = { ...state, mode: 'polling' };
    emit();
  }
  return {
    refresh,
    stop() {
      disposed = true;
      controller.abort();
      clearInterval(timer);
      if (client && channel) void client.removeChannel(channel);
    },
  };
}

export function useCaseFeed(caseId: string, realtimeAvailable: boolean) {
  const [state, setState] = useState<CaseFeedState>({
    detail: null,
    events: [],
    loading: true,
    error: null,
    mode: 'polling',
  });
  const feedRef = useRef<ReturnType<typeof startCaseFeed> | null>(null);
  useEffect(() => {
    const feed = startCaseFeed(caseId, realtimeAvailable, setState);
    feedRef.current = feed;
    return () => feed.stop();
  }, [caseId, realtimeAvailable]);
  const refresh = useCallback(() => {
    void feedRef.current?.refresh();
  }, []);
  return { ...state, refresh };
}
