/**
 * Orchestrator — runs the agent DAG for one user turn.
 *
 * Pipeline:
 *   1. NLU (always)
 *   2. Sentiment (parallel, non-blocking)
 *   3. Router (always)
 *   4. One specialist agent, dispatched by intent
 *   5. Cart actions (orchestrator-privileged tool dispatch)
 *   6. Context Memory (always, persists prefs + optional summary)
 *
 * Each agent invocation:
 *   - emits agent:enter / agent:exit SSE frames
 *   - records a trace entry
 *   - charges the per-session LLM budget
 */

import type {
  Intent,
  Language,
  SseFrame,
} from '@smart-dining/shared';
import { mergePreferences as sharedMergePreferences } from '@smart-dining/shared';

import { isDemoMode } from '../config/env.js';
import { BudgetExceededError, toDomainError } from '../lib/errors.js';
import { childLogger } from '../lib/logger.js';
import { classifyTimeOfDay } from '../lib/time.js';
import { buildWorkingMemory, renderTranscript } from '../memory/working.js';
import { sessionMemory } from '../memory/session.js';

import {
  contextMemoryAgent,
  greeterAgent,
  groupCoordinatorAgent,
  multilingualNLUAgent,
  recommendationAgent,
  routerAgent,
  sentimentAgent,
} from '../agents/index.js';
import { toolRegistry, ensureToolsRegistered } from '../tools/index.js';
import type { AgentContext } from '../tools/context.js';
import { cartService, menuService, orderService, otpService, sessionService } from '../services/index.js';
import { env } from '../config/env.js';

import { OrchestratorEmitter } from './events.js';
import {
  initialState,
  type AgentTraceRecord,
  type OrchestratorInput,
  type OrchestratorState,
} from './state.js';
import { previewForTrace } from './trace.js';

const log = childLogger('orchestrator');

const SUMMARY_EVERY_N_TURNS = 10;

export interface RunOptions {
  /** Optional emitter — pass when you want to stream frames. */
  emitter?: OrchestratorEmitter;
}

