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
    console.debug('=== mapStream开始处理流式响应 ===');

    // Tool calls can be streamed, so we need to accumulate the parts.
    const toolCallChunks: {
      [index: number]: {
        id: string;
        name: string;
        arguments: string;
      };
    } = {};

    let chunkCount = 0;
    let textChunkCount = 0;
    let toolCallChunkCount = 0;

    for await (const chunk of stream) {
      chunkCount++;
      console.debug(`--- 处理第${chunkCount}个chunk ---`);
      console.debug('chunk:', JSON.stringify(chunk, null, 2));

      const delta = chunk.choices[0]?.delta;

      if (!delta) {
        console.debug('chunk中没有delta，跳过');
        continue;
      }

      // 处理文本内容
      if (delta.content) {
        textChunkCount++;
        console.debug(
          `处理文本内容chunk #${textChunkCount}:`,
          delta.content,
        );
        const response = fromOpenAIStreamChunk(chunk);
        console.debug(
          '生成的文本response:',
          JSON.stringify(response, null, 2),
        );
        yield response;
      }

      // 处理tool_calls
      if (delta.tool_calls) {
        toolCallChunkCount++;
        console.debug(
          `处理tool_calls chunk #${toolCallChunkCount}:`,
          JSON.stringify(delta.tool_calls, null, 2),
        );

        for (const toolCall of delta.tool_calls) {
          if (toolCall.index === undefined) {
          
            continue;
          }

          const index = toolCall.index;
          const oldChunk = toolCallChunks[index];

          if (!toolCallChunks[index]) {
            toolCallChunks[index] = {
              id: toolCall.id ?? '',
              name: toolCall.function?.name ?? '',
              arguments: toolCall.function?.arguments ?? '',
            };
            
          } else {
            const newArgs = toolCall.function?.arguments ?? '';
            toolCallChunks[index].arguments += newArgs;
            console.debug(
              `累积toolCall[${index}] arguments: "${newArgs}" -> 总长度: ${toolCallChunks[index].arguments.length}`,
            );
          }

         
        }

        console.debug(
          '当前所有toolCallChunks状态:',
          JSON.stringify(toolCallChunks, null, 2),
        );
      }

      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason) {
        console.debug(`检测到finish_reason: ${finishReason}`);
      }

      if (finishReason === 'tool_calls') {
        console.debug('=== 开始构建最终tool_calls响应 ===');
        console.debug(
          '最终accumulated toolCallChunks:',
          JSON.stringify(toolCallChunks, null, 2),
        );

        try {
          const parts: Part[] = Object.values(toolCallChunks).map(
            (tc, index) => {
              console.debug(
                `解析toolCall[${index}] arguments: "${tc.arguments}"`,
              );
              let parsedArgs;
              try {
                parsedArgs = JSON.parse(tc.arguments);
                console.debug(
                  `成功解析toolCall[${index}] args:`,
                  JSON.stringify(parsedArgs),
                );
              } catch (parseError) {
                
           
                throw parseError;
              }

              return {
                functionCall: {
                  id: tc.id,
                  name: tc.name,
                  args: parsedArgs,
                },
              };
            },
          );

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

          console.debug(
            '构建的最终tool_calls响应:',
            JSON.stringify(response, null, 2),
          );
          yield response;
        } catch (error) {
         
          throw error;
        }
      }
    }

    console.debug(
      `=== mapStream处理完成，总计处理 ${chunkCount} 个chunks，其中文本chunks: ${textChunkCount}，tool_call chunks: ${toolCallChunkCount} ===`,
    );
  }

  async generateContentStream(
    req: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    console.debug('=== generateContentStream开始 ===');
    console.debug('原始Gemini请求:', JSON.stringify(req, null, 2));

    try {
      const openAIRequest = toOpenAIChatCompletionStreamingRequest(
        req,
        this.model,
      );
      console.debug('转换后的OpenAI流式请求已在converter中记录');

      console.debug('调用OpenAI API...');
      const stream = await this.openai.chat.completions.create(
        openAIRequest as ChatCompletionCreateParamsStreaming,
      );

      console.debug('OpenAI API调用成功，开始处理流式响应');
      return this.mapStream(stream);
    } catch (error) {
      
      throw error;
    }
  }

  async generateContent(
    req: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    console.debug('=== generateContent开始（非流式） ===');
    console.debug('原始Gemini请求:', JSON.stringify(req, null, 2));

    try {
      const openAIRequest = toOpenAIChatCompletionRequest(req, this.model);
      console.debug(
        '转换后的OpenAI请求:',
        JSON.stringify(openAIRequest, null, 2),
      );

      console.debug('调用OpenAI API（非流式）...');
      const completion =
        await this.openai.chat.completions.create(openAIRequest);

      console.debug('OpenAI API响应:', JSON.stringify(completion, null, 2));

      const response = fromOpenAIChatCompletionResponse(completion);
      console.debug(
        '转换后的Gemini响应:',
        JSON.stringify(response, null, 2),
      );

      return response;
    } catch (error) {
      
      throw error;
    }
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
