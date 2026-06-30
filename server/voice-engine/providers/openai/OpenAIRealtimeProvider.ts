/**
 * @module OpenAIRealtimeProvider
 *
 * Production implementation of `ILLMProvider` and `ILLMStreamingProvider`
 * backed by the OpenAI Realtime WebSocket API.
 *
 * ## Purpose
 * This is the ONLY file in the Voice Engine allowed to import the OpenAI SDK.
 * All other modules interact with OpenAI through this provider's interfaces.
 *
 * ## Ownership
 * One instance is created per Voice Engine runtime. It is stateless beyond
 * the OpenAI client reference; per-call state lives in `OpenAIRealtimeSession`.
 *
 * ## Thread Safety
 * `ping()`, `complete()`, and `stream()` are independently safe to call
 * concurrently. `openSession()` returns isolated session instances.
 *
 * ## Lifecycle
 * ```
 * new OpenAIRealtimeProvider(config, logger, metrics)
 *   └─► ping()                — verify API key via models.list
 *   └─► complete()            — one-shot text completion (non-realtime)
 *   └─► stream()              — streaming text completion (non-realtime)
 *   └─► openSession()         — open a realtime WebSocket session
 *   └─► shutdown()            — release the OpenAI client
 * ```
 */

import OpenAI from 'openai';
import type { OpenAIRealtimeConfig } from './OpenAIRealtimeConfig.js';
import { OpenAIRealtimeSession } from './OpenAIRealtimeSession.js';
import type { IOpenAIRealtimeSession } from './OpenAIRealtimeSession.js';
import type { Tool } from './OpenAIRealtimeTypes.js';
import type { ILLMProvider, ILLMStreamingProvider } from '../../interfaces/index.js';
import type { LLMConfig, LLMRequest, LLMResponse, LLMStreamChunk, LLMCapabilities } from '../../llm/index.js';
import type { HealthStatus } from '../../monitoring/index.js';
import type { ILogger } from '../../logger/index.js';
import type { IMetricsCollector } from '../../metrics/index.js';
import { ProviderError, ErrorCode } from '../../errors/index.js';

/** Supported realtime models. */
const SUPPORTED_MODELS: readonly string[] = [
  'gpt-4o-realtime-preview',
  'gpt-4o-realtime-preview-2024-10-01',
  'gpt-4o-realtime-preview-2024-12-17',
  'gpt-4o-mini-realtime-preview',
];

/**
 * Options for opening a new realtime session.
 */
export interface OpenSessionOptions {
  /** System instructions / prompt for this conversation. */
  readonly instructions: string;
  /** Optional tools to make available from the start. */
  readonly tools?: readonly Tool[];
}

/**
 * Production OpenAI Realtime provider.
 * Implements both `ILLMProvider` (for compatibility) and the richer
 * realtime session interface for voice conversations.
 */
export class OpenAIRealtimeProvider implements ILLMProvider, ILLMStreamingProvider {
  readonly name = 'openai-realtime';
  readonly supportsStreaming = true as const;

  readonly capabilities: LLMCapabilities = {
    supportsStreaming: true,
    supportsSystemPrompt: true,
    maxContextTokens: 128_000,
    supportedModels: SUPPORTED_MODELS,
  };

  private readonly _config: OpenAIRealtimeConfig;
  private readonly _logger: ILogger;
  private readonly _metrics: IMetricsCollector;
  private _client: OpenAI | null = null;

  constructor(config: OpenAIRealtimeConfig, logger: ILogger, metrics: IMetricsCollector) {
    this._config = config;
    this._logger = logger.child({ provider: 'openai-realtime' });
    this._metrics = metrics;
  }

  /**
   * Lazily creates and returns the OpenAI REST client.
   * The client is reused across calls.
   */
  private _getClient(): OpenAI {
    if (!this._client) {
      this._client = new OpenAI({
        apiKey: this._config.apiKey,
        baseURL: this._config.baseURL,
        timeout: this._config.pingTimeoutMs,
        maxRetries: 0,
      });
    }
    return this._client;
  }

