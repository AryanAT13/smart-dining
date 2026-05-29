/**
 * Working memory — in-request, discarded at the end.
 *
 * Holds the running message + last 5 exchanges. Inflated into prompts by
 * every agent that needs short-term continuity.
 */

import type { Language } from '@smart-dining/shared';

export interface Turn {
  sender: 'user' | 'assistant';
  text: string;
  language?: Language;
  intent?: string;
  timestamp: number;
}

export interface WorkingMemory {
  recentTurns: Turn[];
  currentUserMessage: string;
  displayName: string;
  /** Latest language hint from the NLU agent. */
  language: Language | null;
}

export function buildWorkingMemory(
  recentTurns: Turn[],
  currentUserMessage: string,
  displayName: string,
  language: Language | null,
): WorkingMemory {
  return {
    recentTurns: recentTurns.slice(-5),
    currentUserMessage,
    displayName,
    language,
  };
}

/**
 * Render working memory as a transcript fragment for prompt injection.
 * Keep it short — every agent already gets the current user message
 * explicitly; this is just context.
 */
export function renderTranscript(mem: WorkingMemory): string {
  if (mem.recentTurns.length === 0) return '(no prior turns)';
  return mem.recentTurns
    .map((t) => `${t.sender === 'user' ? 'User' : 'Zara'}: ${t.text}`)
    .join('\n');
}
