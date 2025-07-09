/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, ContentGenerator } from '../core/contentGenerator.js';
import { getOauthClient } from './oauth2.js';
import { setupUser } from './setup.js';
import { CodeAssistServer, HttpOptions } from './gemini_server.js';
import { OpenAICodeAssistServer } from './openai_server.js';

export async function createCodeAssistContentGenerator(
  httpOptions: HttpOptions,
  authType: AuthType,
): Promise<ContentGenerator> {
  if ('openapi' === process.env.CODE_ASSIST_PROVIDER) {
    return new OpenAICodeAssistServer('openai/gpt-4o');
  }
  if (authType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    const authClient = await getOauthClient();
    const projectId = await setupUser(authClient);
    return new CodeAssistServer(authClient, projectId, httpOptions);
  }

  throw new Error(`Unsupported authType: ${authType}`);
}
