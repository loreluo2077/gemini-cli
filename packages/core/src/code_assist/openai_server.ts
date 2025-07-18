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
    this.openai = new OpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
      ...httpOptions,
    });
  }

  private async *mapStream(
    stream: AsyncIterable<ChatCompletionChunk>,
  ): AsyncGenerator<GenerateContentResponse> {
    studyLogger.info('=== mapStream开始处理流式响应 ===');

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
      studyLogger.info(`--- 处理第${chunkCount}个chunk ---`);
      studyLogger.info('chunk:', JSON.stringify(chunk, null, 2));

      const delta = chunk.choices[0]?.delta;

      if (!delta) {
        studyLogger.warn('chunk中没有delta，跳过');
        continue;
      }

      // 处理文本内容
      if (delta.content) {
        textChunkCount++;
        studyLogger.info(
          `处理文本内容chunk #${textChunkCount}:`,
          delta.content,
        );
        const response = fromOpenAIStreamChunk(chunk);
        studyLogger.info(
          '生成的文本response:',
          JSON.stringify(response, null, 2),
        );
        yield response;
      }

      // 处理tool_calls
      if (delta.tool_calls) {
        toolCallChunkCount++;
        studyLogger.info(
          `处理tool_calls chunk #${toolCallChunkCount}:`,
          JSON.stringify(delta.tool_calls, null, 2),
        );

        for (const toolCall of delta.tool_calls) {
          if (toolCall.index === undefined) {
            studyLogger.warn(
              'toolCall没有index，跳过:',
              JSON.stringify(toolCall),
            );
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
            studyLogger.info(
              `创建新的toolCall[${index}]:`,
              JSON.stringify(toolCallChunks[index]),
            );
          } else {
            const newArgs = toolCall.function?.arguments ?? '';
            toolCallChunks[index].arguments += newArgs;
            studyLogger.info(
              `累积toolCall[${index}] arguments: "${newArgs}" -> 总长度: ${toolCallChunks[index].arguments.length}`,
            );
          }

          studyLogger.info(
            `当前toolCall[${index}]状态:`,
            JSON.stringify(toolCallChunks[index]),
          );
        }

        studyLogger.info(
          '当前所有toolCallChunks状态:',
          JSON.stringify(toolCallChunks, null, 2),
        );
      }

      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason) {
        studyLogger.info(`检测到finish_reason: ${finishReason}`);
      }

      if (finishReason === 'tool_calls') {
        studyLogger.info('=== 开始构建最终tool_calls响应 ===');
        studyLogger.info(
          '最终accumulated toolCallChunks:',
          JSON.stringify(toolCallChunks, null, 2),
        );

        try {
          const parts: Part[] = Object.values(toolCallChunks).map(
            (tc, index) => {
              studyLogger.info(
                `解析toolCall[${index}] arguments: "${tc.arguments}"`,
              );
              let parsedArgs;
              try {
                parsedArgs = JSON.parse(tc.arguments);
                studyLogger.info(
                  `成功解析toolCall[${index}] args:`,
                  JSON.stringify(parsedArgs),
                );
              } catch (parseError) {
                studyLogger.error(
                  `解析toolCall[${index}] arguments失败:`,
                  parseError,
                );
                studyLogger.error(`原始arguments: "${tc.arguments}"`);
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

          studyLogger.info(
            '构建的最终tool_calls响应:',
            JSON.stringify(response, null, 2),
          );
          yield response;
        } catch (error) {
          studyLogger.error('构建tool_calls响应时出错:', error);
          throw error;
        }
      }
    }

    studyLogger.info(
      `=== mapStream处理完成，总计处理 ${chunkCount} 个chunks，其中文本chunks: ${textChunkCount}，tool_call chunks: ${toolCallChunkCount} ===`,
    );
  }

  async generateContentStream(
    req: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    studyLogger.info('=== generateContentStream开始 ===');
    studyLogger.info('原始Gemini请求:', JSON.stringify(req, null, 2));

    try {
      const openAIRequest = toOpenAIChatCompletionStreamingRequest(
        req,
        this.model,
      );
      studyLogger.info('转换后的OpenAI流式请求已在converter中记录');

      studyLogger.info('调用OpenAI API...');
      const stream = await this.openai.chat.completions.create(
        openAIRequest as ChatCompletionCreateParamsStreaming,
      );

      studyLogger.info('OpenAI API调用成功，开始处理流式响应');
      return this.mapStream(stream);
    } catch (error) {
      studyLogger.error('generateContentStream出错:', error);
      throw error;
    }
  }

  async generateContent(
    req: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    studyLogger.info('=== generateContent开始（非流式） ===');
    studyLogger.info('原始Gemini请求:', JSON.stringify(req, null, 2));

    try {
      const openAIRequest = toOpenAIChatCompletionRequest(req, this.model);
      studyLogger.info(
        '转换后的OpenAI请求:',
        JSON.stringify(openAIRequest, null, 2),
      );

      studyLogger.info('调用OpenAI API（非流式）...');
      const completion =
        await this.openai.chat.completions.create(openAIRequest);

      studyLogger.info('OpenAI API响应:', JSON.stringify(completion, null, 2));

      const response = fromOpenAIChatCompletionResponse(completion);
      studyLogger.info(
        '转换后的Gemini响应:',
        JSON.stringify(response, null, 2),
      );

      return response;
    } catch (error) {
      studyLogger.error('generateContent出错:', error);
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
