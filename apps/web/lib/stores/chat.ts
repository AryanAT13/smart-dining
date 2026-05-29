/**
 * Chat store — message list, streaming state, agent-progress narration.
 *
 * Persisted to localStorage so a reload doesn't lose the conversation. We
 * cap the persisted history to the last 50 turns so the key stays small.
 */

'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ChatSuggestion {
  itemId: string;
  name: string;
  price: number;
  reason: string;
  imageUrl?: string | undefined;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  /** Live token accumulator while streaming. */
  isStreaming?: boolean;
  /** Item cards rendered inside an assistant message. */
  suggestions?: ChatSuggestion[];
  timestamp: number;
}

interface ChatState {
  isOpen: boolean;
  messages: ChatMessage[];
  /** Stage labels shown while waiting ("Searching the menu…"). */
  agentProgress: string | null;
  isAwaitingResponse: boolean;
  // Mutators
  setOpen: (open: boolean) => void;
  pushUser: (text: string) => string;
  pushAssistant: (text: string, suggestions?: ChatSuggestion[]) => string;
  startStreaming: () => string;
  appendToken: (id: string, token: string) => void;
  attachSuggestions: (id: string, items: ChatSuggestion[]) => void;
  setAgentProgress: (label: string | null) => void;
  setAwaiting: (waiting: boolean) => void;
  clear: () => void;
}

const STORAGE_KEY = 'sda:chat:v1';
const MAX_PERSISTED = 50;

function rid(): string {
  return Math.random().toString(36).slice(2);
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      isOpen: false,
      messages: [],
      agentProgress: null,
      isAwaitingResponse: false,
      setOpen: (open) => set({ isOpen: open }),
      pushUser: (text) => {
        const id = rid();
        set((state) => ({
          messages: [...state.messages, { id, sender: 'user', text, timestamp: Date.now() }],
        }));
        return id;
      },
      pushAssistant: (text, suggestions) => {
        const id = rid();
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id,
              sender: 'assistant',
              text,
              timestamp: Date.now(),
              ...(suggestions && suggestions.length > 0 ? { suggestions } : {}),
            },
          ],
        }));
        return id;
      },
      startStreaming: () => {
        const id = rid();
        set((state) => ({
          messages: [
            ...state.messages,
            { id, sender: 'assistant', text: '', isStreaming: true, timestamp: Date.now() },
          ],
        }));
        return id;
      },
      appendToken: (id, token) => {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, text: m.text + token } : m,
          ),
        }));
      },
      attachSuggestions: (id, items) => {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, suggestions: items, isStreaming: false } : m,
          ),
        }));
      },
      setAgentProgress: (label) => set({ agentProgress: label }),
      setAwaiting: (waiting) =>
        set({ isAwaitingResponse: waiting, agentProgress: waiting ? null : null }),
      clear: () => set({ messages: [] }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({ messages: s.messages.slice(-MAX_PERSISTED) }),
    },
  ),
);
