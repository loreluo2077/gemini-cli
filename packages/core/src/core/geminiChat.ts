/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// DISCLAIMER: This is a copied version of https://github.com/googleapis/js-genai/blob/main/src/chats.ts with the intention of working around a key bug
// where function responses are not treated as "valid" responses: https://b.corp.google.com/issues/420354090

import {
  GenerateContentResponse,
  Content,
  GenerateContentConfig,
  SendMessageParameters,
  createUserContent,
  Part,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { retryWithBackoff } from '../utils/retry.js';
import { isFunctionResponse } from '../utils/messageInspectors.js';
import { ContentGenerator, AuthType } from './contentGenerator.js';
import { Config } from '../config/config.js';
import {
  logApiRequest,
  logApiResponse,
  logApiError,
} from '../telemetry/loggers.js';
import {
  getStructuredResponse,
  getStructuredResponseFromParts,
} from '../utils/generateContentResponseUtilities.js';
import {
  ApiErrorEvent,
  ApiRequestEvent,
  ApiResponseEvent,
} from '../telemetry/types.js';
import {
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
} from '../config/models.js';
import { studyLogger } from '../utils/studyLoggerUtil.js';

/**
 * Returns true if the response is valid, false otherwise.
 */
function isValidResponse(response: GenerateContentResponse): boolean {
  if (response.candidates === undefined || response.candidates.length === 0) {
    return false;
  }
  const content = response.candidates[0]?.content;
  if (content === undefined) {
    return false;
  }
  return isValidContent(content);
}

function isValidContent(content: Content): boolean {
  if (content.parts === undefined || content.parts.length === 0) {
    return false;
  }
  for (const part of content.parts) {
    if (part === undefined || Object.keys(part).length === 0) {
      return false;
    }
    if (!part.thought && part.text !== undefined && part.text === '') {
      return false;
    }
  }
  return true;
}

/**
 * Validates the history contains the correct roles.
 *
 * @throws Error if the history does not start with a user turn.
 * @throws Error if the history contains an invalid role.
 */
function validateHistory(history: Content[]) {
  // Empty history is valid.
  if (history.length === 0) {
    return;
  }
  for (const content of history) {
    if (content.role !== 'user' && content.role !== 'model') {
      throw new Error(`Role must be user or model, but got ${content.role}.`);
    }
  }
}

/**
 * Extracts the curated (valid) history from a comprehensive history.
 *
 * @remarks
 * The model may sometimes generate invalid or empty contents(e.g., due to safety
 * filters or recitation). Extracting valid turns from the history
 * ensures that subsequent requests could be accepted by the model.
 */
function extractCuratedHistory(comprehensiveHistory: Content[]): Content[] {
  if (comprehensiveHistory === undefined || comprehensiveHistory.length === 0) {
    return [];
  }
  const curatedHistory: Content[] = [];
  const length = comprehensiveHistory.length;
  let i = 0;
  while (i < length) {
    if (comprehensiveHistory[i].role === 'user') {
      curatedHistory.push(comprehensiveHistory[i]);
      i++;
    } else {
      const modelOutput: Content[] = [];
      let isValid = true;
      while (i < length && comprehensiveHistory[i].role === 'model') {
        modelOutput.push(comprehensiveHistory[i]);
        if (isValid && !isValidContent(comprehensiveHistory[i])) {
          isValid = false;
        }
        i++;
      }
      if (isValid) {
        curatedHistory.push(...modelOutput);
      } else {
        // Remove the last user input when model content is invalid.
        curatedHistory.pop();
      }
    }
  }
  return curatedHistory;
}

/**
 * Chat session that enables sending messages to the model with previous
 * conversation context.
 *
 * @remarks
 * The session maintains all the turns between user and model.
 */
export class GeminiChat {
  // A promise to represent the current state of the message being sent to the
  // model.
  private sendPromise: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: Config,
    private readonly contentGenerator: ContentGenerator,
    private readonly generationConfig: GenerateContentConfig = {},
    private history: Content[] = [],
  ) {
    validateHistory(history);
  }

  private _getRequestTextFromContents(contents: Content[]): string {
    return contents
      .flatMap((content) => content.parts ?? [])
      .map((part) => part.text)
      .filter(Boolean)
      .join('');
  }

  private async _logApiRequest(
    contents: Content[],
    model: string,
  ): Promise<void> {
    const requestText = this._getRequestTextFromContents(contents);
    logApiRequest(this.config, new ApiRequestEvent(model, requestText));
  }

  private async _logApiResponse(
    durationMs: number,
    usageMetadata?: GenerateContentResponseUsageMetadata,
    responseText?: string,
  ): Promise<void> {
    logApiResponse(
      this.config,
      new ApiResponseEvent(
        this.config.getModel(),
        durationMs,
        usageMetadata,
        responseText,
      ),
    );
  }

  private _logApiError(durationMs: number, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = error instanceof Error ? error.name : 'unknown';

    logApiError(
      this.config,
      new ApiErrorEvent(
        this.config.getModel(),
        errorMessage,
        durationMs,
        errorType,
      ),
    );
  }

  /**
   * Handles fallback to Flash model when persistent 429 errors occur for OAuth users.
   * Uses a fallback handler if provided by the config, otherwise returns null.
   */
  private async handleFlashFallback(authType?: string): Promise<string | null> {
    console.log(
      `[GeminiChat Debug] Attempting Flash fallback with authType: ${authType}`,
    );

    // Only handle fallback for OAuth users
    if (authType !== AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
      console.log(
        `[GeminiChat Debug] Fallback skipped: Not a personal Google account (authType: ${authType})`,
      );
      return null;
    }

    const currentModel = this.config.getModel();
    const fallbackModel = DEFAULT_GEMINI_FLASH_MODEL;
    console.log(
      `[GeminiChat Debug] Fallback check: Current model=${currentModel}, Fallback model=${fallbackModel}`,
    );

    // Don't fallback if already using Flash model
    if (currentModel === fallbackModel) {
      console.log(
        `[GeminiChat Debug] Fallback skipped: Already using Flash model`,
      );
      return null;
    }

    // Check if config has a fallback handler (set by CLI package)
    const fallbackHandler = this.config.flashFallbackHandler;
    if (typeof fallbackHandler === 'function') {
      try {
        console.log(`[GeminiChat Debug] Executing fallback handler`);
        const accepted = await fallbackHandler(currentModel, fallbackModel);
        if (accepted) {
          console.log(
            `[GeminiChat Debug] Fallback accepted: Switching from ${currentModel} to ${fallbackModel}`,
          );
          this.config.setModel(fallbackModel);
          return fallbackModel;
        } else {
          console.log(`[GeminiChat Debug] Fallback rejected by handler`);
        }
      } catch (error) {
        console.warn('Flash fallback handler failed:', error);
        console.log(`[GeminiChat Debug] Fallback handler error:`, error);
      }
    } else {
      console.log(`[GeminiChat Debug] No fallback handler available`);
    }

    return null;
  }

  /**
   * Sends a message to the model and returns the response.
   *
   * @remarks
   * This method will wait for the previous message to be processed before
   * sending the next message.
   *
   * @see {@link Chat#sendMessageStream} for streaming method.
   * @param params - parameters for sending messages within a chat session.
   * @returns The model's response.
   *
   * @example
   * ```ts
   * const chat = ai.chats.create({model: 'gemini-2.0-flash'});
   * const response = await chat.sendMessage({
   *   message: 'Why is the sky blue?'
   * });
   * console.log(response.text);
   * ```
   */
  async sendMessage(
    params: SendMessageParameters,
  ): Promise<GenerateContentResponse> {
    console.log(
      `[GeminiChat Debug] Starting sendMessage with params:`,
      typeof params.message === 'string'
        ? `message length: ${params.message.length}`
        : `message type: ${typeof params.message}`,
    );

    await this.sendPromise;
    const userContent = createUserContent(params.message);
    const requestContents = this.getHistory(true).concat(userContent);
    console.log(
      `[GeminiChat Debug] Request prepared with ${requestContents.length} content items`,
    );

    this._logApiRequest(requestContents, this.config.getModel());

    const startTime = Date.now();
    let response: GenerateContentResponse;

    try {
      const apiCall = () =>
        this.contentGenerator.generateContent({
          model: 'deepseek-v3-doubao',
          contents: requestContents,
          config: { ...this.generationConfig, ...params.config },
        });

      response = await retryWithBackoff(apiCall, {
        shouldRetry: (error: Error) => {
          if (error && error.message) {
            if (error.message.includes('429')) return true;
            if (error.message.match(/5\d{2}/)) return true;
          }
          return false;
        },
        onPersistent429: async (authType?: string) =>
          await this.handleFlashFallback(authType),
        authType: this.config.getContentGeneratorConfig()?.authType,
      });
      const durationMs = Date.now() - startTime;
      await this._logApiResponse(
        durationMs,
        response.usageMetadata,
        getStructuredResponse(response),
      );

      this.sendPromise = (async () => {
        const outputContent = response.candidates?.[0]?.content;
        // Because the AFC input contains the entire curated chat history in
        // addition to the new user input, we need to truncate the AFC history
        // to deduplicate the existing chat history.
        const fullAutomaticFunctionCallingHistory =
          response.automaticFunctionCallingHistory;
        const index = this.getHistory(true).length;
        let automaticFunctionCallingHistory: Content[] = [];
        if (fullAutomaticFunctionCallingHistory != null) {
          automaticFunctionCallingHistory =
            fullAutomaticFunctionCallingHistory.slice(index) ?? [];
        }
        const modelOutput = outputContent ? [outputContent] : [];
        this.recordHistory(
          userContent,
          modelOutput,
          automaticFunctionCallingHistory,
        );
      })();
      await this.sendPromise.catch(() => {
        // Resets sendPromise to avoid subsequent calls failing
        this.sendPromise = Promise.resolve();
      });
      console.log(
        `[GeminiChat Debug] sendMessage completed successfully in ${Date.now() - startTime}ms`,
      );
      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      console.log(
        `[GeminiChat Debug] sendMessage failed after ${durationMs}ms:`,
        error,
      );
      this._logApiError(durationMs, error);
      this.sendPromise = Promise.resolve();
      throw error;
    }
  }

  /**
   * Sends a message to the model and returns the response in chunks.
   *
   * @remarks
   * This method will wait for the previous message to be processed before
   * sending the next message.
   *
   * @see {@link Chat#sendMessage} for non-streaming method.
   * @param params - parameters for sending the message.
   * @return The model's response.
   *
   * @example
   * ```ts
   * const chat = ai.chats.create({model: 'gemini-2.0-flash'});
   * const response = await chat.sendMessageStream({
   *   message: 'Why is the sky blue?'
   * });
   * for await (const chunk of response) {
   *   console.log(chunk.text);
   * }
   * ```
   */
  async sendMessageStream(
    params: SendMessageParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    console.log(
      `[GeminiChat Debug] Starting sendMessageStream with params:`,
      typeof params.message === 'string'
        ? `message length: ${params.message.length}`
        : `message type: ${typeof params.message}`,
    );

    await this.sendPromise;
    const userContent = createUserContent(params.message);
    const requestContents = this.getHistory(true).concat(userContent);
    console.log(
      `[GeminiChat Debug] Stream request prepared with ${requestContents.length} content items`,
    );

    const model = await this._selectModel(
      requestContents,
      params.config?.abortSignal ?? new AbortController().signal,
    );
    console.log(`[GeminiChat Debug] Selected model for stream: ${model}`);

    this._logApiRequest(requestContents, model);

    const startTime = Date.now();

    try {
      const apiCall = () =>
        this.contentGenerator.generateContentStream({
          model,
          contents: requestContents,
          config: { ...this.generationConfig, ...params.config },
        });

      // Note: Retrying streams can be complex. If generateContentStream itself doesn't handle retries
      // for transient issues internally before yielding the async generator, this retry will re-initiate
      // the stream. For simple 429/500 errors on initial call, this is fine.
      // If errors occur mid-stream, this setup won't resume the stream; it will restart it.
      const streamResponse = await retryWithBackoff(apiCall, {
        shouldRetry: (error: Error) => {
          // Check error messages for status codes, or specific error names if known
          if (error && error.message) {
            if (error.message.includes('429')) return true;
            if (error.message.match(/5\d{2}/)) return true;
          }
          return false; // Don't retry other errors by default
        },
        onPersistent429: async (authType?: string) =>
          await this.handleFlashFallback(authType),
        authType: this.config.getContentGeneratorConfig()?.authType,
      });

      // Resolve the internal tracking of send completion promise - `sendPromise`
      // for both success and failure response. The actual failure is still
      // propagated by the `await streamResponse`.
      this.sendPromise = Promise.resolve(streamResponse)
        .then(() => undefined)
        .catch(() => undefined);

      const result = this.processStreamResponse(
        streamResponse,
        userContent,
        startTime,
      );
      console.log(
        `[GeminiChat Debug] sendMessageStream setup completed in ${Date.now() - startTime}ms`,
      );
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      console.log(
        `[GeminiChat Debug] sendMessageStream setup failed after ${durationMs}ms:`,
        error,
      );
      this._logApiError(durationMs, error);
      this.sendPromise = Promise.resolve();
      throw error;
    }
  }

  /**
   * Selects the model to use for the request.
   *
   * This is a placeholder for now.
   */
  private async _selectModel(
    history: Content[],
    signal: AbortSignal,
  ): Promise<string> {
    console.log(
      `[GeminiChat Debug] Selecting model for history with ${history.length} items`,
    );

    // const currentModel = this.config.getModel();
    // if (currentModel === DEFAULT_GEMINI_FLASH_MODEL) {
    //   console.log(
    //     `[GeminiChat Debug] Using current Flash model: ${currentModel}`,
    //   );
    //   return DEFAULT_GEMINI_FLASH_MODEL;
    // }

    // if (
    //   history.length < 5 &&
    //   this.config.getContentGeneratorConfig().authType === AuthType.USE_GEMINI
    // ) {
    //   // There's currently a bug where for Gemini API key usage if we try and use flash as one of the first
    //   // requests in our sequence that it will return an empty token.
    //   console.log(
    //     `[GeminiChat Debug] Using DEFAULT_GEMINI_MODEL due to API key + short history bug avoidance`,
    //   );
    //   return DEFAULT_GEMINI_MODEL;
    // }

    //     const flashIndicator = 'flash';
    //     const proIndicator = 'pro';
    //     const modelChoicePrompt = `You are a super-intelligent router that decides which model to use for a given request. You have two models to choose from: "${flashIndicator}" and "${proIndicator}". "${flashIndicator}" is a smaller and faster model that is good for simple or well defined requests. "${proIndicator}" is a larger and slower model that is good for complex or undefined requests.

    // Based on the user request, which model should be used? Respond with a JSON object that contains a single field, \`model\`, whose value is the name of the model to be used.

    // For example, if you think "${flashIndicator}" should be used, respond with: { "model": "${flashIndicator}" }`;
    //     const modelChoiceContent: Content[] = [
    //       {
    //         role: 'user',
    //         parts: [{ text: modelChoicePrompt }],
    //       },
    //     ];

    // const client = this.config.getGeminiClient();
    // try {
    //   console.log(
    //     `[GeminiChat Debug] Attempting model selection via generateJson`,
    //   );
    //   const choice = await client.generateJson(
    //     [...history, ...modelChoiceContent],
    //     {
    //       type: 'object',
    //       properties: {
    //         model: {
    //           type: 'string',
    //           enum: [flashIndicator, proIndicator],
    //         },
    //       },
    //       required: ['model'],
    //     },
    //     signal,
    //     DEFAULT_GEMINI_FLASH_MODEL,
    //     {
    //       temperature: 0,
    //       maxOutputTokens: 25,
    //       thinkingConfig: {
    //         thinkingBudget: 0,
    //       },
    //     },
    //   );

    //   console.log(`[GeminiChat Debug] Model selection result:`, choice);
    //   switch (choice.model) {
    //     case flashIndicator:
    //       console.log(
    //         `[GeminiChat Debug] Selected Flash model based on router decision`,
    //       );
    //       return DEFAULT_GEMINI_FLASH_MODEL;
    //     case proIndicator:
    //       console.log(
    //         `[GeminiChat Debug] Selected Pro model based on router decision`,
    //       );
    //       return DEFAULT_GEMINI_MODEL;
    //     default:
    //       console.log(
    //         `[GeminiChat Debug] Using current model (${currentModel}) as router returned unexpected value`,
    //       );
    //       return currentModel;
    //   }
    // } catch (e) {
    //   // If the model selection fails, just use the default flash model.
    //   console.log(
    //     `[GeminiChat Debug] Model selection failed, defaulting to Flash model:`,
    //     e,
    //   );
    //   return DEFAULT_GEMINI_FLASH_MODEL;
    // }
    return DEFAULT_GEMINI_FLASH_MODEL;
  }

  /**
   * Returns the chat history.
   *
   * @remarks
   * The history is a list of contents alternating between user and model.
   *
   * There are two types of history:
   * - The `curated history` contains only the valid turns between user and
   * model, which will be included in the subsequent requests sent to the model.
   * - The `comprehensive history` contains all turns, including invalid or
   *   empty model outputs, providing a complete record of the history.
   *
   * The history is updated after receiving the response from the model,
   * for streaming response, it means receiving the last chunk of the response.
   *
   * The `comprehensive history` is returned by default. To get the `curated
   * history`, set the `curated` parameter to `true`.
   *
   * @param curated - whether to return the curated history or the comprehensive
   *     history.
   * @return History contents alternating between user and model for the entire
   *     chat session.
   */
  getHistory(curated: boolean = false): Content[] {
    const history = curated
      ? extractCuratedHistory(this.history)
      : this.history;
    // Deep copy the history to avoid mutating the history outside of the
    // chat session.
    return structuredClone(history);
  }

  /**
   * Clears the chat history.
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Adds a new entry to the chat history.
   *
   * @param content - The content to add to the history.
   */
  addHistory(content: Content): void {
    this.history.push(content);
  }
  setHistory(history: Content[]): void {
    this.history = history;
  }

  getFinalUsageMetadata(
    chunks: GenerateContentResponse[],
  ): GenerateContentResponseUsageMetadata | undefined {
    const lastChunkWithMetadata = chunks
      .slice()
      .reverse()
      .find((chunk) => chunk.usageMetadata);

    return lastChunkWithMetadata?.usageMetadata;
  }

  private async *processStreamResponse(
    streamResponse: AsyncGenerator<GenerateContentResponse>,
    inputContent: Content,
    startTime: number,
  ) {
    console.log(`[GeminiChat Debug] Starting to process stream response`);
    const outputContent: Content[] = [];
    const chunks: GenerateContentResponse[] = [];
    let errorOccurred = false;
    let chunkCount = 0;

    try {
      for await (const chunk of streamResponse) {
        chunkCount++;
        if (chunkCount % 10 === 0) {
          console.log(
            `[GeminiChat Debug] Processed ${chunkCount} stream chunks so far`,
          );
        }

        if (isValidResponse(chunk)) {
          chunks.push(chunk);
          const content = chunk.candidates?.[0]?.content;
          if (content !== undefined) {
            if (this.isThoughtContent(content)) {
              console.log(`[GeminiChat Debug] Received thought content chunk`);
              yield chunk;
              continue;
            }
            outputContent.push(content);
          }
        } else {
          console.log(`[GeminiChat Debug] Received invalid response chunk`);
        }
        yield chunk;
      }
      console.log(
        `[GeminiChat Debug] Stream completed with ${chunkCount} total chunks`,
      );
    } catch (error) {
      errorOccurred = true;
      const durationMs = Date.now() - startTime;
      this._logApiError(durationMs, error);
      throw error;
    }

    if (!errorOccurred) {
      const durationMs = Date.now() - startTime;
      console.log(
        `[GeminiChat Debug] Stream processing completed in ${durationMs}ms`,
      );

      const allParts: Part[] = [];
      for (const content of outputContent) {
        if (content.parts) {
          allParts.push(...content.parts);
        }
      }
      const fullText = getStructuredResponseFromParts(allParts);

      console.log(
        `[GeminiChat Debug] Stream response total length: ${fullText?.length || 0} characters`,
      );

      await this._logApiResponse(
        durationMs,
        this.getFinalUsageMetadata(chunks),
        fullText,
      );
    }
    console.log(`[GeminiChat Debug] Recording history from stream response`);
    studyLogger.info('inputContent', JSON.stringify(inputContent, null, 2));
    studyLogger.info('outputContent', JSON.stringify(outputContent, null, 2));
    this.recordHistory(inputContent, outputContent);
  }

  private recordHistory(
    userInput: Content,
    modelOutput: Content[],
    automaticFunctionCallingHistory?: Content[],
  ) {
    console.log(
      `[GeminiChat Debug] Recording history: modelOutput length=${modelOutput.length}, AFC history=${automaticFunctionCallingHistory ? automaticFunctionCallingHistory.length : 'none'}`,
    );

    const nonThoughtModelOutput = modelOutput.filter(
      (content) => !this.isThoughtContent(content),
    );
    console.log(
      `[GeminiChat Debug] Non-thought model output items: ${nonThoughtModelOutput.length}`,
    );

    let outputContents: Content[] = [];
    if (
      nonThoughtModelOutput.length > 0 &&
      nonThoughtModelOutput.every((content) => content.role !== undefined)
    ) {
      outputContents = nonThoughtModelOutput;
    } else if (nonThoughtModelOutput.length === 0 && modelOutput.length > 0) {
      // This case handles when the model returns only a thought.
      // We don't want to add an empty model response in this case.
    } else {
      // When not a function response appends an empty content when model returns empty response, so that the
      // history is always alternating between user and model.
      // Workaround for: https://b.corp.google.com/issues/420354090
      if (!isFunctionResponse(userInput)) {
        outputContents.push({
          role: 'model',
          parts: [],
        } as Content);
      }
    }
    if (
      automaticFunctionCallingHistory &&
      automaticFunctionCallingHistory.length > 0
    ) {
      const curatedAFC = extractCuratedHistory(
        automaticFunctionCallingHistory!,
      );
      console.log(
        `[GeminiChat Debug] Adding ${curatedAFC.length} AFC history items`,
      );
      this.history.push(...curatedAFC);
    } else {
      console.log(`[GeminiChat Debug] Adding user input to history`);
      this.history.push(userInput);
    }

    // Consolidate adjacent model roles in outputContents
    const consolidatedOutputContents: Content[] = [];
    for (const content of outputContents) {
      if (this.isThoughtContent(content)) {
        continue;
      }
      const lastContent =
        consolidatedOutputContents[consolidatedOutputContents.length - 1];
      if (this.isTextContent(lastContent) && this.isTextContent(content)) {
        // If both current and last are text, combine their text into the lastContent's first part
        // and append any other parts from the current content.
        lastContent.parts[0].text += content.parts[0].text || '';
        if (content.parts.length > 1) {
          lastContent.parts.push(...content.parts.slice(1));
        }
      } else {
        consolidatedOutputContents.push(content);
      }
    }

    if (consolidatedOutputContents.length > 0) {
      console.log(
        `[GeminiChat Debug] Adding ${consolidatedOutputContents.length} consolidated output contents to history`,
      );

      const lastHistoryEntry = this.history[this.history.length - 1];
      const canMergeWithLastHistory =
        !automaticFunctionCallingHistory ||
        automaticFunctionCallingHistory.length === 0;

      if (
        canMergeWithLastHistory &&
        this.isTextContent(lastHistoryEntry) &&
        this.isTextContent(consolidatedOutputContents[0])
      ) {
        console.log(
          `[GeminiChat Debug] Merging first consolidated output with last history entry`,
        );
        // If both current and last are text, combine their text into the lastHistoryEntry's first part
        // and append any other parts from the current content.
        lastHistoryEntry.parts[0].text +=
          consolidatedOutputContents[0].parts[0].text || '';
        if (consolidatedOutputContents[0].parts.length > 1) {
          lastHistoryEntry.parts.push(
            ...consolidatedOutputContents[0].parts.slice(1),
          );
        }
        consolidatedOutputContents.shift(); // Remove the first element as it's merged
      }

      if (consolidatedOutputContents.length > 0) {
        console.log(
          `[GeminiChat Debug] Adding ${consolidatedOutputContents.length} remaining output contents to history`,
        );
        this.history.push(...consolidatedOutputContents);
      }
    }

    console.log(
      `[GeminiChat Debug] History updated, new length: ${this.history.length}`,
    );
  }

  private isTextContent(
    content: Content | undefined,
  ): content is Content & { parts: [{ text: string }, ...Part[]] } {
    return !!(
      content &&
      content.role === 'model' &&
      content.parts &&
      content.parts.length > 0 &&
      typeof content.parts[0].text === 'string' &&
      content.parts[0].text !== ''
    );
  }

  private isThoughtContent(
    content: Content | undefined,
  ): content is Content & { parts: [{ thought: boolean }, ...Part[]] } {
    return !!(
      content &&
      content.role === 'model' &&
      content.parts &&
      content.parts.length > 0 &&
      typeof content.parts[0].thought === 'boolean' &&
      content.parts[0].thought === true
    );
  }
}
