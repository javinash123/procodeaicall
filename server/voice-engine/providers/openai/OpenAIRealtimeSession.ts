/**
 * @module OpenAIRealtimeSession
 *
 * Represents ONE active OpenAI Realtime WebSocket conversation.
 *
 * ## Purpose
 * Manages the lifecycle of a single WebSocket connection to the OpenAI
 * Realtime API. Translates Voice Engine audio/text operations into the
 * OpenAI Realtime protocol and emits strongly typed provider events.
 *
 * ## Ownership
 * Created by `OpenAIRealtimeProvider.openSession()`. The caller owns the
 * session and must call `close()` when the conversation ends.
 *
 * ## Thread Safety
 * All public methods are async and must be awaited sequentially by the owner.
 * The session does not acquire locks; the owner is responsible for sequencing.
 *
 * ## Lifecycle
 * ```
 * new OpenAIRealtimeSession()
 *   └─► connect()        — WebSocket opens, session.created received
 *         ├─► sendAudio()       — append PCM/G.711 chunks
 *         ├─► sendText()        — inject text message
 *         ├─► interrupt()       — cancel active response
 *         ├─► updateInstructions() — update system prompt mid-call
 *         ├─► updateTools()        — hot-swap available tools
 *         └─► submitToolResult()   — send function call output
 *   └─► close()          — graceful disconnect
 * ```
 */

import { WebSocket } from 'ws';
import type { OpenAIRealtimeConfig } from './OpenAIRealtimeConfig.js';
import type { ILogger } from '../../logger/index.js';
import type { IMetricsCollector } from '../../metrics/index.js';
import type {
  ClientEvent,
  ServerEvent,
  ServerEventType,
  ServerEventMap,
  Tool,
  RealtimeSessionResource,
} from './OpenAIRealtimeTypes.js';
import type {
  RealtimeProviderEvent,
  RealtimeEventHandler,
} from './OpenAIRealtimeEvents.js';
import { ProviderError, ErrorCode } from '../../errors/index.js';

type SessionState = 'idle' | 'connecting' | 'connected' | 'closing' | 'closed';

/**
 * The public interface for a single OpenAI Realtime conversation session.
 */
export interface IOpenAIRealtimeSession {
  /** Whether the WebSocket connection is currently open. */
  readonly isConnected: boolean;
  /** The OpenAI-assigned session ID, available after `connect()` resolves. */
  readonly sessionId: string | null;

  connect(): Promise<void>;
  sendAudio(base64Chunk: string): void;
  sendText(text: string): Promise<void>;
  interrupt(): Promise<void>;
  updateInstructions(instructions: string): Promise<void>;
  updateTools(tools: readonly Tool[]): Promise<void>;
  submitToolResult(callId: string, output: string): Promise<void>;
  close(): Promise<void>;

  on<K extends RealtimeProviderEvent['type']>(
    type: K,
    handler: RealtimeEventHandler<RealtimeProviderEvent & { type: K }>
  ): void;
  off<K extends RealtimeProviderEvent['type']>(
    type: K,
    handler: RealtimeEventHandler<RealtimeProviderEvent & { type: K }>
  ): void;
}

/**
 * Concrete implementation of a single OpenAI Realtime WebSocket session.
 */
export class OpenAIRealtimeSession implements IOpenAIRealtimeSession {
  private readonly _config: OpenAIRealtimeConfig;
  private readonly _logger: ILogger;
  private readonly _metrics: IMetricsCollector;
  private readonly _initialInstructions: string;

  private _ws: WebSocket | null = null;
  private _state: SessionState = 'idle';
  private _sessionId: string | null = null;

  private readonly _handlers = new Map<string, Set<RealtimeEventHandler>>();

  constructor(
    config: OpenAIRealtimeConfig,
    initialInstructions: string,
    logger: ILogger,
    metrics: IMetricsCollector
  ) {
    this._config = config;
    this._initialInstructions = initialInstructions;
    this._logger = logger.child({ component: 'OpenAIRealtimeSession' });
    this._metrics = metrics;
  }

