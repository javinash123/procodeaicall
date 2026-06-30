import type { ConversationMessage } from '../session/index.js';

export interface LLMConfig {
  readonly model: string;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly topP: number;
  readonly presencePenalty: number;
  readonly frequencyPenalty: number;
  readonly timeoutMs: number;
}

export interface LLMRequest {
  readonly systemPrompt: string;
  readonly messages: readonly ConversationMessage[];
  readonly maxTokens?: number;
  readonly temperature?: number;
}

export interface LLMResponse {
  readonly content: string;
  readonly finishReason: 'stop' | 'length' | 'content_filter' | 'error';
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface LLMStreamChunk {
  readonly delta: string;
  readonly isFinal: boolean;
}

export interface LLMCapabilities {
  readonly supportsStreaming: boolean;
  readonly supportsSystemPrompt: boolean;
  readonly maxContextTokens: number;
  readonly supportedModels: readonly string[];
}
