/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import {
  CoreToolScheduler,
  ToolCall,
  ValidatingToolCall,
} from './coreToolScheduler.js';
import {
  BaseTool,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolResult,
  Config,
} from '../index.js';
import { Part, PartListUnion } from '@google/genai';
import { convertToFunctionResponse } from './coreToolScheduler.js';

/**
 * 模拟工具类 - 用于测试 CoreToolScheduler
 * 这个类模拟了真实工具的行为，包括确认和执行功能
 * 
 * 该类继承自 BaseTool 并实现了必要的接口方法
 * 提供了配置选项，可以控制是否需要用户确认
 */
class MockTool extends BaseTool<Record<string, unknown>, ToolResult> {
  shouldConfirm = false; // 是否需要用户确认
  executeFn = vi.fn(); // 模拟执行函数，用于验证调用

  constructor(name = 'mockTool') {
    super(name, name, 'A mock tool', {});
  }

  /**
   * 模拟工具确认执行方法
   * 根据 shouldConfirm 标志决定是否需要用户确认
   * 
   * @param _params - 工具执行参数
   * @param _abortSignal - 中断信号
   * @returns 如果需要确认，返回确认详情对象；否则返回 false
   */
  async shouldConfirmExecute(
    _params: Record<string, unknown>,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.shouldConfirm) {
      return {
        type: 'exec',
        title: 'Confirm Mock Tool',
        command: 'do_thing',
        rootCommand: 'do_thing',
        onConfirm: async () => {},
      };
    }
    return false; // 不需要确认
  }

  /**
   * 模拟工具执行方法
   * 记录执行调用并返回模拟结果
   * 
   * @param params - 工具执行参数
   * @param _abortSignal - 中断信号
   * @returns 工具执行结果
   */
  async execute(
    params: Record<string, unknown>,
    _abortSignal: AbortSignal,
  ): Promise<ToolResult> {
    this.executeFn(params); // 记录执行调用
    return { llmContent: 'Tool executed', returnDisplay: 'Tool executed' };
  }
}

describe('CoreToolScheduler', () => {
  /**
   * 测试场景：当信号在确认之前被中断时，工具调用应该被取消
   * 
   * 这个测试验证了 CoreToolScheduler 的取消机制：
   * 1. 创建一个需要确认的模拟工具
   * 2. 在用户确认之前中断信号
   * 3. 验证工具调用被正确取消
   */
  it('should cancel a tool call if the signal is aborted before confirmation', async () => {
    // 创建模拟工具并设置为需要确认
    const mockTool = new MockTool();
    mockTool.shouldConfirm = true;
    
    // 创建模拟工具注册表
    const toolRegistry = {
      getTool: () => mockTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {} as any,
      registerTool: () => {},
      getToolByName: () => mockTool,
      getToolByDisplayName: () => mockTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    };

    // 创建回调函数用于验证结果
    const onAllToolCallsComplete = vi.fn(); // 所有工具调用完成时的回调
    const onToolCallsUpdate = vi.fn(); // 工具调用状态更新时的回调

    // 创建模拟配置
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
    } as unknown as Config;

    // 创建 CoreToolScheduler 实例
    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      toolRegistry: Promise.resolve(toolRegistry as any),
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    // 创建中断控制器和工具调用请求
    const abortController = new AbortController();
    const request = {
      callId: '1',
      name: 'mockTool',
      args: {},
      isClientInitiated: false,
    };

    // 立即中断信号 - 模拟用户在确认之前取消操作
    abortController.abort();
    
    // 调度工具调用
    await scheduler.schedule([request], abortController.signal);

    // 获取等待确认的工具调用
    const _waitingCall = onToolCallsUpdate.mock
      .calls[1][0][0] as ValidatingToolCall;
    
    // 模拟工具的确认执行检查
    const confirmationDetails = await mockTool.shouldConfirmExecute(
      {},
      abortController.signal,
    );
    
    // 如果工具需要确认，处理确认响应
    if (confirmationDetails) {
      await scheduler.handleConfirmationResponse(
        '1',
        confirmationDetails.onConfirm,
        ToolConfirmationOutcome.ProceedOnce,
        abortController.signal,
      );
    }

    // 验证所有工具调用完成回调被调用
    expect(onAllToolCallsComplete).toHaveBeenCalled();
    
    // 验证完成的调用状态为 'cancelled'
    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls[0].status).toBe('cancelled');
  });
});

