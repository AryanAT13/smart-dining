/**
 * useAIChat — drives the SSE conversation with the orchestrator.
 *
 * Why fetch + ReadableStream instead of EventSource: EventSource can only
 * make GET requests, and we need POST (to send the user's text in the
 * body). The decoded SSE frame parsing is straightforward — split on
 * `\n\n`, parse `data: <json>` lines.
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { toast } from 'sonner';

import type { AgentName, SseFrame } from '@smart-dining/shared';

import { cartKeys } from '@/lib/api/fetchers';
import { useChatStore } from '@/lib/stores/chat';
import { useIdentityStore } from '@/lib/stores/identity';

const AGENT_LABELS: Record<AgentName, string> = {
  multilingualNLU: 'Reading what you said…',
  router: 'Working out what you need…',
  greeter: 'Saying hello…',
  recommendation: 'Picking the best matches…',
  upsell: 'Looking for a good pairing…',
  contextMemory: 'Remembering your preferences…',
  groupCoordinator: 'Balancing the group order…',
  sentiment: '',
  orderValidation: 'Validating your cart…',
};

export function useAIChat() {
  const queryClient = useQueryClient();
  const sessionId = useIdentityStore((s) => s.sessionId);
  const displayName = useIdentityStore((s) => s.displayName);

  const store = useChatStore.getState;
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string) => {
      if (!sessionId) {
        toast.error('Session not ready yet.');
        return;
      }
      if (!text.trim()) return;

      // Hard-cancel any in-flight previous request.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const s = store();
      s.pushUser(text.trim());
      s.setAwaiting(true);
      s.setAgentProgress('Sending…');
      const streamingId = s.startStreaming();

      try {
        const res = await fetch(`/api/session/${sessionId}/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Display-Name': displayName },
          body: JSON.stringify({ text, displayName }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          let detail = 'Chat failed';
          try {
            const j = (await res.json()) as { error?: { message?: string } };
            if (j.error?.message) detail = j.error.message;
          } catch {
            /* ignore */
          }
          throw new Error(detail);
        }

        await consumeSse(res.body, streamingId);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        toast.error(err instanceof Error ? err.message : 'Chat failed');
      } finally {
        store().setAwaiting(false);
        store().setAgentProgress(null);
      }
    },
    [sessionId, displayName, store],
  );

  const consumeSse = useCallback(
    async (body: ReadableStream<Uint8Array>, streamingId: string) => {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by blank lines.
        let sepIdx;
        while ((sepIdx = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          const data = parseSseChunk(chunk);
          if (data) {
            handleFrame(data, streamingId);
          }
        }
      }
    },
    [],
  );

  const handleFrame = useCallback(
    (frame: SseFrame, streamingId: string) => {
      const s = store();
      switch (frame.type) {
        case 'agent:enter': {
          const label = AGENT_LABELS[frame.agent];
          if (label) s.setAgentProgress(label);
          return;
        }
        case 'agent:exit': {
          return;
        }
        case 'tool:call': {
          if (frame.tool === 'search_menu') s.setAgentProgress('Searching the menu…');
          if (frame.tool === 'get_complementary') s.setAgentProgress('Looking up pairings…');
          if (frame.tool === 'add_to_cart') s.setAgentProgress('Updating your cart…');
          return;
        }
        case 'router:decision': {
          return;
        }
        case 'token': {
          s.appendToken(streamingId, frame.text);
          return;
        }
        case 'suggestion': {
          s.attachSuggestions(streamingId, frame.items);
          return;
        }
        case 'cart:action': {
          if (sessionId) {
            queryClient.invalidateQueries({ queryKey: cartKeys.forSession(sessionId) });
          }
          return;
        }
        case 'done': {
          // Finalize the streaming message: if no tokens flowed, kill the
          // empty bubble; if it has only an empty text, also kill it.
          const last = store().messages.find((m) => m.id === streamingId);
          if (last && !last.text && (!last.suggestions || last.suggestions.length === 0)) {
            useChatStore.setState((st) => ({
              messages: st.messages.filter((m) => m.id !== streamingId),
            }));
          } else {
            useChatStore.setState((st) => ({
              messages: st.messages.map((m) =>
                m.id === streamingId ? { ...m, isStreaming: false } : m,
              ),
            }));
          }
          return;
        }
        case 'error': {
          toast.error(frame.message);
          return;
        }
      }
    },
    [queryClient, sessionId, store],
  );

  return { send };
}

function parseSseChunk(chunk: string): SseFrame | null {
  for (const rawLine of chunk.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith(':')) continue;
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data) continue;
    try {
      return JSON.parse(data) as SseFrame;
    } catch {
      return null;
    }
  }
  return null;
}
