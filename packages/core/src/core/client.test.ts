/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  Chat,
  EmbedContentResponse,
  GenerateContentResponse,
  GoogleGenAI,
} from '@google/genai';
import { GeminiClient } from './client.js';
import { AuthType, ContentGenerator } from './contentGenerator.js';
import { GeminiChat } from './geminiChat.js';
import { Config } from '../config/config.js';
import { Turn } from './turn.js';
import { getCoreSystemPrompt } from './prompts.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { setSimulate429 } from '../utils/testUtils.js';

// --- Mocks --- (模拟对象)
const mockChatCreateFn = vi.fn();
const mockGenerateContentFn = vi.fn();
const mockEmbedContentFn = vi.fn();
const mockTurnRunFn = vi.fn();

vi.mock('@google/genai');
vi.mock('./turn', () => {
  // Define a mock class that has the same shape as the real Turn
  class MockTurn {
    pendingToolCalls = [];
    // The run method is a property that holds our mock function
    run = mockTurnRunFn;

    constructor() {
      // The constructor can be empty or do some mock setup
    }
  }
  // Export the mock class as 'Turn'
  return { Turn: MockTurn };
});

vi.mock('../config/config.js');
vi.mock('./prompts');
vi.mock('../utils/getFolderStructure', () => ({
  getFolderStructure: vi.fn().mockResolvedValue('Mock Folder Structure'),
}));
vi.mock('../utils/errorReporting', () => ({ reportError: vi.fn() }));
vi.mock('../utils/nextSpeakerChecker', () => ({
  checkNextSpeaker: vi.fn().mockResolvedValue(null),
}));
vi.mock('../utils/generateContentResponseUtilities', () => ({
  getResponseText: (result: GenerateContentResponse) =>
    result.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') ||
    undefined,
}));
vi.mock('../telemetry/index.js', () => ({
  logApiRequest: vi.fn(),
  logApiResponse: vi.fn(),
  logApiError: vi.fn(),
}));

/**
 * 测试套件：Gemini 客户端 (client.ts)
 * 测试 GeminiClient 类的功能，包括其与 Gemini API 的交互
 */