describe('convertToFunctionResponse', () => {
  const toolName = 'testTool';
  const callId = 'call1';

  /**
   * 测试：处理简单的字符串内容
   * 验证字符串类型的 llmContent 能正确转换为函数响应格式
   */
  it('should handle simple string llmContent', () => {
    const llmContent = 'Simple text output';
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: 'Simple text output' },
      },
    });
  });

  /**
   * 测试：处理单个包含文本的 Part 对象
   * 验证 Part 对象中的文本内容能正确提取
   */
  it('should handle llmContent as a single Part with text', () => {
    const llmContent: Part = { text: 'Text from Part object' };
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: 'Text from Part object' },
      },
    });
  });

  /**
   * 测试：处理包含单个文本 Part 的数组
   * 验证 PartListUnion 数组中单个文本 Part 的处理
   */
  it('should handle llmContent as a PartListUnion array with a single text Part', () => {
    const llmContent: PartListUnion = [{ text: 'Text from array' }];
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: 'Text from array' },
      },
    });
  });

  /**
   * 测试：处理内联数据（如图片）
   * 验证包含 inlineData 的 Part 对象能正确处理
   * 对于二进制数据，会生成描述性文本而不是原始数据
   */
  it('should handle llmContent with inlineData', () => {
    const llmContent: Part = {
      inlineData: { mimeType: 'image/png', data: 'base64...' },
    };
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual([
      {
        functionResponse: {
          name: toolName,
          id: callId,
          response: {
            output: 'Binary content of type image/png was processed.',
          },
        },
      },
      llmContent, // 原始数据仍然保留
    ]);
  });

  /**
   * 测试：处理文件数据
   * 验证包含 fileData 的 Part 对象能正确处理
   * 对于文件数据，同样生成描述性文本
   */
  it('should handle llmContent with fileData', () => {
    const llmContent: Part = {
      fileData: { mimeType: 'application/pdf', fileUri: 'gs://...' },
    };
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual([
      {
        functionResponse: {
          name: toolName,
          id: callId,
          response: {
            output: 'Binary content of type application/pdf was processed.',
          },
        },
      },
      llmContent, // 原始数据仍然保留
    ]);
  });

  /**
   * 测试：处理包含多个 Part 的数组（文本和内联数据混合）
   * 验证复杂内容结构的处理
   * 当包含多种类型的内容时，使用通用成功消息
   */
  it('should handle llmContent as an array of multiple Parts (text and inlineData)', () => {
    const llmContent: PartListUnion = [
      { text: 'Some textual description' },
      { inlineData: { mimeType: 'image/jpeg', data: 'base64data...' } },
      { text: 'Another text part' },
    ];
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual([
      {
        functionResponse: {
          name: toolName,
          id: callId,
          response: { output: 'Tool execution succeeded.' },
        },
      },
      ...llmContent, // 保留所有原始内容
    ]);
  });

  /**
   * 测试：处理只包含内联数据的数组
   * 验证数组中单个二进制数据的处理
   */
  it('should handle llmContent as an array with a single inlineData Part', () => {
    const llmContent: PartListUnion = [
      { inlineData: { mimeType: 'image/gif', data: 'gifdata...' } },
    ];
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual([
      {
        functionResponse: {
          name: toolName,
          id: callId,
          response: {
            output: 'Binary content of type image/gif was processed.',
          },
        },
      },
      ...llmContent, // 保留原始数据
    ]);
  });

  /**
   * 测试：处理通用 Part 对象（非文本、内联数据或文件数据）
   * 验证未知类型的 Part 对象的默认处理
   */
  it('should handle llmContent as a generic Part (not text, inlineData, or fileData)', () => {
    const llmContent: Part = { functionCall: { name: 'test', args: {} } };
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: 'Tool execution succeeded.' },
      },
    });
  });

  /**
   * 测试：处理空字符串内容
   * 验证空字符串能正确处理
   */
  it('should handle empty string llmContent', () => {
    const llmContent = '';
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: '' },
      },
    });
  });

  /**
   * 测试：处理空数组
   * 验证空数组能正确处理，使用默认成功消息
   */
  it('should handle llmContent as an empty array', () => {
    const llmContent: PartListUnion = [];
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual([
      {
        functionResponse: {
          name: toolName,
          id: callId,
          response: { output: 'Tool execution succeeded.' },
        },
      },
    ]);
  });

  /**
   * 测试：处理空的 Part 对象
   * 验证没有明确内容类型的 Part 对象的默认处理
   */
  it('should handle llmContent as a Part with undefined inlineData/fileData/text', () => {
    const llmContent: Part = {}; // 空的 Part 对象
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: 'Tool execution succeeded.' },
      },
    });
  });
});
