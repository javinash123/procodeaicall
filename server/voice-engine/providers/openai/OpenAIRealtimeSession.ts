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
import { CallTrace } from '../../debug/CallTrace.js';
import type { ConversationSessionContext } from './ConversationSessionContext.js';
import { recordTrace } from '../../diagnostics/CallTraceWriter.js';
import fs   from 'fs';
import path from 'path';

type SessionState = 'idle' | 'connecting' | 'connected' | 'closing' | 'closed';

/**
 * The public interface for a single OpenAI Realtime conversation session.
 */
export interface IOpenAIRealtimeSession {
  /** Whether the WebSocket connection is currently open. */
  readonly isConnected: boolean;
  /** The OpenAI-assigned session ID, available after `connect()` resolves. */
  readonly sessionId: string | null;
  /**
   * The live conversation session context (Policy + State engines), or null
   * when the session was opened without a `policyContext`.
   * Use this to dispatch signals (objections, pain points, etc.) at any time.
   */
  readonly conversationContext: ConversationSessionContext | null;

  connect(): Promise<void>;
  sendAudio(base64Chunk: string): void;
  sendText(text: string): Promise<void>;
  interrupt(): Promise<void>;
  /**
   * Manually closes the current inbound audio buffer and signals the model
   * that the caller has finished speaking. Returns `true` if the local buffer
   * had data and the commit was sent; `false` if the buffer was empty (server
   * VAD may have already consumed it). Only call `createResponse()` when true.
   */
  commitBuffer(): boolean;
  /**
   * Triggers a model response immediately. Must be called after `commitBuffer()`
   * when server VAD is disabled.
   */
  createResponse(): void;
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

  /** Optional conversation intelligence context wired at construction time. */
  private readonly _conversationContext: ConversationSessionContext | null;

  /** Call-session ID used as key for the structured execution trace. */
  private readonly _traceSessionId: string | null;

  /** Rolling buffer of the last completed agent transcript (for question detection). */
  private _lastAgentTranscript: string | null = null;

  private _ws: WebSocket | null = null;
  private _state: SessionState = 'idle';
  private _sessionId: string | null = null;
  private _greetingSent = false;

  private readonly _handlers = new Map<string, Set<RealtimeEventHandler>>();

  /** [V2 TRACE] first-only guards */
  private _traceFirstTranscript = true;
  private _traceFirstAIResponse = true;

  // ── Per-turn latency timestamps ──────────────────────────────────────────────
  // T1 = VAD speech_stopped, T2 = response.created, T3 = first audio delta.
  // Reset at the start of each new customer turn (speech_stopped).
  private _latT1SpeechStopped  = 0;
  private _latT2ResponseCreated = 0;
  private _latT3FirstAudioDelta = 0;
  private _latAudioDeltaSeen    = false;

  // ── [DEBUG] one-shot audio capture ──────────────────────────────────────────
  // Accumulates raw base64 deltas for the first response only.
  // Written to disk on response.output_audio.done. Remove when no longer needed.
  private _dbgAudioChunks: string[] = [];
  private _dbgAudioSaved  = false;

  /**
   * Tracks bytes appended to the input buffer since the last commit/clear.
   * Used by `commitBuffer()` to detect whether the server VAD has already
   * consumed (silently cleared) the buffer before our manual commit fires.
   */
  private _inputBufferBytesSent = 0;

  constructor(
    config: OpenAIRealtimeConfig,
    initialInstructions: string,
    logger: ILogger,
    metrics: IMetricsCollector,
    conversationContext?: ConversationSessionContext,
    traceSessionId?: string
  ) {
    this._config = config;
    this._conversationContext = conversationContext ?? null;
    this._traceSessionId = traceSessionId ?? null;
    // If a conversation context is provided, it generates the full initial
    // instruction (policy + live state section).  Otherwise fall back to the
    // raw string passed by the caller.
    this._initialInstructions = conversationContext
      ? conversationContext.buildInitialInstruction()
      : initialInstructions;
    this._logger = logger.child({ component: 'OpenAIRealtimeSession' });
    this._metrics = metrics;
  }

