/**
 * @module RealtimeBridge
 *
 * Connects a `MediaSession` to a `IOpenAIRealtimeSession`, owning the
 * bidirectional audio streaming channel, interrupt forwarding, and all
 * provider-side session events.
 *
 * ## Responsibilities
 * - Maintains the WebSocket session to the realtime AI provider.
 * - Forwards inbound audio (caller → provider) via `forwardAudio()`.
 * - Emits outbound audio events (provider → caller) via the `bridge.audio_ready`
 *   event for `OutboundAudioFlow` to consume.
 * - Detects server-side speech start (VAD barge-in) and calls
 *   `IMediaSession.signalInterruption()`.
 * - Exposes `interrupt()` to cancel the current provider response.
 *
 * ## Rules
 * - No OpenAI SDK imports.
 * - No Exotel protocol imports.
 * - Integration only through public interfaces.
 * - No business logic, no CRM, no MongoDB.
 *
 * ## Lifecycle
 * ```
 * new RealtimeBridge(deps)
 *   └─► connect()         — opens provider session, wires all event handlers
 *         ├─► forwardAudio(base64)   — sends caller audio to provider
 *         ├─► interrupt()            — cancels current provider response
 *         └─► disconnect()          — closes provider session, removes all listeners
 * ```
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ILogger } from '../logger/index.js';
import type { IMediaSession } from '../media/MediaSession.js';
import type { IOpenAIRealtimeSession } from '../providers/openai/OpenAIRealtimeSession.js';
import type { Timestamp } from '../types/index.js';
import { VoiceEngineError, ErrorCode } from '../errors/index.js';
import { TurnDiagnosticsCollector } from '../diagnostics/index.js';
import type { TurnDiagnosticsLog } from '../diagnostics/index.js';

// ─── Bridge Event Types ───────────────────────────────────────────────────────

/** Payload emitted when the provider sends an outbound audio delta. */
export interface BridgeAudioReadyEvent {
  readonly type: 'bridge.audio_ready';
  /** Base64-encoded audio delta from the provider. */
  readonly base64Delta: string;
  /** Provider response identifier. */
  readonly responseId: string;
  /** Provider item identifier. */
  readonly itemId: string;
  /** Wall-clock timestamp. */
  readonly timestamp: Timestamp;
}

/** Payload emitted when the provider WebSocket disconnects. */
export interface BridgeDisconnectedEvent {
  readonly type: 'bridge.disconnected';
  /** WebSocket close code. */
  readonly code: number;
  /** Human-readable disconnect reason. */
  readonly reason: string;
  /** Whether the disconnect was clean (code === 1000). */
  readonly wasClean: boolean;
  readonly timestamp: Timestamp;
}

/** Payload emitted when the provider reports an error. */
export interface BridgeErrorEvent {
  readonly type: 'bridge.error';
  readonly message: string;
  readonly errorType: string;
  /** Whether this error is fatal to the session. */
  readonly fatal: boolean;
  readonly timestamp: Timestamp;
}

/** Payload emitted when the provider VAD detects speech start (barge-in signal). */
export interface BridgeSpeechDetectedEvent {
  readonly type: 'bridge.speech_detected';
  readonly audioStartMs: number;
  readonly timestamp: Timestamp;
}

/** Union of all events emitted by `RealtimeBridge`. */
export type BridgeEvent =
  | BridgeAudioReadyEvent
  | BridgeDisconnectedEvent
  | BridgeErrorEvent
  | BridgeSpeechDetectedEvent;

/** String union of all bridge event types. */
export type BridgeEventType = BridgeEvent['type'];

/** Handler signature for a typed bridge event. */
export type BridgeEventHandler<T extends BridgeEvent = BridgeEvent> = (event: T) => void;

// ─── Public Interface ─────────────────────────────────────────────────────────

/**
 * Public contract for the realtime bridge between `MediaSession`
 * and an AI provider realtime session.
 */
export interface IRealtimeBridge {
  /** Whether the provider session is currently connected. */
  readonly isConnected: boolean;

  /**
   * Opens the provider WebSocket session and wires all event handlers.
   * Must be called before `forwardAudio()` or `interrupt()`.
   *
   * @throws {VoiceEngineError} if the provider session fails to connect.
   */
  connect(): Promise<void>;

