/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Content,
  FinishReason,
  FunctionDeclaration,
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

function toOpenAITools(tools: Tool[]): ChatCompletionTool[] | undefined {
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
  console.debug('=== 开始转换Gemini请求到OpenAI流式请求 ===');

  const contents = req.contents as Content[];
  const messages: ChatCompletionMessageParam[] = [];

  for (let i = 0; i < contents.length; i++) {
    const content = contents[i];
    const role = (content.role ?? 'user') === 'model' ? 'assistant' : 'user';
    const parts = content.parts ?? [];

    console.debug(
      `content[${i}] role: ${content.role} -> ${role}, parts数量: ${parts.length}`,
    );

    // 先定义textContent
    const textContent = parts
      .filter((p) => 'text' in p)
      .map((p) => ('text' in p ? p.text : ''))
      .join('');

    if (textContent) {
      console.debug(
        `content[${i}] textContent: "${textContent.substring(0, 100)}${textContent.length > 100 ? '...' : ''}"`,
      );
    }

    // 检查是否有tool调用
    const functionCallParts = parts.filter((p) => 'functionCall' in p);
    if (functionCallParts.length > 0) {
      console.debug(
        `content[${i}] 包含${functionCallParts.length}个functionCall`,
      );
    }

    const toolCalls = functionCallParts.map((p) => {
      const funcCall = p.functionCall!;
      console.debug(
        `处理functionCall: name=${funcCall.name}, id=${funcCall.id}`,
      );

      return {
        role: 'assistant' as const,
        content: textContent || null,
        tool_calls: [
          {
            id: funcCall.id,
            type: 'function' as const,
            function: {
              name: funcCall.name || 'unknown_function',
              arguments: JSON.stringify(funcCall.args),
            },
          },
        ],
      } as ChatCompletionMessageParam;
    });

    if (toolCalls.length > 0) {
      console.debug(`添加${toolCalls.length}个tool_calls消息`);
      messages.push(...toolCalls);
    }

    // 检查是否有tool结果
    const functionResponseParts = parts.filter((p) => 'functionResponse' in p);
    if (functionResponseParts.length > 0) {
      console.debug(
        `content[${i}] 包含${functionResponseParts.length}个functionResponse`,
      );
    }

    const toolResults = functionResponseParts.map((p) => {
      const funcResponse = p.functionResponse!;
      console.debug(
        `处理functionResponse: name=${funcResponse.name}, id=${funcResponse.id}`,
      );

      return {
        role: 'tool' as const,
        tool_call_id: funcResponse.id,
        name: funcResponse.name,
        content:
          typeof funcResponse.response === 'string'
            ? funcResponse.response
            : JSON.stringify(funcResponse.response),
      } as ChatCompletionMessageParam;
    });

    if (toolResults.length > 0) {
      console.debug(`添加${toolResults.length}个tool结果消息`);
      messages.push(...toolResults);
    }

    // 如果既没有tool调用也没有tool结果，创建普通消息
    if (toolCalls.length === 0 && toolResults.length === 0 && textContent) {
      console.debug(`content[${i}] 创建普通文本消息`);
      messages.push({
        role: role as 'user' | 'assistant',
        content: textContent,
      });
    }
  }

  const openAITools = toOpenAITools(req.config?.tools as Tool[]);
  if (openAITools) {
    console.debug(`转换了${openAITools.length}个工具定义`);
  }

  const request = {
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

  console.debug(
    `最终OpenAI流式请求: 模型=${model}, 消息数=${messages.length}, 工具数=${openAITools?.length || 0}`,
  );


  return request as ChatCompletionCreateParamsStreaming;
}

export function toOpenAIChatCompletionRequest(
  req: GenerateContentParameters,
  model: string,
): ChatCompletionCreateParamsNonStreaming {
  console.debug('=== 开始转换Gemini请求到OpenAI非流式请求 ===');

  const contents = req.contents as Content[];
  const messages: ChatCompletionMessageParam[] = [];


  for (let i = 0; i < contents.length; i++) {

    const content = contents[i];
    const role = (content.role ?? 'user') === 'model' ? 'assistant' : 'user';
    const parts = content.parts ?? [];

   

    // 先定义textContent
    const textContent = parts
      .filter((p) => 'text' in p)
      .map((p) => ('text' in p ? p.text : ''))
      .join('');



    // 检查是否有tool调用
    const functionCallParts = parts.filter((p) => 'functionCall' in p);
   
    const toolCalls = functionCallParts.map((p) => {
      const funcCall = p.functionCall!;
      
      return {
        role: 'assistant' as const,
        content: textContent || null,
        tool_calls: [
          {
            id: funcCall.id,
            type: 'function' as const,
            function: {
              name: funcCall.name || 'unknown_function',
              arguments: JSON.stringify(funcCall.args),
            },
          },
        ],
      } as ChatCompletionMessageParam;
    });

    if (toolCalls.length > 0) {
      messages.push(...toolCalls);
    }

    // 检查是否有tool结果
    const functionResponseParts = parts.filter((p) => 'functionResponse' in p);
  

    const toolResults = functionResponseParts.map((p) => {
      const funcResponse = p.functionResponse!;
     
      return {
        role: 'tool' as const,
        tool_call_id: funcResponse.id,
        name: funcResponse.name,
        content:
          typeof funcResponse.response === 'string'
            ? funcResponse.response
            : JSON.stringify(funcResponse.response),
      } as ChatCompletionMessageParam;
    });

    if (toolResults.length > 0) {
    
      messages.push(...toolResults);
    }

    // 如果既没有tool调用也没有tool结果，创建普通消息
    if (toolCalls.length === 0 && toolResults.length === 0 && textContent) {

      messages.push({
        role: role as 'user' | 'assistant',
        content: textContent,
      });
    }
  }

  const openAITools = toOpenAITools(req.config?.tools as Tool[]);
  

  const request = {
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

  console.debug(
    `最终OpenAI非流式请求: 模型=${model}, 消息数=${messages.length}, 工具数=${openAITools?.length || 0}`,
  );
  return request as ChatCompletionCreateParamsNonStreaming;
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
  console.debug('=== 开始转换OpenAI响应到Gemini响应 ===');
  console.debug(`OpenAI响应包含${res.choices.length}个choices`);

  const response = new GenerateContentResponse();
  response.candidates = res.choices.map((choice, index) => {
   

    const parts: Part[] = [];
    if (choice.message.content) {
      console.debug(
        `choice[${index}] 包含文本内容: "${choice.message.content.substring(0, 100)}${choice.message.content.length > 100 ? '...' : ''}"`,
      );
      parts.push({ text: choice.message.content });
    }
    if (choice.message.tool_calls) {
      console.debug(
        `choice[${index}] 包含${choice.message.tool_calls.length}个tool_calls`,
      );
      choice.message.tool_calls.forEach((toolCall, tcIndex) => {
        console.debug(
          `tool_call[${tcIndex}]: id=${toolCall.id}, name=${toolCall.function.name}`,
        );
        parts.push({
          functionCall: {
            id: toolCall.id,
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
    console.debug(
      `usage: prompt_tokens=${res.usage.prompt_tokens}, completion_tokens=${res.usage.completion_tokens}, total_tokens=${res.usage.total_tokens}`,
    );
    response.usageMetadata = {
      promptTokenCount: res.usage.prompt_tokens,
      candidatesTokenCount: res.usage.completion_tokens,
      totalTokenCount: res.usage.total_tokens,
    };
  }

  console.debug('转换完成的Gemini响应:', JSON.stringify(response, null, 2));
  return response;
}

/**
 * Maps a streaming chunk from OpenAI to a Gemini GenerateContentResponse chunk.
 * 注意：这个函数只处理文本内容的chunk，tool_calls需要在accumulation完成后单独处理
 */
export function fromOpenAIStreamChunk(
  chunk: ChatCompletionChunk,
): GenerateContentResponse {
  console.debug('=== 转换OpenAI流式chunk到Gemini响应 ===');

  const response = new GenerateContentResponse();

  response.candidates = chunk.choices.map((choice, index) => {
    console.debug(
      `处理choice[${index}], finish_reason: ${choice.finish_reason}`,
    );

    const parts: Part[] = [];
    // 只处理文本内容，不处理tool_calls
    if (choice.delta.content) {
      console.debug(
        `choice[${index}] 包含文本内容: "${choice.delta.content}"`,
      );
      parts.push({ text: choice.delta.content });
    }
    // 移除tool_calls处理，因为在流式响应中arguments是不完整的
    // tool_calls将在openai_server.ts中的mapStream方法里正确accumulation后处理

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
  console.debug(
    '生成的流式chunk响应parts数量:',
    response.candidates[0]?.content?.parts?.length || 0,
  );
  return response;
}
