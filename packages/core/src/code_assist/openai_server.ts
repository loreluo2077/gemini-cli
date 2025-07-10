/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenAI } from 'openai';
import {
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentResponse,
  EmbedContentParameters,
  Part,
  FinishReason,
} from '@google/genai';
import {
  toOpenAIChatCompletionRequest,
  fromOpenAIChatCompletionResponse,
  fromOpenAIStreamChunk,
  toOpenAIChatCompletionStreamingRequest,
} from './openai_converter.js';
import {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionCreateParamsNonStreaming,
} from 'openai/resources/chat/completions';
import { ContentGenerator } from '../core/contentGenerator.js';
import { Content } from '@google/genai';
import dotenv from 'dotenv';
import { studyLogger } from '../utils/studyLoggerUtil.js';

/** HTTP options to be used in each of the requests. */
export interface HttpOptions {
  /** Additional HTTP headers to be sent with the request. */
  headers?: Record<string, string>;
}

export class OpenAICodeAssistServer implements ContentGenerator {
  private readonly openai: OpenAI;
  constructor(
    readonly model: string,
    readonly httpOptions: HttpOptions = {},
  ) {
    studyLogger.info('初始化OpenAICodeAssistServer配置', {
      model,
      httpOptions,
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.openai = new OpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
      ...httpOptions,
    });
  }

  private async *mapStream(
    stream: AsyncIterable<ChatCompletionChunk>,
  ): AsyncGenerator<GenerateContentResponse> {
    // Tool calls can be streamed, so we need to accumulate the parts.
    const toolCallChunks: {
      [index: number]: {
        id: string;
        name: string;
        arguments: string;
      };
    } = {};

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) {
        continue;
      }

      if (delta.content) {
        // Yield text content as it comes.
        yield fromOpenAIStreamChunk(chunk);
      }

      if (delta.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          if (toolCall.index === undefined) {
            continue;
          }
          const index = toolCall.index;
          if (!toolCallChunks[index]) {
            toolCallChunks[index] = {
              id: toolCall.id ?? '',
              name: toolCall.function?.name ?? '',
              arguments: toolCall.function?.arguments ?? '',
            };
          } else {
            toolCallChunks[index].arguments +=
              toolCall.function?.arguments ?? '';
          }
        }
      }

      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason === 'tool_calls') {
        const parts: Part[] = Object.values(toolCallChunks).map((tc) => {
          return {
            functionCall: {
              name: tc.name,
              args: JSON.parse(tc.arguments),
            },
          };
        });

        const response = new GenerateContentResponse();
        response.candidates = [
          {
            index: 0,
            finishReason: 'TOOL_CALL' as FinishReason,
            content: {
              role: 'model',
              parts,
            },
          },
        ];
        yield response;
      }
    }
  }

  async generateContentStream(
    req: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const stream = await this.openai.chat.completions.create(
      toOpenAIChatCompletionStreamingRequest(
        req,
        this.model,
      ) as ChatCompletionCreateParamsStreaming,
    );

    return this.mapStream(stream);
  }

  async generateContent(
    req: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const completion = await this.openai.chat.completions.create(
      toOpenAIChatCompletionRequest(req, this.model),
    );
    return fromOpenAIChatCompletionResponse(completion);
  }

  async countTokens(req: CountTokensParameters): Promise<CountTokensResponse> {
    // NOTE: This is a simplified temporary implementation.
    // It estimates tokens based on character count (4 chars = 1 token).
    const contents = req.contents as Content[];
    const textToTokenize = contents
      .map((c) => (c.parts ?? []).map((p) => p.text ?? '').join(''))
      .join('\n');

    const totalTokens = Math.ceil(textToTokenize.length / 4);

    return {
      totalTokens,
    };
  }

  async embedContent(
    _req: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw Error();
  }
}

// async function main() {
//   dotenv.config();

//   const openaiServer = new OpenAICodeAssistServer(
//     process.env.OPENAI_MODEL ?? 'openai/gpt-4o',
//   );
//   const stream = await openaiServer.generateContentStream({
//     model: process.env.OPENAI_MODEL ?? 'openai/gpt-4o',
//     contents: [{ role: 'user', parts: [{ text: 'Hello, how are you?' }] }],
//   });

//   let str = '';
//   for await (const chunk of stream) {
//     str += chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
//   }
//   console.log(str);
// }

// main();
