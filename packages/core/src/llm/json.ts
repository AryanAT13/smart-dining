/**
 * Structured-JSON extraction + repair.
 *
 * GPT-4o follows `response_format: { type: 'json_object' }` reliably, but the
 * occasional malformed response slips through (truncation, hallucinated
 * commas). We schema-validate every parsed object and run ONE repair retry
 * with a "fix this JSON to match this schema" prompt before giving up.
 *
 * The repair loop is the difference between a 95%-reliable agent and a
 * 99%-reliable one. Worth the extra ~200ms p99.
 */

import OpenAI from 'openai';
import { type ZodSchema, type ZodError, z } from 'zod';

import { ValidationError } from '../lib/errors.js';
import { childLogger } from '../lib/logger.js';

import { estimateCostUsd, openai, wrapOpenAiError } from './client.js';

const log = childLogger('llm-json');

export interface ChatJsonOptions<T> {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  userPrompt: string;
  schema: ZodSchema<T>;
  /** Optional examples appended to the system prompt for few-shot priming. */
  fewShot?: Array<{ user: string; assistant: string }>;
  /** Tool specs (per OpenAI function-calling shape) the model may emit. */
  tools?: OpenAI.ChatCompletionTool[];
  /** Force a particular tool — `null` for `auto`. */
  toolChoice?: OpenAI.ChatCompletionToolChoiceOption;
  /** Repair: number of additional attempts on schema-validation failure. */
  repairAttempts?: number;
}

export interface ChatJsonResult<T> {
  data: T;
  raw: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  toolCalls: Array<{ name: string; args: unknown }>;
}

export async function chatJson<T>(opts: ChatJsonOptions<T>): Promise<ChatJsonResult<T>> {
  const fewShotMessages: OpenAI.ChatCompletionMessageParam[] =
    opts.fewShot?.flatMap((ex) => [
      { role: 'user' as const, content: `<example_input>\n${ex.user}\n</example_input>` },
      { role: 'assistant' as const, content: ex.assistant },
    ]) ?? [];

  const baseMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: opts.systemPrompt },
    ...fewShotMessages,
    { role: 'user', content: `<user_message>\n${opts.userPrompt}\n</user_message>` },
  ];

  const repairAttempts = opts.repairAttempts ?? 1;

  let lastError: unknown = null;
  let lastRaw = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let messages = baseMessages;
  const toolCalls: Array<{ name: string; args: unknown }> = [];

  for (let attempt = 0; attempt <= repairAttempts; attempt++) {
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await openai.chat.completions.create({
        model: opts.model,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        messages,
        ...(opts.tools && opts.tools.length > 0
          ? { tools: opts.tools, tool_choice: opts.toolChoice ?? 'auto' }
          : { response_format: { type: 'json_object' } }),
      });
    } catch (err) {
      throw wrapOpenAiError(err, `chatJson(model=${opts.model})`);
    }

    tokensIn += completion.usage?.prompt_tokens ?? 0;
    tokensOut += completion.usage?.completion_tokens ?? 0;

    const choice = completion.choices[0];
    if (!choice) throw new ValidationError('Empty completion from LLM');

    // Tool calls supersede content. Surface them but still try to parse content.
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      for (const tc of choice.message.tool_calls) {
        let parsedArgs: unknown = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments || '{}');
        } catch {
          parsedArgs = { _raw: tc.function.arguments };
        }
        toolCalls.push({ name: tc.function.name, args: parsedArgs });
      }
    }

    const content = choice.message.content ?? '';
    lastRaw = content;

    if (!content && toolCalls.length > 0) {
      // Pure tool-call response — caller handles tool dispatch and re-asks.
      // Return an empty object validated against schema if it allows it.
      const empty = opts.schema.safeParse({});
      if (empty.success) {
        return {
          data: empty.data,
          raw: '',
          tokensIn,
          tokensOut,
          costUsd: estimateCostUsd(opts.model, tokensIn, tokensOut),
          toolCalls,
        };
      }
    }

    const parsed = tryParseAndValidate(content, opts.schema);
    if (parsed.ok) {
      return {
        data: parsed.value,
        raw: content,
        tokensIn,
        tokensOut,
        costUsd: estimateCostUsd(opts.model, tokensIn, tokensOut),
        toolCalls,
      };
    }

    lastError = parsed.error;
    log.warn(
      { attempt, error: summarizeError(parsed.error), raw: content.slice(0, 200) },
      'json validation failed; preparing repair attempt',
    );

    // Build repair prompt for the next loop iteration.
    messages = [
      ...baseMessages,
      { role: 'assistant', content },
      {
        role: 'user',
        content:
          `Your previous response did not match the required JSON schema. ` +
          `Fix the issues below and respond with valid JSON only. Do not include any prose.\n\n` +
          `Issues:\n${summarizeError(parsed.error)}`,
      },
    ];
  }

  throw new ValidationError(`Schema validation failed after ${repairAttempts + 1} attempts`, {
    raw: lastRaw.slice(0, 400),
    lastError: summarizeError(lastError),
  });
}

function tryParseAndValidate<T>(
  raw: string,
  schema: ZodSchema<T>,
): { ok: true; value: T } | { ok: false; error: unknown } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: err };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) return { ok: false, error: result.error };
  return { ok: true, value: result.data };
}

function summarizeError(err: unknown): string {
  if (!err) return 'unknown error';
  if (err instanceof z.ZodError) {
    return err.issues.map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export type { ZodError };
