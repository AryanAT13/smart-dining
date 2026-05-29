/**
 * Execution context shared across every tool invocation.
 *
 * Critical property: `sessionId` and `tableId` come from the ORCHESTRATOR,
 * never from LLM-produced tool arguments. The registry refuses any tool call
 * whose argument schema declares those fields — they're injected here.
 *
 * This is the prompt-injection firewall: even if an agent is jailbroken, it
 * cannot operate on a different session than the one bound by the orchestrator.
 */

import type {
  CartService,
  MenuService,
  OrderService,
  OtpService,
  SessionService,
} from '../services/index.js';

import type { AgentName } from '@smart-dining/shared';

export interface AgentContext {
  /** Caller — the agent (or orchestrator step) invoking the tool. Required for ACL. */
  callerAgent: AgentName | 'orchestrator';
  /** Bound session. Never overridable by LLM output. */
  sessionId: string;
  /** Bound table. Never overridable by LLM output. */
  tableId: string;
  /** Display name attribution for cart writes. */
  addedBy: string;
  /** Services available to tools. Defaults are the singletons. */
  services: {
    menu: MenuService;
    session: SessionService;
    cart: CartService;
    order: OrderService;
    otp: OtpService;
  };
  /** Optional trace sink — every tool call appends an entry here. */
  toolTrace?: ToolTraceEntry[];
}

export interface ToolTraceEntry {
  tool: string;
  durationMs: number;
  ok: boolean;
  argsPreview: Record<string, unknown>;
  /** Truncated for the trace — full output is logged but not stored. */
  resultPreview: unknown;
  errorMessage?: string;
}