  /**
   * Verifies the API key and network connectivity by listing models.
   */
  async ping(): Promise<HealthStatus> {
    const startMs = Date.now();
    try {
      await this._getClient().models.list();
      const latencyMs = Date.now() - startMs;
      this._logger.debug('OpenAI ping succeeded', { latencyMs });
      return {
        status: 'healthy',
        message: `OpenAI API reachable (${latencyMs}ms)`,
        checkedAt: Date.now(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._logger.warn('OpenAI ping failed', { message });
      return {
        status: 'unhealthy',
        message: `OpenAI API unreachable: ${message}`,
        checkedAt: Date.now(),
      };
    }
  }

  /**
   * One-shot text completion using the standard Chat Completions API.
   * Used for non-realtime turns (e.g. script generation, summaries).
   *
   * @throws {ProviderError} on API failure.
   */
  async complete(request: LLMRequest, config: LLMConfig): Promise<LLMResponse> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: request.systemPrompt },
      ...request.messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
    ];

    try {
      const response = await this._getClient().chat.completions.create({
        model: config.model,
        messages,
        max_tokens: request.maxTokens ?? config.maxTokens,
        temperature: request.temperature ?? config.temperature,
        top_p: config.topP,
        presence_penalty: config.presencePenalty,
        frequency_penalty: config.frequencyPenalty,
        stream: false,
      });

      const choice = response.choices[0];
      return {
        content: choice?.message?.content ?? '',
        finishReason: (choice?.finish_reason ?? 'stop') as LLMResponse['finishReason'],
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ProviderError(message, ErrorCode.LLM_FAILED, this.name);
    }
  }

  /**
   * Streaming text completion using the standard Chat Completions API.
   * Chunks are delivered via `onChunk`; the resolved value is the full response.
   *
   * @throws {ProviderError} on API failure.
   */
  async stream(
    request: LLMRequest,
    config: LLMConfig,
    onChunk: (chunk: LLMStreamChunk) => void
  ): Promise<LLMResponse> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: request.systemPrompt },
      ...request.messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
    ];

    let fullContent = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let finishReason: LLMResponse['finishReason'] = 'stop';

    try {
      const stream = await this._getClient().chat.completions.create({
        model: config.model,
        messages,
        max_tokens: request.maxTokens ?? config.maxTokens,
        temperature: request.temperature ?? config.temperature,
        top_p: config.topP,
        presence_penalty: config.presencePenalty,
        frequency_penalty: config.frequencyPenalty,
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        const isFinal = chunk.choices[0]?.finish_reason != null;

        if (delta) {
          fullContent += delta;
          onChunk({ delta, isFinal: false });
        }

        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens ?? 0;
          completionTokens = chunk.usage.completion_tokens ?? 0;
        }

        if (isFinal) {
          finishReason = (chunk.choices[0]?.finish_reason ?? 'stop') as LLMResponse['finishReason'];
          onChunk({ delta: '', isFinal: true });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ProviderError(message, ErrorCode.LLM_FAILED, this.name);
    }

    return {
      content: fullContent,
      finishReason,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }

  /**
   * Opens a new OpenAI Realtime WebSocket session for a live conversation.
   * The caller must call `session.connect()` then `session.close()` when done.
   *
   * @param options - Instructions and optional tools for the session.
   * @returns An unconnected `IOpenAIRealtimeSession` ready to be connected.
   */
  openSession(options: OpenSessionOptions): IOpenAIRealtimeSession {
    const session = new OpenAIRealtimeSession(
      this._config,
      options.instructions,
      this._logger,
      this._metrics
    );
    this._logger.debug('OpenAI Realtime session instance created');
    return session;
  }

  /**
   * Releases the OpenAI REST client. Safe to call multiple times.
   */
  shutdown(): void {
    this._client = null;
    this._logger.info('OpenAIRealtimeProvider shut down');
  }
}
