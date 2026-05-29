/**
 * Streaming-aware LLM call. Yields tokens as they arrive plus a final
 * accumulated string. The orchestrator turns these into SSE frames.
 */

import OpenAI from 'openai';

import { estimateCostUsd, openai, wrapOpenAiError } from './client.js';

export interface StreamChatOptions {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  userPrompt: string;
}

export interface StreamChatResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export async function* streamChat(
  opts: StreamChatOptions,
): AsyncGenerator<string, StreamChatResult, void> {
  let stream: AsyncIterable<OpenAI.ChatCompletionChunk>;
  try {
    stream = await openai.chat.completions.create({
      model: opts.model,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: `<user_message>\n${opts.userPrompt}\n</user_message>` },
      ],
      stream: true,
      stream_options: { include_usage: true },
    });
  } catch (err) {
    throw wrapOpenAiError(err, `streamChat(model=${opts.model})`);
  }

  let text = '';
  let tokensIn = 0;
  let tokensOut = 0;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      text += delta;
      yield delta;
    }
    if (chunk.usage) {
      tokensIn = chunk.usage.prompt_tokens;
      tokensOut = chunk.usage.completion_tokens;
    }
  }

  return {
    text,
    tokensIn,
    tokensOut,
    costUsd: estimateCostUsd(opts.model, tokensIn, tokensOut),
  };
}