export async function runOrchestrator(
  input: OrchestratorInput,
  opts: RunOptions = {},
): Promise<OrchestratorState> {
  await ensureToolsRegistered();
  const emitter = opts.emitter;
  const state = initialState(input);
  const ctx = buildContext(state, 'orchestrator');

  try {
    // ----- Budget check -------------------------------------------------
    const spent = await sessionMemory.getBudgetUsd(input.sessionId);
    if (spent >= env.SESSION_LLM_BUDGET_USD) {
      throw new BudgetExceededError(input.sessionId, env.SESSION_LLM_BUDGET_USD);
    }

    // ----- Persist user turn into session memory ------------------------
    await sessionMemory.pushTurn(input.sessionId, {
      sender: 'user',
      text: input.text,
      timestamp: Date.now(),
    });

    // ----- Stage 1: NLU (always) ---------------------------------------
    const recentTurns = await sessionMemory.recentTurns(input.sessionId, 5);
    const transcript = renderTranscript(
      buildWorkingMemory(recentTurns, input.text, input.displayName, null),
    );

    const nluResult = await invokeAgent(
      multilingualNLUAgent,
      { text: input.text },
      ctx,
      state,
      emitter,
    );
    state.language = nluResult.language as Language;
    state.englishGloss = nluResult.englishGloss;
    state.preferencesPatch = nluResult.preferences;
    state.intentHint = nluResult.intentHint as Intent;
    state.mentionsCart = nluResult.mentionsCart;

    // ----- Stage 2: Sentiment (parallel, non-blocking) -----------------
    const sentimentPromise = invokeAgent(
      sentimentAgent,
      { text: input.text, consecutiveSameIntent: 0 },
      buildContext(state, 'sentiment'),
      state,
      emitter,
    )
      .then((s) => {
        state.sentiment = { sentiment: s.sentiment, recommendedAction: s.recommendedAction };
      })
      .catch((err) => {
        log.warn({ err: String(err) }, 'sentiment branch failed (non-fatal)');
      });

    // ----- Stage 3: Router ---------------------------------------------
    const turnCount = await sessionMemory.turnCount(input.sessionId);
    const cartSnapshot = await cartService.getCart(input.sessionId).catch(() => null);
    const cartItemCount = cartSnapshot?.items.reduce((acc, l) => acc + l.quantity, 0) ?? 0;

    const routerResult = await invokeAgent(
      routerAgent,
      {
        englishGloss: state.englishGloss ?? input.text,
        hint: state.intentHint ?? 'FALLBACK',
        hasBeenGreeted: turnCount > 1,
        cartItemCount,
      },
      buildContext(state, 'router'),
      state,
      emitter,
    );
    state.intent = routerResult.intent;
    state.routerReason = routerResult.reason;
    emitter?.emitRouter(routerResult.intent, state.language ?? 'en');

    // ----- Stage 4: Specialist ----------------------------------------
    await dispatchSpecialist(state, transcript, cartSnapshot, emitter);

    // ----- Stage 4b: Stream the assistant text to the client ----------
    // The specialists return JSON (chatJson, not streaming) so no tokens
    // flow naturally. Synthesize a chunked stream so the chat bubble
    // populates with text, not just an empty container above the cards.
    if (emitter && state.assistantText) {
      await streamAssistantText(state.assistantText, emitter);
    }

    // ----- Stage 5: Cart actions (if any) -----------------------------
    for (const action of state.cartActions) {
      const orchestratorCtx = buildContext(state, 'orchestrator');
      if (action.kind === 'add') {
        const result = await toolRegistry.dispatch<{ cartItemId: string }>(
          'add_to_cart',
          {
            itemId: action.menuItemId,
            quantity: action.quantity,
            ...(action.specialInstructions !== undefined
              ? { specialInstructions: action.specialInstructions }
              : {}),
          },
          orchestratorCtx,
        );
        emitter?.emitCartAction('add', action.menuItemId, action.quantity, result.cartItemId);
      } else if (action.kind === 'remove') {
        await toolRegistry.dispatch(
          'remove_from_cart',
          { cartItemId: action.cartItemId },
          orchestratorCtx,
        );
        emitter?.emitCartAction('remove', action.cartItemId, 0);
      }
    }

    // ----- Wait for the sentiment branch -----------------------------
    await sentimentPromise;

    // ----- Stage 6: Context Memory ------------------------------------
    const shouldSummarize = turnCount > 0 && turnCount % SUMMARY_EVERY_N_TURNS === 0;
    const cmResult = await invokeAgent(
      contextMemoryAgent,
      {
        sessionId: input.sessionId,
        preferencesPatch: state.preferencesPatch,
        ...(state.language ? { language: state.language } : {}),
        shouldSummarize,
        ...(shouldSummarize ? { transcriptToCompress: transcript } : {}),
      },
      buildContext(state, 'contextMemory'),
      state,
      emitter,
    );
    state.mergedPreferences = cmResult.mergedPreferences;
    state.newSummary = cmResult.newSummary;

    // ----- Persist assistant turn ------------------------------------
    if (state.assistantText) {
      await sessionMemory.pushTurn(input.sessionId, {
        sender: 'assistant',
        text: state.assistantText,
        language: state.language ?? 'en',
        intent: state.intent ?? undefined,
        timestamp: Date.now(),
      });
    }

    state.totalLatencyMs = Date.now() - state.startedAt;
    log.info(
      {
        sessionId: input.sessionId,
        intent: state.intent,
        latencyMs: state.totalLatencyMs,
        costUsd: state.totalCostUsd.toFixed(6),
        agents: state.agentTraces.length,
      },
      'orchestrator run complete',
    );

    return state;
  } catch (err) {
    const domain = toDomainError(err);
    log.error(
      { sessionId: input.sessionId, code: domain.code, message: domain.message },
      'orchestrator failed',
    );
    if (emitter) {
      emitter.emitErrorFrame(domain.code, domain.message, false);
    }
    // Still return the partial state so the caller can persist what we have.
    return state;
  }
}

// ---------------------------------------------------------------------------
// Specialist dispatch
// ---------------------------------------------------------------------------

