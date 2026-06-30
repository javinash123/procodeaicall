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

import type { ILogger } from '../logger/index.js';
import type { IMediaSession } from '../media/MediaSession.js';
import type { IOpenAIRealtimeSession } from '../providers/openai/OpenAIRealtimeSession.js';
import type { Timestamp } from '../types/index.js';
import { VoiceEngineError, ErrorCode } from '../errors/index.js';

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
export class RealtimeBridge implements IRealtimeBridge {
  private readonly _provider: IOpenAIRealtimeSession;
  private readonly _mediaSession: IMediaSession;
  private readonly _logger: ILogger;
  private readonly _sessionId: string;

  private _connected = false;
  private _destroyed = false;

  private readonly _handlers = new Map<BridgeEventType, Set<BridgeEventHandler>>();

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
   */
  async disconnect(): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;
    this._connected = false;

    this._logger.info('RealtimeBridge disconnecting');
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
