/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Content,
  FinishReason,
  GenerateContentParameters,
  GenerateContentResponse,
  Part,
  Tool,
} from '@google/genai';
import {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';

function toOpenAITools(tools?: Tool[]): ChatCompletionTool[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }
  const openAITools: ChatCompletionTool[] = [];
  for (const tool of tools) {
    if (tool.functionDeclarations) {
      for (const func of tool.functionDeclarations) {
        openAITools.push({
          type: 'function',
          function: {
            name: func.name ?? '',
            description: func.description ?? '',
            parameters: func.parameters as any,
          },
        });
      }
    }
  }
  return openAITools;
}

/**
 * Maps the Gemini GenerateContentParameters to OpenAI's ChatCompletionCreateParams.
 * NOTE: This is a simplified implementation and only handles `Content[]`.
 * It does not handle `string` or `Part[]` inputs for `contents`.
 */
export function toOpenAIChatCompletionStreamingRequest(
  req: GenerateContentParameters,
  model: string,
): ChatCompletionCreateParamsStreaming {
  const messages: ChatCompletionMessageParam[] = (
    req.contents as Content[]
  ).map((content) => {
    return {
      role: (content.role ?? 'user') === 'model' ? 'assistant' : 'user',
      content: (content.parts ?? [])
        .map((p) => ('text' in p ? p.text : ''))
        .join(''),
    };
  });

  const openAITools = toOpenAITools((req as any).tools as Tool[]);
  return {
    model: model,
    messages: messages,
    stream: true,
    temperature: req.config?.temperature,
    top_p: req.config?.topP,
    max_tokens: req.config?.maxOutputTokens,
    stop: req.config?.stopSequences,
    tools: openAITools,
    tool_choice: openAITools ? 'auto' : undefined,
  };
}

export function toOpenAIChatCompletionRequest(
  req: GenerateContentParameters,
  model: string,
): ChatCompletionCreateParamsNonStreaming {
  const messages: ChatCompletionMessageParam[] = (
    req.contents as Content[]
  ).map((content) => {
    return {
      role: (content.role ?? 'user') === 'model' ? 'assistant' : 'user',
      content: (content.parts ?? [])
        .map((p) => ('text' in p ? p.text : ''))
        .join(''),
    };
  });

  const openAITools = toOpenAITools((req as any).tools as Tool[]);
  return {
    model: model,
    messages: messages,
    stream: false,
    temperature: req.config?.temperature,
    top_p: req.config?.topP,
    max_tokens: req.config?.maxOutputTokens,
    stop: req.config?.stopSequences,
    tools: openAITools,
    tool_choice: openAITools ? 'auto' : undefined,
  };
}

function toGeminiFinishReason(
  reason: string | null | undefined,
): FinishReason | undefined {
  if (!reason) return undefined;
  const upperReason = reason.toUpperCase();
  switch (upperReason) {
    case 'STOP':
      return 'STOP' as FinishReason;
    case 'LENGTH':
      return 'MAX_TOKENS' as FinishReason;
    case 'CONTENT_FILTER':
      return 'SAFETY' as FinishReason;
    case 'TOOL_CALLS':
      return 'TOOL_CALL' as FinishReason;
    default:
      return 'OTHER' as FinishReason;
  }
}

/**
 * Maps an OpenAI ChatCompletion response back to a Gemini GenerateContentResponse.
 */
export function fromOpenAIChatCompletionResponse(
  res: ChatCompletion,
): GenerateContentResponse {
  const response = new GenerateContentResponse();
  response.candidates = res.choices.map((choice) => {
    const parts: Part[] = [];
    if (choice.message.content) {
      parts.push({ text: choice.message.content });
    }
    if (choice.message.tool_calls) {
      choice.message.tool_calls.forEach((toolCall) => {
        parts.push({
          functionCall: {
            name: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments),
          },
        });
      });
    }
    return {
      index: choice.index,
      finishReason: toGeminiFinishReason(choice.finish_reason),
      content: {
        role: 'model',
        parts,
      },
      // safetyRatings are not available in OpenAI's API and will be omitted.
    };
  });
  if (res.usage) {
    response.usageMetadata = {
      promptTokenCount: res.usage.prompt_tokens,
      candidatesTokenCount: res.usage.completion_tokens,
      totalTokenCount: res.usage.total_tokens,
    };
  }
  return response;
}

/**
 * Maps a streaming chunk from OpenAI to a Gemini GenerateContentResponse chunk.
 */
export function fromOpenAIStreamChunk(
  chunk: ChatCompletionChunk,
): GenerateContentResponse {
  const response = new GenerateContentResponse();
  response.candidates = chunk.choices.map((choice) => {
    const parts: Part[] = [];
    if (choice.delta.content) {
      parts.push({ text: choice.delta.content });
    }
    // Note: tool calls from streaming will be handled in the server
    // due to the need for stateful aggregation.
    return {
      index: choice.index,
      finishReason: toGeminiFinishReason(choice.finish_reason),
      content: {
        role: 'model',
        parts,
      },
    };
  });
  // Usage metadata is typically not present in stream chunks until the end.
  return response;
}
