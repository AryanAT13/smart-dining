/**
 * Polls the messages endpoint for any new assistant messages and pushes
 * them into the chat store. Belt-and-suspenders alongside the socket
 * `ai:message` listener: if the socket is degraded, missed an event, or
 * still warming up when an upsell fires, the poll path catches it.
 *
 * Polling cadence: 5s while a session is active. 5s × 12 hits/min × the
 * trivial `WHERE sessionId AND sender='assistant' AND createdAt > X` is
 * negligible load.
 *
 * Dedup: each pushed message id is remembered locally so we never inject
 * the same message twice (the socket might race-win, then poll arrives,
 * or vice versa).
 */

'use client';

import { useEffect, useRef } from 'react';

import { api } from '@/lib/api/client';
import { useChatStore, type ChatSuggestion } from '@/lib/stores/chat';

interface ServerMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  intent: string | null;
  metadata: unknown;
  createdAt: string;
}

interface MessagesResponse {
  messages: ServerMessage[];
}

const POLL_INTERVAL_MS = 5_000;

export function useUpsellPoller(sessionId: string | null): void {
  const seen = useRef<Set<string>>(new Set());
  const sinceRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    if (!sessionId) return;

    // Reset the cursor on session change so we don't replay an old session's
    // history into the chat.
    sinceRef.current = new Date().toISOString();
    seen.current = new Set();

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const result = await api<MessagesResponse>(
          `/api/session/${sessionId}/messages?since=${encodeURIComponent(sinceRef.current)}`,
        );
        if (cancelled) return;

        for (const m of result.messages) {
          if (seen.current.has(m.id)) continue;
          seen.current.add(m.id);

          // Skip messages already pushed by the chat send-flow (they have
          // their own client-side IDs, but the timestamp filter combined
          // with this dedup keeps them from doubling up).
          const store = useChatStore.getState();
          const dupe = store.messages.some((existing) => existing.text === m.text);
          if (dupe) continue;

          const suggestion = pickSuggestion(m.metadata);
          store.pushAssistant(
            m.text,
            suggestion ? [suggestion] : undefined,
          );
        }

        // Advance the cursor only past messages we actually saw, so a slow
        // backend doesn't make us miss a row that lands at the cursor edge.
        if (result.messages.length > 0) {
          const last = result.messages[result.messages.length - 1]!;
          sinceRef.current = last.createdAt;
        }
      } catch {
        // Silent — polling failures are not user-visible.
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(tick, POLL_INTERVAL_MS);
        }
      }
    };

    let timer = window.setTimeout(tick, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sessionId]);
}

interface UpsellMetadata {
  suggestion?: {
    itemId: string;
    name: string;
    price: number;
    imageUrl?: string;
  };
  trigger?: string;
}

function pickSuggestion(metadata: unknown): ChatSuggestion | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const md = metadata as UpsellMetadata;
  const s = md.suggestion;
  if (!s || !s.itemId || !s.name || typeof s.price !== 'number') return null;
  return {
    itemId: s.itemId,
    name: s.name,
    price: s.price,
    reason: triggerReason(md.trigger),
    ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}),
  };
}

function triggerReason(trigger?: string): string {
  switch (trigger) {
    case 'post_add':         return 'Pairs well with what you just added';
    case 'threshold_below':  return 'Push your cart over ₹500 for the meal-deal';
    case 'missing_beverage': return 'Goes with the mains in your cart';
    case 'veg_only_balance': return "Today's non-veg crowd-pleaser";
    case 'evening_special':  return 'Evening special — limited time';
    case 'thats_all':        return 'Before you go — quick add';
    default:                 return 'Zara thought you might like this';
  }
}
