/**
 * Canonical intent and agent identifiers.
 *
 * Owned by `@smart-dining/shared` because they cross every process boundary:
 * the router emits an intent, the orchestrator dispatches to an agent, the
 * trace UI displays both, and the eval harness asserts on both.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Intents — output of the router agent (see ADR-001)
// ---------------------------------------------------------------------------

export const IntentSchema = z.enum([
  'GREET', // first-message hand-off to greeter
  'RECOMMEND', // user wants a suggestion
  'ADD_ITEM', // user wants something added to cart
  'REMOVE_ITEM', // user wants to remove from cart
  'UPDATE_QTY', // user wants to change a quantity
  'UPSELL_CHECK', // triggered by cart events, not user messages
  'GROUP_MERGE', // multi-person intent ("we are 4 people, mix veg and non-veg")
  'CHECKOUT', // user is ready to place the order
  'CLARIFY', // ambiguous; ask one short follow-up
  'FALLBACK', // route to general LLM with menu context injected
]);

export type Intent = z.infer<typeof IntentSchema>;

// ---------------------------------------------------------------------------
// Agent names — one per file under packages/core/src/agents/
// ---------------------------------------------------------------------------

export const AgentNameSchema = z.enum([
  'multilingualNLU',
  'router',
  'greeter',
  'recommendation',
  'upsell',
  'contextMemory',
  'groupCoordinator',
  'sentiment',
  'orderValidation',
]);

export type AgentName = z.infer<typeof AgentNameSchema>;

// ---------------------------------------------------------------------------
// Language detection (output of the multilingual NLU agent)
// ---------------------------------------------------------------------------

export const LanguageSchema = z.enum(['en', 'hinglish', 'telugu-english']);
export type Language = z.infer<typeof LanguageSchema>;

// ---------------------------------------------------------------------------
// Sentiment classification
// ---------------------------------------------------------------------------

export const SentimentSchema = z.enum(['positive', 'neutral', 'negative', 'confused']);
export type Sentiment = z.infer<typeof SentimentSchema>;

export const SentimentActionSchema = z.enum(['continue', 'rephrase', 'escalate']);
export type SentimentAction = z.infer<typeof SentimentActionSchema>;