  get isConnected(): boolean {
    return this._state === 'connected' && this._ws?.readyState === WebSocket.OPEN;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  get conversationContext(): ConversationSessionContext | null {
    return this._conversationContext;
  }

  /**
   * Opens the WebSocket connection and waits for the `session.created` event.
   * @throws {ProviderError} if the connection cannot be established within the configured timeout.
   */
  async connect(): Promise<void> {
    console.log(`[V2 TRACE] 6. OpenAIRealtimeSession.connect()  state=${this._state}`);
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
        },
      });

      this._ws = ws;

      ws.on('open', () => {
        console.log(`[V2 TRACE] 7. Realtime websocket connected  url=${url}`);
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

        if (process.env.VOICE_ENGINE_DEBUG === 'true') {
          console.log('[OPENAI INBOUND]\n' + JSON.stringify(event, null, 2));
        }

        if (event.type === 'session.created') {
          clearTimeout(timeout);
          this._sessionId = event.session.id ?? null;
          this._state = 'connected';
          this._logger.info('OpenAI Realtime session created', { sessionId: this._sessionId });

          this._record('session.created', { openAiSessionId: this._sessionId });

          // Schema capture — writes the raw session.created payload for audit purposes
          try {
            fs.writeFileSync(
              '/tmp/openai-session-created.json',
              JSON.stringify(event, null, 2),
            );
          } catch { /* non-fatal */ }

          const sessionPayload = this._buildSessionConfig(this._initialInstructions);
          const sessionUpdateEvent = { type: 'session.update' as const, session: sessionPayload };
          console.log('[AUDIT] session.update sent:\n' + JSON.stringify(sessionUpdateEvent, null, 2));
          this._sendEvent(sessionUpdateEvent);

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
        CallTrace.printAndDestroy(this._traceSessionId);
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
    // Track approximate decoded bytes so commitBuffer() can detect empty-buffer situations
    this._inputBufferBytesSent += Math.floor((base64Chunk.length * 3) / 4);
    CallTrace.recordAppend(this._traceSessionId, base64Chunk.length);
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
    this._inputBufferBytesSent = 0; // buffer was cleared, reset counter
    this._logger.debug('Sent interrupt (response.cancel + buffer clear)');
  }

  /**
   * Manually closes the inbound audio buffer (signals end-of-speech).
   * Returns `true` if the local buffer had data and the commit was sent,
   * `false` if the buffer was empty (e.g. server VAD already consumed it).
   * Callers should only call `createResponse()` when this returns `true`.
   */
  commitBuffer(): boolean {
    if (this._ws?.readyState !== WebSocket.OPEN) return false;
    const hadData = this._inputBufferBytesSent > 0;
    const bytesSnap = this._inputBufferBytesSent;
    this._inputBufferBytesSent = 0;
    if (!hadData) {
      console.log('[CommitBuffer] Skipped — local buffer counter is 0 (server VAD likely cleared it)');
      return false;
    }
    console.log(`[CommitBuffer] Committing ${bytesSnap} bytes from local counter`);
    this._sendEvent({ type: 'input_audio_buffer.commit' });
    return true;
  }

  /**
   * Triggers a model response immediately.
   * Use after `commitBuffer()` when managing turns manually.
   */
  createResponse(): void {
    if (this._ws?.readyState !== WebSocket.OPEN) return;
    this._sendEvent({ type: 'response.create' });
  }

  /**
   * Hot-updates the system instructions for the current session.
   */
  async updateInstructions(instructions: string): Promise<void> {
    this._assertConnected();
    this._sendEvent({
      type: 'session.update',
      session: { type: 'realtime', instructions },
    });
  }

  /**
   * Hot-swaps the list of tools available to the model.
   */
  async updateTools(tools: readonly Tool[]): Promise<void> {
    this._assertConnected();
    this._sendEvent({
      type: 'session.update',
      session: { type: 'realtime', tools: tools as Tool[] },
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

  /** Records a trace entry keyed to the call session (no-op if no traceSessionId). */
  private _record(
    event: string,
    payloadSummary: Record<string, unknown>,
    opts: { success?: boolean; skipped?: boolean; skipReason?: string } = {}
  ): void {
    if (!this._traceSessionId) return;
    recordTrace(this._traceSessionId, {
      component: 'OpenAIRealtimeSession',
      event,
      payloadSummary,
      success:    opts.success    ?? true,
      skipped:    opts.skipped    ?? false,
      skipReason: opts.skipReason,
    });
  }

  /**
   * Maps an internal audio format name to the MIME type string required by
   * the gpt-realtime session schema.
   *
   * Evidence: live runtime test against wss://api.openai.com/v1/realtime?model=gpt-realtime
   *   - 'audio/pcmu' accepted for G.711 µ-law (telephony)
   *   - 'audio/pcma' accepted for G.711 A-law (telephony)
   *   - 'audio/pcm'  accepted for raw PCM
   *   - 'audio/g711-ulaw' rejected (invalid_value)
   *   - format.rate field rejected (unknown_parameter)
   */
  private _toAudioMime(format: string): 'audio/pcm' | 'audio/pcmu' | 'audio/pcma' {
    switch (format) {
      case 'g711_ulaw': return 'audio/pcmu';
      case 'g711_alaw': return 'audio/pcma';
      case 'pcm16':     return 'audio/pcm';
      default:          return 'audio/pcm';
    }
  }

  /**
   * Resolves the outbound (OpenAI → us) audio MIME type.
   *
   * Controlled ONLY by the `VOICE_OUTPUT_FORMAT` env var:
   *   - 'pcmu' (default): request G.711 μ-law from OpenAI — passed straight
   *     through to Exotel by ExotelAdapter, unchanged from prior behaviour.
   *   - 'pcm': request raw 16-bit PCM from OpenAI — ExotelAdapter converts it
   *     to G.711 μ-law before sending to Exotel.
   * Any other/unset value falls back to the existing configured default.
   */
  private _resolveOutputAudioMime(): 'audio/pcm' | 'audio/pcmu' | 'audio/pcma' {
    const mode = (process.env['VOICE_OUTPUT_FORMAT'] || 'pcmu').toLowerCase();
    if (mode === 'pcm')  return 'audio/pcm';
    if (mode === 'pcmu') return 'audio/pcmu';
    return this._toAudioMime(this._config.outputAudioFormat);
  }

  private _buildSessionConfig(instructions: string): Partial<RealtimeSessionResource> {
    return {
      type: 'realtime',
      instructions,
      // NOTE: `format.rate` is omitted — the API rejects it as unknown_parameter.
      // turn_detection is explicitly null here — client-side VAD (energy-based
      // silence detection) is implemented in RealtimeBridge and is more reliable
      // for Exotel 8kHz→24kHz upsampled phone audio than OpenAI's server VAD,
      // which silently ignores the nested audio.input.turn_detection config.
      audio: {
        input: {
          format: { type: 'audio/pcm' as const, rate: 24000 },
          transcription: this._config.enableInputTranscription
            ? { model: this._config.transcriptionModel }
            : null,
          // Server VAD is intentionally configured with a very high threshold and
          // a long silence window so it almost never auto-commits the buffer.
          //
          // Root cause of the "buffer too small: 0.00ms" errors:
          //   The default silence_duration_ms=200 causes the server to silently
          //   clear the buffer every 200ms of audio that doesn't meet the 0.5
          //   speech threshold.  Narrowband phone audio upsampled from 8→24 kHz
          //   never meets that threshold.  By the time our client VAD fires its
          //   manual commitBuffer(), the server has already cleared the buffer.
          //
          // Fix: threshold=0.9 + silence_duration_ms=30000 + create_response=false
          //   • threshold=0.9  — won't trigger on low-energy narrowband audio
          //   • silence_duration_ms=30000 — even if triggered, won't auto-commit
          //     until 30s of silence (our client VAD commits at 700ms)
          //   • create_response=false — no double-response if VAD somehow fires
          turn_detection: {
            type: 'server_vad' as const,
            threshold: 0.9,
            silence_duration_ms: 10000, // API max is 10000ms; 10s >> our 700ms client VAD window
            prefix_padding_ms: 300,
            create_response: false,
          },
        },
        output: {
          format: { type: this._resolveOutputAudioMime(), rate: 24000 },
          voice: this._config.voice,
        },
      },
    };
  }

  private _sendEvent(event: ClientEvent): void {
    if (this._ws?.readyState !== WebSocket.OPEN) {
      this._logger.warn('Attempted to send event on non-open WebSocket', { type: event.type });
      return;
    }
    if (process.env.VOICE_ENGINE_DEBUG === 'true') {
      console.log('[OPENAI OUTBOUND]\n' + JSON.stringify(event, null, 2));
    }
    this._ws.send(JSON.stringify(event));
  }

  private _handleServerEvent(event: ServerEvent): void {
    const ts = Date.now();

    switch (event.type) {
      case 'session.updated': {
        this._record('session.updated', { openAiSessionId: this._sessionId });
        // Diagnostic: print what the server actually applied so we can confirm
        // turn_detection and audio formats are recognised.
        const s = event.session as any;
        console.log('[SESSION.UPDATED] Applied config from OpenAI:', JSON.stringify({
          turn_detection:    s?.audio?.input?.turn_detection ?? s?.turn_detection ?? 'MISSING',
          input_audio_fmt:   s?.audio?.input?.format        ?? s?.input_audio_format ?? 'MISSING',
          output_audio_fmt:  s?.audio?.output?.format       ?? s?.output_audio_format ?? 'MISSING',
          voice:             s?.audio?.output?.voice        ?? s?.voice ?? 'MISSING',
        }, null, 2));
        this._emit({ type: 'realtime.session_updated', timestamp: ts, eventId: event.event_id, session: event.session });
        if (!this._greetingSent) {
          this._greetingSent = true;
          setTimeout(() => {
            if (this._ws?.readyState === WebSocket.OPEN && this._state === 'connected') {
              this._sendEvent({ type: 'response.create' });
            }
          }, 250);
        }
        break;
      }

      case 'response.created':
        this._record('response.created', { responseId: event.response.id, status: event.response.status });
        CallTrace.recordOpenAIEvent(this._traceSessionId, event.type);
        if (this._traceFirstAIResponse) {
          this._traceFirstAIResponse = false;
          console.log(`[V2 TRACE] 13. First AI response received  responseId=${event.response.id}`);
        }
        this._latT2ResponseCreated = ts;
        this._emit({ type: 'realtime.response_started', timestamp: ts, eventId: event.event_id, responseId: event.response.id });
        break;

      case 'response.output_audio.delta':       // gpt-realtime (GA)
      case 'response.audio.delta':              // gpt-4o-realtime-preview (legacy)
        CallTrace.recordOpenAIEvent(this._traceSessionId, event.type);
        this._record('response.audio.delta', {
          responseId: event.response_id,
          itemId:     event.item_id,
          deltaBytes: Math.round(event.delta.length * 0.75),
        });
        // T3 — first audio delta this turn: print one latency summary line
        if (!this._latAudioDeltaSeen) {
          this._latAudioDeltaSeen    = true;
          this._latT3FirstAudioDelta = ts;
          const t1 = this._latT1SpeechStopped;
          const t2 = this._latT2ResponseCreated;
          const t3 = ts;
          const vadToResponse      = t2 && t1 ? t2 - t1 : -1;
          const responseToAudio    = t2 && t3 ? t3 - t2 : -1;
          const total              = t1 && t3 ? t3 - t1 : -1;
          console.log(
            `[LATENCY] VAD→Response=${vadToResponse}ms  Response→FirstAudio=${responseToAudio}ms` +
            `  FirstAudio→ExotelSend≈0ms  Total=${total}ms`
          );
        }
        this._emit({ type: 'realtime.audio_received', timestamp: ts, eventId: event.event_id, responseId: event.response_id, itemId: event.item_id, delta: event.delta });
        // [DEBUG] accumulate first-response audio deltas
        if (!this._dbgAudioSaved) {
          this._dbgAudioChunks.push(event.delta);
          if (process.env['NIJVOX_DEBUG_AUDIO'] === '1') {
            const b64Len      = event.delta.length;
            const decodedBytes = Buffer.from(event.delta, 'base64').byteLength;
            const runningTotal = this._dbgAudioChunks.reduce((s, c) => s + Buffer.from(c, 'base64').byteLength, 0);
            console.log(
              `[AudioTrace][1-OpenAISession] delta #${this._dbgAudioChunks.length}` +
              `  responseId=${event.response_id}` +
              `  b64Len=${b64Len}  decodedBytes=${decodedBytes}` +
              `  runningTotal=${runningTotal}` +
              `  changed=false  concatenated=false  copied=false  merged=false`,
            );
          }
        }
        break;

      case 'response.output_audio_transcript.delta': // gpt-realtime (GA)
      case 'response.audio_transcript.delta':        // gpt-4o-realtime-preview (legacy)
        this._emit({ type: 'realtime.transcript_delta', timestamp: ts, eventId: event.event_id, responseId: event.response_id, itemId: event.item_id, delta: event.delta });
        break;

      case 'response.output_audio_transcript.done': // gpt-realtime (GA)
      case 'response.audio_transcript.done':        // gpt-4o-realtime-preview (legacy)
        if (this._traceFirstTranscript) {
          this._traceFirstTranscript = false;
          console.log(`[V2 TRACE] 12. First transcript received  transcript="${(event.transcript ?? '').slice(0, 80)}"`);
        }
        // Capture completed agent transcript for question-detection in onAgentTurnCompleted()
        this._lastAgentTranscript = event.transcript ?? null;
        this._emit({ type: 'realtime.transcript_completed', timestamp: ts, eventId: event.event_id, responseId: event.response_id, itemId: event.item_id, transcript: event.transcript });
        break;

      case 'response.text.delta':
        this._emit({ type: 'realtime.response_delta', timestamp: ts, eventId: event.event_id, responseId: event.response_id, itemId: event.item_id, delta: event.delta });
        break;

      case 'response.done': {
        // Tracer: first response.done = greeting complete; subsequent = customer turn complete
        if (!CallTrace.isGreetingDone(this._traceSessionId)) {
          CallTrace.greetingDone(this._traceSessionId);
        } else {
          CallTrace.recordOpenAIEvent(this._traceSessionId, event.type);
        }

        const responseStatus = event.response.status as 'completed' | 'cancelled' | 'failed' | 'incomplete';
        this._record('response.done', {
          responseId:   event.response.id,
          status:       responseStatus,
          totalTokens:  event.response.usage?.total_tokens  ?? 0,
          inputTokens:  event.response.usage?.input_tokens  ?? 0,
          outputTokens: event.response.usage?.output_tokens ?? 0,
        });
        this._emit({
          type: 'realtime.response_completed',
          timestamp: ts,
          eventId: event.event_id,
          responseId: event.response.id,
          status: responseStatus,
          totalTokens: event.response.usage?.total_tokens ?? 0,
          inputTokens: event.response.usage?.input_tokens ?? 0,
          outputTokens: event.response.usage?.output_tokens ?? 0,
        });

        // ── Conversation State: record agent turn & dynamically update instructions ──
        if (this._conversationContext && responseStatus === 'completed') {
          const result = this._conversationContext.onAgentTurnCompleted(
            this._lastAgentTranscript ?? undefined
          );
          this._lastAgentTranscript = null;

          if (result.stateChanged && result.updatedInstruction) {
            this._logger.debug(
              'ConversationState changed — updating OpenAI session instructions',
              { stage: result.currentStageLabel }
            );
            this._sendEvent({
              type: 'session.update',
              session: { type: 'realtime', instructions: result.updatedInstruction },
            });
          }
        }
        break;
      }

      case 'response.function_call_arguments.done':
        this._record('response.function_call_arguments.done', {
          responseId:   event.response_id,
          itemId:       event.item_id,
          callId:       event.call_id,
          functionName: event.name,
        });
        this._emit({ type: 'realtime.tool_call', timestamp: ts, eventId: event.event_id, responseId: event.response_id, itemId: event.item_id, callId: event.call_id, functionName: event.name, arguments: event.arguments });
        break;

      case 'input_audio_buffer.speech_started':
        this._record('input_audio_buffer.speech_started', { itemId: event.item_id, audioStartMs: event.audio_start_ms });
        CallTrace.recordOpenAIEvent(this._traceSessionId, event.type);
        this._emit({ type: 'realtime.speech_started', timestamp: ts, eventId: event.event_id, itemId: event.item_id, audioStartMs: event.audio_start_ms });
        // ── Conversation State: record barge-in interruption ──────────────────
        if (this._conversationContext) {
          this._conversationContext.onCustomerInterrupted();
        }
        break;

      case 'input_audio_buffer.speech_stopped':
        this._record('input_audio_buffer.speech_stopped', { itemId: event.item_id, audioEndMs: event.audio_end_ms });
        CallTrace.recordOpenAIEvent(this._traceSessionId, event.type);
        // T1 — reset latency counters for this new turn
        this._latT1SpeechStopped  = ts;
        this._latT2ResponseCreated = 0;
        this._latT3FirstAudioDelta = 0;
        this._latAudioDeltaSeen    = false;
        this._emit({ type: 'realtime.speech_stopped', timestamp: ts, eventId: event.event_id, itemId: event.item_id, audioEndMs: event.audio_end_ms });
        break;

      case 'conversation.item.input_audio_transcription.completed':
        this._emit({ type: 'realtime.input_transcript_completed', timestamp: ts, eventId: event.event_id, itemId: event.item_id, transcript: event.transcript });
        break;

      case 'conversation.item.input_audio_transcription.delta':
        this._emit({ type: 'realtime.input_transcript_delta', timestamp: ts, eventId: event.event_id, itemId: event.item_id, delta: event.delta });
        break;

      case 'conversation.item.input_audio_transcription.failed':
        this._logger.warn('Input audio transcription failed', { itemId: event.item_id, error: event.error.message });
        this._emit({ type: 'realtime.error', timestamp: ts, eventId: event.event_id, errorType: event.error.type, errorCode: event.error.code, message: `Transcription failed: ${event.error.message}`, fatal: false });
        break;

      // ── Silent handlers: acknowledged but not surfaced upstream ──────────────
      case 'conversation.created':
      case 'conversation.item.created':
      case 'input_audio_buffer.cleared':
      case 'response.content_part.added':
      case 'response.content_part.done':
      case 'response.text.done':
        break;

      case 'input_audio_buffer.committed':
        this._record('input_audio_buffer.committed', { itemId: (event as any).item_id ?? null });
        CallTrace.recordOpenAIEvent(this._traceSessionId, event.type);
        break;

      case 'response.function_call_arguments.delta':
        this._record('response.function_call_arguments.delta', {
          responseId: (event as any).response_id,
          itemId:     (event as any).item_id,
          deltaLen:   ((event as any).delta ?? '').length,
        });
        break;

      case 'response.output_item.added':
        this._record('response.output_item.added', {
          itemType: (event as any).item?.type ?? null,
          itemId:   (event as any).item?.id   ?? null,
        });
        break;

      case 'response.output_item.done':
        this._record('response.output_item.done', {
          itemType: (event as any).item?.type ?? null,
          itemId:   (event as any).item?.id   ?? null,
        });
        break;

      case 'response.output_audio.done':  // gpt-realtime (GA)
      case 'response.audio.done':         // gpt-4o-realtime-preview (legacy)
        this._record('response.audio.done', {
          responseId: (event as any).response_id ?? null,
          itemId:     (event as any).item_id     ?? null,
        });
        // [DEBUG] flush accumulated audio to disk (first response only)
        // Gated by NIJVOX_DEBUG_AUDIO=1 — off by default, never runs in production.
        if (
          !this._dbgAudioSaved &&
          this._dbgAudioChunks.length > 0 &&
          process.env['NIJVOX_DEBUG_AUDIO'] === '1'
        ) {
          try {
            const rawBuf = Buffer.concat(
              this._dbgAudioChunks.map(b64 => Buffer.from(b64, 'base64')),
            );
            const logsDir = path.resolve('logs');
            fs.mkdirSync(logsDir, { recursive: true });
            const rawPath = path.join(logsDir, 'openai-audio.raw');
            const wavPath = path.join(logsDir, 'openai-audio.wav');
            fs.writeFileSync(rawPath, rawBuf);
            // G.711 μ-law WAV header: AudioFormat=7, 8 kHz, mono, cbSize=0
            // Subchunk1Size = 18 (standard for non-PCM formats)
            const hdr = Buffer.alloc(46);
            let o = 0;
            hdr.write('RIFF', o, 'ascii');            o += 4;
            hdr.writeUInt32LE(38 + rawBuf.length, o); o += 4; // ChunkSize = 38 + dataLen
            hdr.write('WAVE', o, 'ascii');            o += 4;
            hdr.write('fmt ', o, 'ascii');            o += 4;
            hdr.writeUInt32LE(18,   o);  o += 4; // Subchunk1Size (18 for non-PCM)
            hdr.writeUInt16LE(7,    o);  o += 2; // AudioFormat = MULAW
            hdr.writeUInt16LE(1,    o);  o += 2; // NumChannels = 1
            hdr.writeUInt32LE(8000, o);  o += 4; // SampleRate
            hdr.writeUInt32LE(8000, o);  o += 4; // ByteRate (8000 × 1 × 1)
            hdr.writeUInt16LE(1,    o);  o += 2; // BlockAlign
            hdr.writeUInt16LE(8,    o);  o += 2; // BitsPerSample
            hdr.writeUInt16LE(0,    o);  o += 2; // cbSize = 0
            hdr.write('data', o, 'ascii'); o += 4;
            hdr.writeUInt32LE(rawBuf.length, o);
            const wavBuf = Buffer.concat([hdr, rawBuf]);
            fs.writeFileSync(wavPath, wavBuf);
            // Flag only set after both writes succeed
            this._dbgAudioSaved = true;
            console.log(
              `Saved OpenAI audio:\n` +
              `  logs/openai-audio.raw  (${rawBuf.length} bytes)\n` +
              `  logs/openai-audio.wav  (${wavBuf.length} bytes)`,
            );
          } catch (err) {
            console.error('[DEBUG] Failed to save OpenAI audio:', err);
          }
        }
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