describe('Gemini Client (client.ts)', () => {
  let client: GeminiClient;
  /**
   * 测试前置设置
   * 重置所有模拟，配置测试环境，初始化客户端
   */
  beforeEach(async () => {
    vi.resetAllMocks();

    // Disable 429 simulation for tests
    setSimulate429(false);

    // Set up the mock for GoogleGenAI constructor and its methods
    const MockedGoogleGenAI = vi.mocked(GoogleGenAI);
    MockedGoogleGenAI.mockImplementation(() => {
      const mock = {
        chats: { create: mockChatCreateFn },
        models: {
          generateContent: mockGenerateContentFn,
          embedContent: mockEmbedContentFn,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return mock as any;
    });

    mockChatCreateFn.mockResolvedValue({} as Chat);
    mockGenerateContentFn.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: '{"key": "value"}' }],
          },
        },
      ],
    } as unknown as GenerateContentResponse);

    // Because the GeminiClient constructor kicks off an async process (startChat)
    // that depends on a fully-formed Config object, we need to mock the
    // entire implementation of Config for these tests.
    const mockToolRegistry = {
      getFunctionDeclarations: vi.fn().mockReturnValue([]),
      getTool: vi.fn().mockReturnValue(null),
    };
    const fileService = new FileDiscoveryService('/test/dir');
    const MockedConfig = vi.mocked(Config, true);
    const contentGeneratorConfig = {
      model: 'test-model',
      apiKey: 'test-key',
      vertexai: false,
      authType: AuthType.USE_GEMINI,
    };
    MockedConfig.mockImplementation(() => {
      const mock = {
        getContentGeneratorConfig: vi
          .fn()
          .mockReturnValue(contentGeneratorConfig),
        getToolRegistry: vi.fn().mockResolvedValue(mockToolRegistry),
        getModel: vi.fn().mockReturnValue('test-model'),
        getEmbeddingModel: vi.fn().mockReturnValue('test-embedding-model'),
        getApiKey: vi.fn().mockReturnValue('test-key'),
        getVertexAI: vi.fn().mockReturnValue(false),
        getUserAgent: vi.fn().mockReturnValue('test-agent'),
        getUserMemory: vi.fn().mockReturnValue(''),
        getFullContext: vi.fn().mockReturnValue(false),
        getSessionId: vi.fn().mockReturnValue('test-session-id'),
        getProxy: vi.fn().mockReturnValue(undefined),
        getWorkingDir: vi.fn().mockReturnValue('/test/dir'),
        getFileService: vi.fn().mockReturnValue(fileService),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return mock as any;
    });

    // We can instantiate the client here since Config is mocked
    // and the constructor will use the mocked GoogleGenAI
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockConfig = new Config({} as any);
    client = new GeminiClient(mockConfig);
    await client.initialize(contentGeneratorConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * 注意：由于模拟 @google/genai 库存在持续问题，以下测试被移除
   * 问题在于 GeminiClient 实例内部使用的模拟 GoogleGenerativeAI 实例
   * 无法正确跟踪其方法调用
   * 
   * 具体而言，mockChatCreateFn（代表 instance.chats.create）
   * 没有被检测为被 GeminiClient 实例调用
   * 
   * 这可能指向 GoogleGenerativeAI 类构造函数及其实例方法的模拟方式存在微妙问题
   * 
   * 未来调试时，确保 GeminiClient 中的 this.client（模拟的 GoogleGenerativeAI 实例）
   * 正确地将其 chats.create 方法指向 mockChatCreateFn
   */
  // NOTE: The following tests for startChat were removed due to persistent issues with
  // the @google/genai mock. Specifically, the mockChatCreateFn (representing instance.chats.create)
  // was not being detected as called by the GeminiClient instance.
  // This likely points to a subtle issue in how the GoogleGenerativeAI class constructor
  // and its instance methods are mocked and then used by the class under test.
  // For future debugging, ensure that the `this.client` in `GeminiClient` (which is an
  // instance of the mocked GoogleGenerativeAI) correctly has its `chats.create` method
  // pointing to `mockChatCreateFn`.
  // it('startChat should call getCoreSystemPrompt with userMemory and pass to chats.create', async () => { ... });
  // it('startChat should call getCoreSystemPrompt with empty string if userMemory is empty', async () => { ... });

  // NOTE: The following tests for generateJson were removed due to persistent issues with
  // the @google/genai mock, similar to the startChat tests. The mockGenerateContentFn
  // (representing instance.models.generateContent) was not being detected as called, or the mock
  // was not preventing an actual API call (leading to API key errors).
  // For future debugging, ensure `this.client.models.generateContent` in `GeminiClient` correctly
  // uses the `mockGenerateContentFn`.
  // it('generateJson should call getCoreSystemPrompt with userMemory and pass to generateContent', async () => { ... });
  // it('generateJson should call getCoreSystemPrompt with empty string if userMemory is empty', async () => { ... });

  /**
   * 测试套件：generateEmbedding 方法
   * 测试生成文本嵌入向量的功能
   */
  describe('generateEmbedding', () => {
    const texts = ['hello world', 'goodbye world'];
    const testEmbeddingModel = 'test-embedding-model';

    /**
     * 测试：使用正确参数调用 embedContent 并返回嵌入向量
     * 验证方法传递正确参数给 API 并正确处理返回结果
     */
    it('should call embedContent with correct parameters and return embeddings', async () => {
      const mockEmbeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ];
      const mockResponse: EmbedContentResponse = {
        embeddings: [
          { values: mockEmbeddings[0] },
          { values: mockEmbeddings[1] },
        ],
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);

      const result = await client.generateEmbedding(texts);

      expect(mockEmbedContentFn).toHaveBeenCalledTimes(1);
      expect(mockEmbedContentFn).toHaveBeenCalledWith({
        model: testEmbeddingModel,
        contents: texts,
      });
      expect(result).toEqual(mockEmbeddings);
    });

    /**
     * 测试：传入空数组时返回空数组
     * 验证方法对边界情况的处理
     */
    it('should return an empty array if an empty array is passed', async () => {
      const result = await client.generateEmbedding([]);
      expect(result).toEqual([]);
      expect(mockEmbedContentFn).not.toHaveBeenCalled();
    });

    /**
     * 测试：API 响应没有 embeddings 数组时抛出错误
     * 验证错误处理机制
     */
    it('should throw an error if API response has no embeddings array', async () => {
      mockEmbedContentFn.mockResolvedValue({} as EmbedContentResponse); // No `embeddings` key

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'No embeddings found in API response.',
      );
    });

    /**
     * 测试：API 响应有空 embeddings 数组时抛出错误
     * 验证错误处理机制
     */
    it('should throw an error if API response has an empty embeddings array', async () => {
      const mockResponse: EmbedContentResponse = {
        embeddings: [],
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);
      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'No embeddings found in API response.',
      );
    });

    /**
     * 测试：API 返回的嵌入向量数量不匹配时抛出错误
     * 验证输入和输出一致性检查
     */
    it('should throw an error if API returns a mismatched number of embeddings', async () => {
      const mockResponse: EmbedContentResponse = {
        embeddings: [{ values: [1, 2, 3] }], // Only one for two texts
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API returned a mismatched number of embeddings. Expected 2, got 1.',
      );
    });

    /**
     * 测试：任何嵌入向量有空值时抛出错误
     * 验证数据完整性检查
     */
    it('should throw an error if any embedding has nullish values', async () => {
      const mockResponse: EmbedContentResponse = {
        embeddings: [{ values: [1, 2, 3] }, { values: undefined }], // Second one is bad
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API returned an empty embedding for input text at index 1: "goodbye world"',
      );
    });

    /**
     * 测试：任何嵌入向量有空数组时抛出错误
     * 验证数据有效性检查
     */
    it('should throw an error if any embedding has an empty values array', async () => {
      const mockResponse: EmbedContentResponse = {
        embeddings: [{ values: [] }, { values: [1, 2, 3] }], // First one is bad
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API returned an empty embedding for input text at index 0: "hello world"',
      );
    });

    /**
     * 测试：传播 API 调用的错误
     * 验证错误传播机制
     */
    it('should propagate errors from the API call', async () => {
      const apiError = new Error('API Failure');
      mockEmbedContentFn.mockRejectedValue(apiError);

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API Failure',
      );
    });
  });

  /**
   * 测试套件：generateContent 方法
   * 测试生成文本内容的功能
   */
  describe('generateContent', () => {
    /**
     * 测试：使用正确参数调用 generateContent
     * 验证配置正确传递给 API
     */
    it('should call generateContent with the correct parameters', async () => {
      const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
      const generationConfig = { temperature: 0.5 };
      const abortSignal = new AbortController().signal;

      // Mock countTokens
      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 1 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      await client.generateContent(contents, generationConfig, abortSignal);

      expect(mockGenerateContentFn).toHaveBeenCalledWith({
        model: 'test-model',
        config: {
          abortSignal,
          systemInstruction: getCoreSystemPrompt(''),
          temperature: 0.5,
          topP: 1,
        },
        contents,
      });
    });
  });

  /**
   * 测试套件：generateJson 方法
   * 测试生成 JSON 格式内容的功能
   */
  describe('generateJson', () => {
    /**
     * 测试：使用正确参数调用 generateContent
     * 验证 JSON 生成配置正确设置
     */
    it('should call generateContent with the correct parameters', async () => {
      const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
      const schema = { type: 'string' };
      const abortSignal = new AbortController().signal;

      // Mock countTokens
      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 1 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      await client.generateJson(contents, schema, abortSignal);

      expect(mockGenerateContentFn).toHaveBeenCalledWith({
        model: DEFAULT_GEMINI_FLASH_MODEL,
        config: {
          abortSignal,
          systemInstruction: getCoreSystemPrompt(''),
          temperature: 0,
          topP: 1,
          responseSchema: schema,
          responseMimeType: 'application/json',
        },
        contents,
      });
    });
  });

  /**
   * 测试套件：addHistory 方法
   * 测试向聊天历史添加内容的功能
   */
  describe('addHistory', () => {
    /**
     * 测试：使用提供的内容调用 chat.addHistory
     * 验证历史记录正确添加
     */
    it('should call chat.addHistory with the provided content', async () => {
      const mockChat = {
        addHistory: vi.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client['chat'] = mockChat as any;

      const newContent = {
        role: 'user',
        parts: [{ text: 'New history item' }],
      };
      await client.addHistory(newContent);

      expect(mockChat.addHistory).toHaveBeenCalledWith(newContent);
    });
  });

  /**
   * 测试套件：resetChat 方法
   * 测试重置聊天会话的功能
   */
  describe('resetChat', () => {
    /**
     * 测试：创建新的聊天会话，清除旧的历史记录
     * 验证聊天重置功能正常工作
     */
    it('should create a new chat session, clearing the old history', async () => {
      // 1. Get the initial chat instance and add some history.
      const initialChat = await client.getChat();
      const initialHistory = await client.getHistory();
      await client.addHistory({
        role: 'user',
        parts: [{ text: 'some old message' }],
      });
      const historyWithOldMessage = await client.getHistory();
      expect(historyWithOldMessage.length).toBeGreaterThan(
        initialHistory.length,
      );

      // 2. Call resetChat.
      await client.resetChat();

      // 3. Get the new chat instance and its history.
      const newChat = await client.getChat();
      const newHistory = await client.getHistory();

      // 4. Assert that the chat instance is new and the history is reset.
      expect(newChat).not.toBe(initialChat);
      expect(newHistory.length).toBe(initialHistory.length);
      expect(JSON.stringify(newHistory)).not.toContain('some old message');
    });
  });

  /**
   * 测试套件：sendMessageStream 方法
   * 测试流式发送消息的功能
   */
  describe('sendMessageStream', () => {
    /**
     * 测试：流完成后返回 turn 实例
     * 验证流处理机制和返回值
     */
    it('should return the turn instance after the stream is complete', async () => {
      // Arrange
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      // Act
      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        new AbortController().signal,
      );

      // Consume the stream manually to get the final return value.
      let finalResult: Turn | undefined;
      while (true) {
        const result = await stream.next();
        if (result.done) {
          finalResult = result.value;
          break;
        }
      }

      // Assert
      expect(finalResult).toBeInstanceOf(Turn);
    });
  });
});
