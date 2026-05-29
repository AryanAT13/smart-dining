/**
 * Orchestrator event emitter — abstract surface that the SSE endpoint
 * subscribes to. Each emitted event becomes one SSE frame on the wire.
 *
 * Keeping this an EventEmitter (rather than a generator) means agent nodes
 * can emit asynchronously without restructuring as async iterators.
 */

import { EventEmitter } from 'node:events';

import type { AgentName, Intent, Language, SseFrame } from '@smart-dining/shared';

export interface OrchestratorEvents {
  frame: (frame: SseFrame) => void;
  done: () => void;
  error: (err: Error) => void;
}

export class OrchestratorEmitter extends EventEmitter {
  override on<E extends keyof OrchestratorEvents>(event: E, listener: OrchestratorEvents[E]): this {
    return super.on(event, listener);
  }
  override emit<E extends keyof OrchestratorEvents>(
    event: E,
    ...args: Parameters<OrchestratorEvents[E]>
  ): boolean {
    return super.emit(event, ...args);
  }

  // Typed helpers.
  emitAgentEnter(agent: AgentName): void {
    this.emit('frame', { type: 'agent:enter', agent });
  }
  emitAgentExit(agent: AgentName, latencyMs: number): void {
    this.emit('frame', { type: 'agent:exit', agent, latencyMs });
  }
  emitToken(text: string): void {
    this.emit('frame', { type: 'token', text });
  }
  emitToolCall(tool: string, argsPreview?: Record<string, unknown>): void {
    this.emit('frame', {
      type: 'tool:call',
      tool,
      ...(argsPreview ? { argsPreview } : {}),
    });
  }
  emitRouter(intent: Intent, language: Language): void {
    this.emit('frame', { type: 'router:decision', intent, language });
  }
  emitSuggestion(items: Array<{ itemId: string; name: string; price: number; reason: string; imageUrl?: string }>): void {
    this.emit('frame', { type: 'suggestion', items });
  }
  emitCartAction(action: 'add' | 'remove' | 'update', menuItemId: string, quantity: number, cartItemId?: string): void {
    this.emit('frame', {
      type: 'cart:action',
      action,
      menuItemId,
      quantity,
      ...(cartItemId ? { cartItemId } : {}),
    });
  }
  emitDone(messageId: string, totalLatencyMs: number): void {
    this.emit('frame', { type: 'done', messageId, totalLatencyMs });
  }
  emitErrorFrame(code: string, message: string, recoverable = false): void {
    this.emit('frame', { type: 'error', code, message, recoverable });
  }
}
