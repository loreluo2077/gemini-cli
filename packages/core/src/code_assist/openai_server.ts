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
    this.openai = new OpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
      ...httpOptions,
    });
  }

  private async *mapStream(
    stream: AsyncIterable<ChatCompletionChunk>,
  ): AsyncGenerator<GenerateContentResponse> {
    for await (const chunk of stream) {
      yield fromOpenAIStreamChunk(chunk);
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

//   const openaiServer = new OpenAICodeAssistServer('openai/gpt-4o');
//   const stream = await openaiServer.generateContentStream({
//     model: 'gpt-4',
//     contents: [{ role: 'user', parts: [{ text: 'Hello, how are you?' }] }],
//   });

//   for await (const chunk of stream) {
//     console.log(chunk);
//   }
// }

// main();
