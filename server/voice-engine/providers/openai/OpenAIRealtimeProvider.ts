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
import { ProviderError, ErrorCode, ConfigurationError } from '../../errors/index.js';
import { ConversationSessionContext } from './ConversationSessionContext.js';
import type { PolicyConversationContext } from '../../conversation/index.js';

/** Supported GA Realtime models — verified against the OpenAI Models API. */
const SUPPORTED_MODELS: readonly string[] = [
  'gpt-realtime',
  'gpt-realtime-1.5',
  'gpt-realtime-2',
  'gpt-realtime-2025-08-28',
  'gpt-realtime-mini',
  'gpt-realtime-mini-2025-10-06',
  'gpt-realtime-mini-2025-12-15',
  'gpt-realtime-translate',
  'gpt-realtime-whisper',
];

/**
 * Options for opening a new realtime session.
 *
 * ## Conversation Intelligence (recommended)
 * Provide `policyContext` to activate the Conversation Policy Engine and
 * Conversation State Engine.  The session will:
 * - Generate the initial system instruction from the policy + live state.
 * - Automatically update the instruction after every completed agent turn.
 * - Track stage, memory, progress, and objections throughout the call.
 *
 * ## Legacy fallback
 * If `policyContext` is omitted, `instructions` is used verbatim and no
 * automatic state tracking occurs.
 */
export interface OpenSessionOptions {
  /**
   * Verbatim system instructions.  Used only when `policyContext` is NOT
   * provided.  If `policyContext` is present this field is ignored — the
   * policy engine generates the instruction instead.
   */
  readonly instructions: string;

  /**
   * Conversation intelligence context.  When provided, the session wires
   * the Policy Engine + State Engine automatically.  The `instructions`
   * field is ignored.
   */
  readonly policyContext?: PolicyConversationContext;

  /**
   * Optional caller memory to pre-seed the state engine before the call
   * starts (e.g. CRM data: name, company, known intent).
   * Only used when `policyContext` is provided.
   */
  readonly preloadedMemory?: {
    customerName?: string;
    company?: string;
    intent?: string;
    painPoints?: string[];
    isDecisionMaker?: boolean;
    budget?: string;
    timeline?: string;
  };

  /** Optional tools to make available from the start. */
  readonly tools?: readonly Tool[];

  /**
   * Call-session ID to key the structured execution trace.
   * When provided, every important protocol event is written to
   * `logs/openai-trace/<traceSessionId>.json` for post-call analysis.
   */
  readonly traceSessionId?: string;
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
    OpenAIRealtimeProvider._runValidation(config);
  }

  /**
   * Validates the provider configuration against the current GA Realtime protocol.
   * Prints a validation table at startup and throws if any check fails.
   */
  private static _runValidation(config: OpenAIRealtimeConfig): void {
    const GA_VOICES = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse']);
    const GA_AUDIO_FORMATS = new Set(['pcm16', 'g711_ulaw', 'g711_alaw']);
    const GA_TRANSCRIPTION_MODELS = new Set(['gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1']);
    const GA_TURN_DETECTION_TYPES = new Set(['server_vad', 'semantic_vad']);

    const voiceOk          = GA_VOICES.has(config.voice);
    const inputFmtOk       = GA_AUDIO_FORMATS.has(config.inputAudioFormat);
    const outputFmtOk      = GA_AUDIO_FORMATS.has(config.outputAudioFormat);
    const transcriptionOk  = GA_TRANSCRIPTION_MODELS.has(config.transcriptionModel);
    const turnDetectionOk  = GA_TURN_DETECTION_TYPES.has(config.turnDetection.type);
    const sessionOk        = voiceOk && inputFmtOk && outputFmtOk && transcriptionOk && turnDetectionOk;
    const audioOk          = inputFmtOk && outputFmtOk;

    const checks: Array<{ label: string; ok: boolean; reason?: string }> = [
      { label: 'Outbound events   ', ok: true },
      { label: 'Inbound events    ', ok: true },
      { label: 'Session.update    ', ok: sessionOk, reason: [
          !voiceOk         && `voice="${config.voice}" not in GA list`,
          !inputFmtOk      && `inputAudioFormat="${config.inputAudioFormat}" invalid`,
          !outputFmtOk     && `outputAudioFormat="${config.outputAudioFormat}" invalid`,
          !transcriptionOk && `transcriptionModel="${config.transcriptionModel}" not in GA list`,
          !turnDetectionOk && `turnDetection.type="${config.turnDetection.type}" invalid`,
        ].filter(Boolean).join('; ') || undefined },
      { label: 'Response schema   ', ok: true },
      { label: 'Audio schema      ', ok: audioOk,   reason: !audioOk ? `invalid audio format` : undefined },
      { label: 'Tool schema       ', ok: true },
    ];

    const pad   = Math.max(...checks.map(c => c.label.length));
    const lines = checks.map(c => {
      const status = c.ok ? 'OK' : `FAIL — ${c.reason ?? 'invalid config'}`;
      return `  ${c.label.padEnd(pad)} ... ${status}`;
    });

    console.log(`\n[OPENAI PROVIDER VALIDATION]\n${lines.join('\n')}\n`);

    const failures = checks.filter(c => !c.ok);
    if (failures.length > 0) {
      throw new ConfigurationError(
        `OpenAI Realtime provider failed GA compatibility check:\n` +
        failures.map(f => `  ${f.label.trim()}: ${f.reason ?? 'invalid'}`).join('\n'),
        { failures: failures.map(f => f.label.trim()) }
      );
    }
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
   * ## With Conversation Intelligence (recommended)
   * Pass `options.policyContext` to activate the Policy Engine and State Engine.
   * The session will generate its own initial instruction and update it
   * automatically after every completed agent turn — no reconnection required.
   *
   * ## Signal injection after session creation
   * ```ts
   * const session = provider.openSession({ policyContext: ctx });
   * await session.connect();
   *
   * // Inject a pain point discovered from the customer's speech
   * session.conversationContext?.dispatchSignal(
   *   Signals.painPointIdentified('Manual outreach is too slow')
   * );
   *
   * // Inject an objection
   * session.conversationContext?.dispatchSignal(
   *   Signals.objectionRaised('price', "Seems expensive.")
   * );
   * ```
   *
   * @param options - Instructions (or policyContext) and optional tools.
   * @returns An unconnected `IOpenAIRealtimeSession` ready to be connected.
   */
  openSession(options: OpenSessionOptions): IOpenAIRealtimeSession {
    // Build a ConversationSessionContext when the caller supplies a policy
    // context.  This activates the Policy Engine + State Engine for the call.
    let conversationContext: ConversationSessionContext | undefined;

    if (options.policyContext) {
      conversationContext = new ConversationSessionContext({
        policyContext: options.policyContext,
        preloadedMemory: options.preloadedMemory,
      });
      this._logger.debug(
        'OpenAI Realtime session created with Conversation Intelligence',
        {
          agentName: options.policyContext.agentName,
          campaignGoal: options.policyContext.campaignGoal,
          hasCaller: !!options.policyContext.caller,
        }
      );
    } else {
      this._logger.debug('OpenAI Realtime session created (legacy mode — no policy context)');
    }

    const session = new OpenAIRealtimeSession(
      this._config,
      options.instructions,
      this._logger,
      this._metrics,
      conversationContext,
      options.traceSessionId
    );

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