  get isConnected(): boolean {
    return this._state === 'connected' && this._ws?.readyState === WebSocket.OPEN;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  /**
   * Opens the WebSocket connection and waits for the `session.created` event.
   * @throws {ProviderError} if the connection cannot be established within the configured timeout.
   */
  async connect(): Promise<void> {
    if (this._state !== 'idle') {
      throw new ProviderError(
        `OpenAIRealtimeSession.connect() called in invalid state: ${this._state}`,
        ErrorCode.PROVIDER_UNAVAILABLE,
        'openai-realtime'
      );
    }

    this._state = 'connecting';
    const url = `${this._config.realtimeURL}?model=${encodeURIComponent(this._config.model)}`;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new ProviderError(
          `OpenAI Realtime WebSocket connection timed out after ${this._config.connectTimeoutMs}ms`,
          ErrorCode.PROVIDER_TIMEOUT,
          'openai-realtime'
        ));
      }, this._config.connectTimeoutMs);

      const ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this._config.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      this._ws = ws;

      ws.on('open', () => {
        this._logger.debug('WebSocket open — waiting for session.created');
      });

      ws.on('message', (data: Buffer | string) => {
        const raw = typeof data === 'string' ? data : data.toString('utf-8');
        let event: ServerEvent;
        try {
          event = JSON.parse(raw) as ServerEvent;
        } catch {
          this._logger.warn('Failed to parse server event', { raw: raw.slice(0, 200) });
          return;
        }

        if (event.type === 'session.created') {
          clearTimeout(timeout);
          this._sessionId = event.session.id ?? null;
          this._state = 'connected';
          this._logger.info('OpenAI Realtime session created', { sessionId: this._sessionId });

          this._sendEvent({
            type: 'session.update',
            session: this._buildSessionConfig(this._initialInstructions),
          });

          resolve();
        }

        this._handleServerEvent(event);
      });

      ws.on('error', (err: Error) => {
        this._logger.error('WebSocket error', { message: err.message });
        if (this._state === 'connecting') {
          clearTimeout(timeout);
          reject(new ProviderError(err.message, ErrorCode.PROVIDER_UNAVAILABLE, 'openai-realtime'));
        }
        this._emit({
          type: 'realtime.error',
          timestamp: Date.now(),
          eventId: '',
          errorType: 'websocket_error',
          message: err.message,
          fatal: true,
        });
      });

      ws.on('close', (code: number, reason: Buffer) => {
        this._state = 'closed';
        this._emit({
          type: 'realtime.disconnected',
          timestamp: Date.now(),
          eventId: '',
          code,
          reason: reason.toString('utf-8'),
          wasClean: code === 1000,
        });
        this._logger.info('WebSocket closed', { code });
      });
    });
  }

  /**
   * Appends a base64-encoded audio chunk to the input buffer.
   * Fire-and-forget — does not wait for server acknowledgement.
   */
  sendAudio(base64Chunk: string): void {
    this._sendEvent({ type: 'input_audio_buffer.append', audio: base64Chunk });
    this._emit({
      type: 'realtime.audio_sent',
      timestamp: Date.now(),
      eventId: '',
      byteLength: base64Chunk.length,
    });
  }

  /**
   * Sends a text message into the conversation and triggers a response.
   */
  async sendText(text: string): Promise<void> {
    this._assertConnected();
    this._sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });
    this._sendEvent({ type: 'response.create' });
  }

  /**
   * Cancels the current in-progress response (barge-in).
   */
  async interrupt(): Promise<void> {
    this._assertConnected();
    this._sendEvent({ type: 'response.cancel' });
    this._sendEvent({ type: 'input_audio_buffer.clear' });
    this._logger.debug('Sent interrupt (response.cancel + buffer clear)');
  }

  /**
   * Hot-updates the system instructions for the current session.
   */
  async updateInstructions(instructions: string): Promise<void> {
    this._assertConnected();
    this._sendEvent({
      type: 'session.update',
      session: { instructions },
    });
  }

  /**
   * Hot-swaps the list of tools available to the model.
   */
  async updateTools(tools: readonly Tool[]): Promise<void> {
    this._assertConnected();
    this._sendEvent({
      type: 'session.update',
      session: { tools: tools as Tool[] },
    });
  }

  /**
   * Submits the result of a function call back to the session.
   */
  async submitToolResult(callId: string, output: string): Promise<void> {
    this._assertConnected();
    this._sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output,
      },
    });
    this._sendEvent({ type: 'response.create' });
    this._emit({
      type: 'realtime.tool_result',
      timestamp: Date.now(),
      eventId: '',
      callId,
      output,
    });
  }

  /**
   * Gracefully closes the WebSocket connection.
   */
  async close(): Promise<void> {
    if (this._state === 'closed' || this._state === 'closing') return;
    this._state = 'closing';
    this._ws?.close(1000, 'Session closed by provider');
    this._logger.info('OpenAI Realtime session closing');
  }

  on<K extends RealtimeProviderEvent['type']>(
    type: K,
    handler: RealtimeEventHandler<RealtimeProviderEvent & { type: K }>
  ): void {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type)!.add(handler as RealtimeEventHandler);
  }

  off<K extends RealtimeProviderEvent['type']>(
    type: K,
    handler: RealtimeEventHandler<RealtimeProviderEvent & { type: K }>
  ): void {
    this._handlers.get(type)?.delete(handler as RealtimeEventHandler);
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private _buildSessionConfig(instructions: string): Partial<RealtimeSessionResource> {
    return {
      modalities: this._config.modalities as ('text' | 'audio')[],
      instructions,
      voice: this._config.voice,
      input_audio_format: this._config.inputAudioFormat,
      output_audio_format: this._config.outputAudioFormat,
      input_audio_transcription: this._config.enableInputTranscription
        ? { model: this._config.transcriptionModel }
        : null,
      turn_detection: this._config.turnDetection,
      temperature: this._config.temperature,
      max_response_output_tokens: this._config.maxResponseOutputTokens,
    };
  }

  private _sendEvent(event: ClientEvent): void {
    if (this._ws?.readyState !== WebSocket.OPEN) {
      this._logger.warn('Attempted to send event on non-open WebSocket', { type: event.type });
      return;
    }
    this._ws.send(JSON.stringify(event));
  }

  private _handleServerEvent(event: ServerEvent): void {
    const ts = Date.now();

    switch (event.type) {
      case 'session.updated':
        this._emit({ type: 'realtime.session_updated', timestamp: ts, eventId: event.event_id, session: event.session });
        break;

      case 'response.created':
        this._emit({ type: 'realtime.response_started', timestamp: ts, eventId: event.event_id, responseId: event.response.id });
        break;

      case 'response.audio.delta':
        this._emit({ type: 'realtime.audio_received', timestamp: ts, eventId: event.event_id, responseId: event.response_id, itemId: event.item_id, delta: event.delta });
        break;

      case 'response.audio_transcript.delta':
        this._emit({ type: 'realtime.transcript_delta', timestamp: ts, eventId: event.event_id, responseId: event.response_id, itemId: event.item_id, delta: event.delta });
        break;

      case 'response.audio_transcript.done':
        this._emit({ type: 'realtime.transcript_completed', timestamp: ts, eventId: event.event_id, responseId: event.response_id, itemId: event.item_id, transcript: event.transcript });
        break;

      case 'response.text.delta':
        this._emit({ type: 'realtime.response_delta', timestamp: ts, eventId: event.event_id, responseId: event.response_id, itemId: event.item_id, delta: event.delta });
        break;

      case 'response.done':
        this._emit({
          type: 'realtime.response_completed',
          timestamp: ts,
          eventId: event.event_id,
          responseId: event.response.id,
          status: event.response.status as 'completed' | 'cancelled' | 'failed' | 'incomplete',
          totalTokens: event.response.usage?.total_tokens ?? 0,
          inputTokens: event.response.usage?.input_tokens ?? 0,
          outputTokens: event.response.usage?.output_tokens ?? 0,
        });
        break;

      case 'response.function_call_arguments.done':
        this._emit({ type: 'realtime.tool_call', timestamp: ts, eventId: event.event_id, responseId: event.response_id, itemId: event.item_id, callId: event.call_id, functionName: event.name, arguments: event.arguments });
        break;

      case 'input_audio_buffer.speech_started':
        this._emit({ type: 'realtime.speech_started', timestamp: ts, eventId: event.event_id, itemId: event.item_id, audioStartMs: event.audio_start_ms });
        break;

      case 'input_audio_buffer.speech_stopped':
        this._emit({ type: 'realtime.speech_stopped', timestamp: ts, eventId: event.event_id, itemId: event.item_id, audioEndMs: event.audio_end_ms });
        break;

      case 'rate_limits.updated':
        this._emit({ type: 'realtime.rate_limit', timestamp: ts, eventId: event.event_id, rateLimits: event.rate_limits });
        break;

      case 'error':
        this._logger.error('OpenAI Realtime server error', { code: event.error.code, message: event.error.message });
        this._emit({ type: 'realtime.error', timestamp: ts, eventId: event.event_id, errorType: event.error.type, errorCode: event.error.code, message: event.error.message, fatal: false });
        break;

      default:
        break;
    }
  }

  private _emit(event: RealtimeProviderEvent): void {
    const handlers = this._handlers.get(event.type);
    if (!handlers) return;
    Array.from(handlers).forEach((handler) => {
      try {
        handler(event);
      } catch (err) {
        this._logger.warn('RealtimeSession event handler threw', { type: event.type, error: String(err) });
      }
    });
  }

  private _assertConnected(): void {
    if (!this.isConnected) {
      throw new ProviderError(
        'OpenAIRealtimeSession is not connected',
        ErrorCode.PROVIDER_UNAVAILABLE,
        'openai-realtime'
      );
    }
  }
}