  /**
   * Forwards a base64-encoded audio payload to the AI provider.
   * Fire-and-forget; silently ignored if not connected.
   *
   * @param base64 - Base64-encoded audio chunk from the caller.
   */
  forwardAudio(base64: string): void;

  /**
   * Cancels the provider's current in-progress response (barge-in).
   * Silently ignored if not connected.
   */
  interrupt(): Promise<void>;

  /**
   * Gracefully closes the provider session and removes all event handlers.
   * Safe to call multiple times; subsequent calls are no-ops.
   */
  disconnect(): Promise<void>;

  /** Subscribes to a typed bridge event. */
  on<T extends BridgeEventType>(
    type: T,
    handler: BridgeEventHandler<Extract<BridgeEvent, { type: T }>>
  ): void;

  /** Unsubscribes from a typed bridge event. */
  off<T extends BridgeEventType>(
    type: T,
    handler: BridgeEventHandler<Extract<BridgeEvent, { type: T }>>
  ): void;
}

// ─── Dependencies ─────────────────────────────────────────────────────────────

/** Injected dependencies for `RealtimeBridge`. */
export interface RealtimeBridgeDependencies {
  /** The AI provider realtime session to bridge. */
  readonly providerSession: IOpenAIRealtimeSession;
  /** The media session that owns this call. */
  readonly mediaSession: IMediaSession;
  /** Structured logger. */
  readonly logger: ILogger;
  /** Session identifier for log correlation. */
  readonly sessionId: string;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Production implementation of `IRealtimeBridge`.
 */
// ─── Call Summary Accumulator ─────────────────────────────────────────────────

interface CallSummaryAccumulator {
  turnCount: number;
  latencies: number[];
  ttftValues: number[];
  sttValues: number[];
  responseDurations: number[];
  interruptions: number;
  stagesSeen: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  errors: string[];
}

function freshAccumulator(): CallSummaryAccumulator {
  return {
    turnCount: 0,
    latencies: [],
    ttftValues: [],
    sttValues: [],
    responseDurations: [],
    interruptions: 0,
    stagesSeen: [],
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
    errors: [],
  };
}

function avg(values: number[]): string {
  if (values.length === 0) return '—';
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return `${Math.round(mean)} ms`;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class RealtimeBridge implements IRealtimeBridge {
  private readonly _provider: IOpenAIRealtimeSession;
  private readonly _mediaSession: IMediaSession;
  private readonly _logger: ILogger;
  private readonly _sessionId: string;

  private _connected = false;
  private _destroyed = false;

  private readonly _handlers = new Map<BridgeEventType, Set<BridgeEventHandler>>();

  /** Diagnostics collector — created in connect(), detached in disconnect(). */
  private _diagnosticsCollector: TurnDiagnosticsCollector | null = null;
  /** Per-call stats accumulated by the onTurnComplete callback. */
  private _summary: CallSummaryAccumulator = freshAccumulator();
  /** Wall-clock ms when connect() completed — for call duration. */
  private _callStartMs = 0;

  constructor(deps: Readonly<RealtimeBridgeDependencies>) {
    this._provider = deps.providerSession;
    this._mediaSession = deps.mediaSession;
    this._logger = deps.logger.child({ component: 'RealtimeBridge', sessionId: deps.sessionId });
    this._sessionId = deps.sessionId;
  }

  // ─── Accessors ───────────────────────────────────────────────────────────────

  get isConnected(): boolean {
    return this._connected && this._provider.isConnected;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  /**
   * Opens the provider WebSocket and registers all event handlers.
   * Automatically attaches `TurnDiagnosticsCollector` — every call logs diagnostics.
   */
  async connect(): Promise<void> {
    this._assertNotDestroyed('connect');

    this._logger.info('RealtimeBridge connecting to provider');

    this._wireProviderHandlers();

    try {
      await this._provider.connect();
    } catch (err) {
      this._logger.error('RealtimeBridge provider connect failed', { error: String(err) });
      throw new VoiceEngineError(
        `RealtimeBridge failed to connect provider: ${String(err)}`,
        ErrorCode.PROVIDER_UNAVAILABLE,
        true,
        { sessionId: this._sessionId }
      );
    }

    this._connected = true;
    this._callStartMs = Date.now();

    // ── Attach diagnostics ────────────────────────────────────────────────────
    // Guard: never create a duplicate collector if connect() is somehow re-entered.
    if (!this._diagnosticsCollector) {
      this._summary = freshAccumulator();

      this._diagnosticsCollector = new TurnDiagnosticsCollector({
        session: this._provider,
        logger: this._logger,
        onTurnComplete: (log: TurnDiagnosticsLog) => {
          // Accumulate stats for the end-of-call summary
          this._summary.turnCount++;
          if (log.totalLatencyMs !== null)     this._summary.latencies.push(log.totalLatencyMs);
          if (log.timeToFirstTokenMs !== null) this._summary.ttftValues.push(log.timeToFirstTokenMs);
          if (log.sttLatencyMs !== null)       this._summary.sttValues.push(log.sttLatencyMs);
          if (log.audioOutputDurationMs !== null) this._summary.responseDurations.push(log.audioOutputDurationMs);
          if (log.interruptionOccurred)        this._summary.interruptions++;
          if (!this._summary.stagesSeen.includes(log.conversationStage)) {
            this._summary.stagesSeen.push(log.conversationStage);
          }
          this._summary.totalInputTokens  += log.inputTokens;
          this._summary.totalOutputTokens += log.outputTokens;
          this._summary.totalCostUsd      += log.estimatedCostUsd;
          this._summary.errors.push(...log.errors);

          // Print the per-turn formatted box (with diagnostics prefix)
          const prefix = '[TURN-DIAGNOSTICS] ';
          const formatted = log.agentTranscript !== null
            ? `${prefix}TURN #${log.turnIndex}  stage=${log.conversationStage}  latency=${log.totalLatencyMs ?? '—'}ms  TTFT=${log.timeToFirstTokenMs ?? '—'}ms  tokens=${log.totalTokens}  cost=$${log.estimatedCostUsd.toFixed(5)}`
            : `${prefix}TURN #${log.turnIndex}  (no transcript)`;

          this._logger.info(formatted, {
            turnIndex: log.turnIndex,
            sessionId: log.sessionId,
            stage: log.conversationStage,
            totalLatencyMs: log.totalLatencyMs,
            timeToFirstTokenMs: log.timeToFirstTokenMs,
            sttLatencyMs: log.sttLatencyMs,
            audioOutputDurationMs: log.audioOutputDurationMs,
            promptSizeChars: log.promptSizeChars,
            audioChunksStreamed: log.audioChunksStreamedCount,
            stageAdvanced: log.stageAdvanced,
            objectionDetected: log.objectionDetected,
            memoryUpdated: log.memoryUpdated,
            interruptionOccurred: log.interruptionOccurred,
            inputTokens: log.inputTokens,
            outputTokens: log.outputTokens,
            totalTokens: log.totalTokens,
            estimatedCostUsd: log.estimatedCostUsd,
            errors: log.errors,
          });
        },
        printLogs: false, // We handle printing ourselves with the prefix above
      });

      this._diagnosticsCollector.attach(this._provider);
      this._logger.info('[TURN-DIAGNOSTICS] Collector attached — diagnostics active for this call', {
        sessionId: this._sessionId,
        providerSessionId: this._provider.sessionId,
      });
    }

    this._logger.info('RealtimeBridge connected');
  }

  /**
   * Forwards caller audio to the AI provider.
   * Fire-and-forget; silently ignored when not connected.
   */
  forwardAudio(base64: string): void {
    if (!this.isConnected || this._destroyed) return;
    this._provider.sendAudio(base64);
  }

  /**
   * Cancels the current provider response (barge-in).
   */
  async interrupt(): Promise<void> {
    if (!this.isConnected || this._destroyed) return;

    this._logger.debug('RealtimeBridge signalling interrupt to provider');
    await this._provider.interrupt();
  }

  /**
   * Closes the provider session and removes all handlers.
   * Automatically detaches `TurnDiagnosticsCollector` and prints a call summary.
   */
  async disconnect(): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;
    this._connected = false;

    this._logger.info('RealtimeBridge disconnecting');

    // ── Detach diagnostics (always, even if close() throws) ───────────────────
    if (this._diagnosticsCollector) {
      try {
        this._diagnosticsCollector.detach();
      } catch {
        // Defensive — diagnostics must never prevent a clean disconnect
      }
      this._diagnosticsCollector = null;

      // Print end-of-call summary to logs
      this._printCallSummary();

      // Persist call summary to JSON file (fire-and-forget, never throws)
      this._persistCallSummaryJson();
    }

    await this._provider.close();
    this._handlers.clear();
  }

  // ─── Event Bus ───────────────────────────────────────────────────────────────

  on<T extends BridgeEventType>(
    type: T,
    handler: BridgeEventHandler<Extract<BridgeEvent, { type: T }>>
  ): void {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type)!.add(handler as BridgeEventHandler);
  }

  off<T extends BridgeEventType>(
    type: T,
    handler: BridgeEventHandler<Extract<BridgeEvent, { type: T }>>
  ): void {
    this._handlers.get(type)?.delete(handler as BridgeEventHandler);
  }

  // ─── Private: Provider Event Wiring ─────────────────────────────────────────

  /**
   * Registers all necessary event handlers on the provider session.
   * Called once during `connect()`.
   */
  private _wireProviderHandlers(): void {
    // Outbound audio from AI → caller
    this._provider.on('realtime.audio_received', (event) => {
      if (this._destroyed) return;
      this._emit({
        type: 'bridge.audio_ready',
        base64Delta: event.delta,
        responseId: event.responseId,
        itemId: event.itemId,
        timestamp: event.timestamp,
      } satisfies BridgeAudioReadyEvent);
    });

    // Server VAD detected caller speech → barge-in signal
    this._provider.on('realtime.speech_started', (event) => {
      if (this._destroyed) return;
      const now = Date.now() as Timestamp;

      this._logger.debug('RealtimeBridge: provider VAD speech_started, signalling interruption', {
        audioStartMs: event.audioStartMs,
      });

      this._emit({
        type: 'bridge.speech_detected',
        audioStartMs: event.audioStartMs,
        timestamp: now,
      } satisfies BridgeSpeechDetectedEvent);

      // Signal barge-in to the media session
      this._mediaSession.signalInterruption(now).catch((err: unknown) => {
        this._logger.warn('RealtimeBridge: mediaSession.signalInterruption failed', {
          error: String(err),
        });
      });
    });

    // Provider WebSocket disconnected
    this._provider.on('realtime.disconnected', (event) => {
      if (this._destroyed) return;
      this._connected = false;

      this._logger.info('RealtimeBridge: provider disconnected', {
        code: event.code,
        reason: event.reason,
      });

      this._emit({
        type: 'bridge.disconnected',
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        timestamp: event.timestamp,
      } satisfies BridgeDisconnectedEvent);
    });

    // Provider error
    this._provider.on('realtime.error', (event) => {
      if (this._destroyed) return;

      this._logger.error('RealtimeBridge: provider error', {
        errorType: event.errorType,
        message: event.message,
        fatal: event.fatal,
      });

      this._emit({
        type: 'bridge.error',
        message: event.message,
        errorType: event.errorType,
        fatal: event.fatal,
        timestamp: event.timestamp,
      } satisfies BridgeErrorEvent);
    });
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  // ─── Private: Call Summary ───────────────────────────────────────────────────

  private _printCallSummary(): void {
    const s = this._summary;
    const callDurationMs = this._callStartMs ? Date.now() - this._callStartMs : 0;
    const durationSec = (callDurationMs / 1000).toFixed(1);

    const stageProgression = s.stagesSeen.length > 0
      ? s.stagesSeen.join(' → ')
      : '—';

    const errorSummary = s.errors.length === 0
      ? 'none'
      : `${s.errors.length} error(s): ${s.errors.slice(0, 3).join(' | ')}${s.errors.length > 3 ? ' …' : ''}`;

    const lines = [
      '[TURN-DIAGNOSTICS] ====================================================',
      '[TURN-DIAGNOSTICS] CALL SUMMARY',
      `[TURN-DIAGNOSTICS]   Session ID         : ${this._sessionId}`,
      `[TURN-DIAGNOSTICS]   Provider Session   : ${this._provider.sessionId ?? '—'}`,
      `[TURN-DIAGNOSTICS]   Duration           : ${durationSec}s`,
      `[TURN-DIAGNOSTICS]   Turns              : ${s.turnCount}`,
      `[TURN-DIAGNOSTICS]   Avg Latency (E2E)  : ${avg(s.latencies)}`,
      `[TURN-DIAGNOSTICS]   Avg TTFT           : ${avg(s.ttftValues)}`,
      `[TURN-DIAGNOSTICS]   Avg STT Latency    : ${avg(s.sttValues)}`,
      `[TURN-DIAGNOSTICS]   Avg Response Dur   : ${avg(s.responseDurations)}`,
      `[TURN-DIAGNOSTICS]   Interruptions      : ${s.interruptions}`,
      `[TURN-DIAGNOSTICS]   Stage Progression  : ${stageProgression}`,
      `[TURN-DIAGNOSTICS]   Token Usage        : in=${s.totalInputTokens.toLocaleString()}  out=${s.totalOutputTokens.toLocaleString()}  total=${(s.totalInputTokens + s.totalOutputTokens).toLocaleString()}`,
      `[TURN-DIAGNOSTICS]   Estimated Cost     : $${s.totalCostUsd.toFixed(5)}`,
      `[TURN-DIAGNOSTICS]   Errors             : ${errorSummary}`,
      '[TURN-DIAGNOSTICS] ====================================================',
    ];

    for (const line of lines) {
      this._logger.info(line);
    }
  }

  /**
   * Persists the call summary to a JSON file under
   * `logs/call-diagnostics/call_<timestamp>_<sessionId>.json`.
   *
   * Never throws — all errors are swallowed to protect the disconnect path.
   */
  private _persistCallSummaryJson(): void {
    try {
      const s = this._summary;
      const callDurationMs = this._callStartMs ? Date.now() - this._callStartMs : 0;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      const record = {
        sessionId:         this._sessionId,
        providerSessionId: this._provider.sessionId ?? null,
        callStartedAt:     this._callStartMs
          ? new Date(this._callStartMs).toISOString()
          : null,
        callEndedAt:       new Date().toISOString(),
        callDurationMs,
        turnCount:         s.turnCount,
        interruptions:     s.interruptions,
        stageProgression:  s.stagesSeen,
        avgLatencyMs:      s.latencies.length
          ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length)
          : null,
        avgTtftMs:         s.ttftValues.length
          ? Math.round(s.ttftValues.reduce((a, b) => a + b, 0) / s.ttftValues.length)
          : null,
        avgSttLatencyMs:   s.sttValues.length
          ? Math.round(s.sttValues.reduce((a, b) => a + b, 0) / s.sttValues.length)
          : null,
        avgResponseDurMs:  s.responseDurations.length
          ? Math.round(s.responseDurations.reduce((a, b) => a + b, 0) / s.responseDurations.length)
          : null,
        totalInputTokens:  s.totalInputTokens,
        totalOutputTokens: s.totalOutputTokens,
        totalTokens:       s.totalInputTokens + s.totalOutputTokens,
        estimatedCostUsd:  s.totalCostUsd,
        errors:            s.errors,
      };

      const dir = path.join(process.cwd(), 'logs', 'call-diagnostics');
      fs.mkdirSync(dir, { recursive: true });

      const filename = `call_${timestamp}_${this._sessionId}.json`;
      const filepath = path.join(dir, filename);
      fs.writeFileSync(filepath, JSON.stringify(record, null, 2), 'utf8');

      this._logger.info('[TURN-DIAGNOSTICS] Call summary persisted to JSON', { filepath });
    } catch (err) {
      // Never let file I/O errors interrupt the disconnect path
      this._logger.warn('[TURN-DIAGNOSTICS] Failed to persist call summary JSON', {
        error: String(err),
      });
    }
  }

  private _assertNotDestroyed(method: string): void {
    if (this._destroyed) {
      throw new VoiceEngineError(
        `RealtimeBridge.${method}() called after disconnect()`,
        ErrorCode.PIPELINE_ABORTED,
        false,
        { sessionId: this._sessionId }
      );
    }
  }

  private _emit(event: BridgeEvent): void {
    const handlers = this._handlers.get(event.type);
    if (!handlers) return;
    Array.from(handlers).forEach((handler) => {
      try {
        handler(event);
      } catch (err) {
        this._logger.warn('RealtimeBridge: event handler threw', {
          type: event.type,
          error: String(err),
        });
      }
    });
  }
}