async function dispatchSpecialist(
  state: OrchestratorState,
  transcript: string,
  cartSnapshot: Awaited<ReturnType<typeof cartService.getCart>> | null,
  emitter: OrchestratorEmitter | undefined,
): Promise<void> {
  const intent = state.intent ?? 'FALLBACK';
  const language = state.language ?? 'en';
  const ctx = buildContext(state, 'orchestrator');

  // ----- Merge session-tier prefs with THIS turn's patch -----
  // The Recommendation Agent and search_menu must see the diner's
  // ACCUMULATED preferences (e.g. "no dairy" said three turns ago),
  // not just the prefs extracted from the current message. Without
  // this merge, a turn that says "more spicy please" loses the prior
  // dairy exclusion and Zara starts recommending dairy items again.
  const sessionRow = await sessionService.getById(state.input.sessionId).catch(() => null);
  const sessionPrefs = (sessionRow?.preferences ?? {}) as Record<string, unknown>;
  const mergedPrefs = sharedMergePreferences(
    sessionPrefs as Parameters<typeof sharedMergePreferences>[0],
    state.preferencesPatch,
  );

  switch (intent) {
    case 'GREET': {
      const result = await invokeAgent(
        greeterAgent,
        {
          displayName: state.input.displayName,
          language,
          timeOfDay: classifyTimeOfDay(),
          restaurantName: env.RESTAURANT_NAME,
        },
        buildContext(state, 'greeter'),
        state,
        emitter,
      );
      state.assistantText = result.message;
      // Merge greeter's initial preferences into the patch.
      state.preferencesPatch = { ...result.initialPreferences, ...state.preferencesPatch };
      return;
    }

    case 'RECOMMEND': {
      // Retrieve candidates via the tool registry (orchestrator privilege).
      // Use MERGED preferences so prior turns' constraints (e.g. "no dairy")
      // continue to apply to the search filters.
      const search = await toolRegistry.dispatch<{
        matches: Array<{
          itemId: string;
          name: string;
          category: string;
          price: number;
          description: string;
          tags: string[];
          allergens: string[];
          caloriesKcal: number | null;
          similarity: number;
        }>;
      }>(
        'search_menu',
        {
          query: state.englishGloss ?? state.input.text,
          topK: 8,
          excludeAllergens: mergedPrefs.excludeAllergens ?? [],
          vegOnly: mergedPrefs.vegOnly ?? false,
          excludeInCart: true,
          ...(mergedPrefs.light ? { maxCaloriesKcal: 400 } : {}),
        },
        ctx,
      );

      if (search.matches.length === 0) {
        state.assistantText =
          "I couldn't find a great match — could you tell me a bit more about what you're in the mood for?";
        return;
      }

      const cartItemIds = cartSnapshot?.items.map((l) => l.menuItem.id) ?? [];

      const rec = await invokeAgent(
        recommendationAgent,
        {
          englishGloss: state.englishGloss ?? state.input.text,
          originalText: state.input.text,
          language,
          preferences: mergedPrefs,
          timeOfDay: classifyTimeOfDay(),
          cartItemIds,
          candidates: search.matches,
          recentTranscript: transcript,
        },
        buildContext(state, 'recommendation'),
        state,
        emitter,
      );
      state.assistantText = rec.message;
      state.suggestions = rec.suggestions.map((s) => ({
        itemId: s.itemId,
        name: s.name,
        price: s.price,
        reason: s.reason,
      }));
      emitter?.emitSuggestion(state.suggestions);
      return;
    }

    case 'ADD_ITEM': {
      // The router signals intent; the Recommendation pass identified the
      // candidate (or the user named an item). We re-search to disambiguate.
      const search = await toolRegistry.dispatch<{
        matches: Array<{ itemId: string; name: string; price: number; description: string }>;
      }>(
        'search_menu',
        { query: state.englishGloss ?? state.input.text, topK: 3, excludeInCart: false },
        ctx,
      );
      const top = search.matches[0];
      if (!top) {
        state.assistantText = "I couldn't find that on the menu — could you say it differently?";
        return;
      }
      state.cartActions.push({ kind: 'add', menuItemId: top.itemId, quantity: 1 });
      state.assistantText = `Added ${top.name}. Anything else?`;
      return;
    }

    case 'GROUP_MERGE': {
      // Pull two candidate sets in parallel — using MERGED preferences so
      // prior turns' allergen exclusions etc. apply across the table.
      const [veg, nonVeg] = await Promise.all([
        toolRegistry.dispatch<{
          matches: Array<{
            itemId: string;
            name: string;
            category: string;
            price: number;
            description: string;
            tags: string[];
            allergens: string[];
            caloriesKcal: number | null;
            similarity: number;
          }>;
        }>(
          'search_menu',
          {
            query: `${state.englishGloss ?? state.input.text} vegetarian`,
            topK: 5,
            excludeAllergens: mergedPrefs.excludeAllergens ?? [],
            vegOnly: true,
            excludeInCart: true,
          },
          ctx,
        ),
        toolRegistry.dispatch<{
          matches: Array<{
            itemId: string;
            name: string;
            category: string;
            price: number;
            description: string;
            tags: string[];
            allergens: string[];
            caloriesKcal: number | null;
            similarity: number;
          }>;
        }>(
          'search_menu',
          {
            query: `${state.englishGloss ?? state.input.text} non-vegetarian`,
            topK: 5,
            excludeAllergens: mergedPrefs.excludeAllergens ?? [],
            vegOnly: false,
            excludeInCart: true,
          },
          ctx,
        ),
      ]);

      const result = await invokeAgent(
        groupCoordinatorAgent,
        {
          trigger: 'group_intent' as const,
          participants: [state.input.displayName],
          cartItemNames: cartSnapshot?.items.map((l) => l.menuItem.name) ?? [],
          ...(mergedPrefs.groupSize !== undefined
            ? { groupSize: mergedPrefs.groupSize }
            : {}),
          combinedPreferences: mergedPrefs,
          language,
          vegCandidates: veg.matches,
          nonVegCandidates: nonVeg.matches.filter((m) => !m.tags.includes('veg')),
        },
        buildContext(state, 'groupCoordinator'),
        state,
        emitter,
      );

      state.assistantText = result.message;
      state.suggestions = [
        ...result.suggestions.veg.map((s) => ({ ...s })),
        ...result.suggestions.nonVeg.map((s) => ({ ...s })),
      ];
      emitter?.emitSuggestion(state.suggestions);
      return;
    }

    case 'CHECKOUT': {
      state.assistantText = 'Opening checkout — please fill in your name and phone in the modal.';
      // Fire the "thats_all" upsell in the background — spec §5.4 last
      // trigger. Don't await; the order flow shouldn't wait on a save-attempt.
      void (async () => {
        const { triggerThatsAllUpsell } = await import('./upsell.js');
        await triggerThatsAllUpsell({
          sessionId: state.input.sessionId,
          tableId: state.input.tableId,
          addedBy: state.input.displayName,
        });
      })();
      // The UI watches for intent=CHECKOUT and opens the modal client-side.
      return;
    }

    case 'CLARIFY': {
      state.assistantText =
        "I want to get this right — are you in the mood for a starter, a main, or something light to drink?";
      return;
    }

    case 'FALLBACK':
    default: {
      // Soft recommendation fallback so we never dead-end.
      state.assistantText =
        "Let me know what you're in the mood for — spicy, light, something to share?";
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Stream the assistant's message text to the client as a series of small
 * token frames. Synthesizes a "Zara is typing" feel even though the
 * underlying chatJson call is non-streaming. Chunks on word boundaries
 * to keep the pacing natural.
 *
 * Timing: ~12 chars per chunk at 22ms between → readable, not jittery.
 * For a 100-char message that's ~200ms — within the SSE budget.
 */
async function streamAssistantText(text: string, emitter: OrchestratorEmitter): Promise<void> {
  const tokens = chunkOnWords(text, 12);
  const intervalMs = 22;
  for (const token of tokens) {
    emitter.emitToken(token);
    if (intervalMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

function chunkOnWords(text: string, approxLen: number): string[] {
  const words = text.split(/(\s+)/); // keep separators
  const out: string[] = [];
  let buf = '';
  for (const part of words) {
    if (buf.length + part.length > approxLen && buf.length > 0) {
      out.push(buf);
      buf = part;
    } else {
      buf += part;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function buildContext(state: OrchestratorState, callerAgent: AgentContext['callerAgent']): AgentContext {
  return {
    callerAgent,
    sessionId: state.input.sessionId,
    tableId: state.input.tableId,
    addedBy: state.input.displayName,
    services: { menu: menuService, session: sessionService, cart: cartService, order: orderService, otp: otpService },
    toolTrace: [],
  };
}

async function invokeAgent<I, O>(
  agent: { metadata: { name: import('@smart-dining/shared').AgentName; model: string; temperature: number }; invoke: (i: I, ctx: AgentContext) => Promise<{ output: O; metrics: { latencyMs: number; tokensIn: number; tokensOut: number; costUsd: number; retries: number } }> },
  input: I,
  ctx: AgentContext,
  state: OrchestratorState,
  emitter: OrchestratorEmitter | undefined,
): Promise<O> {
  emitter?.emitAgentEnter(agent.metadata.name);
  const ctxWithTrace: AgentContext = { ...ctx, toolTrace: [] };
  try {
    const { output, metrics } = await agent.invoke(input, ctxWithTrace);
    const trace: AgentTraceRecord = {
      agent: agent.metadata.name,
      model: agent.metadata.model,
      temperature: agent.metadata.temperature,
      tokensIn: metrics.tokensIn,
      tokensOut: metrics.tokensOut,
      latencyMs: metrics.latencyMs,
      costUsd: metrics.costUsd,
      inputPreview: isDemoMode ? previewForTrace(input) : null,
      outputPreview: isDemoMode ? previewForTrace(output) : null,
      toolCalls: ctxWithTrace.toolTrace ?? [],
      createdAt: Date.now(),
    };
    state.agentTraces.push(trace);
    state.totalCostUsd += metrics.costUsd;
    await sessionMemory.chargeBudget(state.input.sessionId, metrics.costUsd);
    emitter?.emitAgentExit(agent.metadata.name, metrics.latencyMs);
    return output;
  } catch (err) {
    const domain = toDomainError(err);
    state.agentTraces.push({
      agent: agent.metadata.name,
      model: agent.metadata.model,
      temperature: agent.metadata.temperature,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      costUsd: 0,
      inputPreview: previewForTrace(input),
      outputPreview: null,
      error: domain.message,
      toolCalls: ctxWithTrace.toolTrace ?? [],
      createdAt: Date.now(),
    });
    emitter?.emitAgentExit(agent.metadata.name, 0);
    throw err;
  }
}

// Re-export SseFrame so SSE endpoint can type its writes from the orchestrator package.
export type { SseFrame };
