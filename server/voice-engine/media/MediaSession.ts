/**
 * @module MediaSession
 *
 * The top-level coordinator for a single live phone call at the media layer.
 *
 * ## Purpose
 * `MediaSession` is the single object that owns and orchestrates every
 * component required to run one live conversation:
 *
 * - `ConversationRuntime`     — low-level call state machine
 * - `ConversationOrchestrator` — turn scheduling and barge-in logic
 * - `IAudioEngine`            — inbound/outbound audio pipelines
 * - `IRealtimeProviderSession`— abstract AI provider session
 * - `MediaCoordinator`        — wires the above into a coherent lifecycle
 *
 * `MediaSession` contains NO transport logic, NO Exotel logic, NO OpenAI
 * imports, NO WebSocket, and NO HTTP. Every concern below the media
 * coordination layer is accessed exclusively through the injected
 * `MediaSessionContext`.
 *
 * ## Ownership
 * One `MediaSession` is created per inbound or outbound call by
 * `MediaSessionFactory`. The owner is responsible for calling `destroy()`
 * when the call ends, regardless of success or failure.
 *
 * ## Thread Safety
 * Lifecycle methods are async and must be awaited sequentially by the owner.
 * Concurrent calls to lifecycle methods on the same instance produce
 * undefined behaviour. `MediaSession` does not acquire locks internally.
 *
 * ## Lifecycle
 * ```
 * createMediaSession()
 *   └─► initialize()     — CREATED → INITIALIZING → READY
 *         └─► start()    — READY → ACTIVE (conversation flowing)
 *               ├─► pause(reason)           — ACTIVE → PAUSED
 *               │     └─► resume()          — PAUSED → ACTIVE
 *               ├─► signalInterruption(now) — ACTIVE → INTERRUPTED → ACTIVE
 *               └─► complete(reason)        — ACTIVE | PAUSED → COMPLETING → COMPLETED
 *
 * Any state ──► destroy()   — COMPLETED | FAILED → DESTROYED
 * ```
 */

import type { MediaSessionContext } from './MediaSessionContext.js';
import type { AudioChunk } from '../audio-engine/AudioChunk.js';
import {
  MediaSessionState,
  MEDIA_VALID_TRANSITIONS,
} from './MediaSessionState.js';
import { MediaLifecycle } from './MediaLifecycle.js';
import { MediaCoordinator } from './MediaCoordinator.js';
import type {
  MediaEvent,
  MediaEventType,
  MediaEventHandler,
  MediaCreatedEvent,
  MediaReadyEvent,
  MediaStartedEvent,
  MediaPausedEvent,
  MediaInterruptedEvent,
  MediaCompletedEvent,
  MediaDestroyedEvent,
  MediaErrorEvent,
} from './MediaSessionEvents.js';
import { VoiceEngineError, ErrorCode } from '../errors/index.js';
import type { Timestamp, Nullable } from '../types/index.js';

// ─── Public Interface ──────────────────────────────────────────────────────────

/**
 * Public contract for a single `MediaSession` instance.
 */
export interface IMediaSession {
  /** The unique session identifier. */
  readonly sessionId: string;

  /** The current lifecycle state of the session. */
  readonly state: MediaSessionState;

  /**
   * Wires all components and transitions CREATED → INITIALIZING → READY.
   *
   * @throws {VoiceEngineError} if called from an illegal state.
   * @throws {VoiceEngineError} if any component fails to initialise.
   */
  initialize(): Promise<void>;

  /**
   * Begins the first conversational turn. Transitions READY → ACTIVE.
   *
   * @throws {VoiceEngineError} if called from an illegal state.
   */
  start(): Promise<void>;

  /**
   * Delivers a raw inbound audio chunk into the audio pipeline.
   * Silently ignored if the session is not in an audio-accepting state.
   *
   * @param chunk - Inbound audio from the transport adapter.
   * @param now   - Current monotonic timestamp in milliseconds.
   */
  deliverInboundAudio(chunk: AudioChunk, now: Timestamp): void;

  /**
   * Signals a barge-in detected by the transport adapter.
   * Transitions ACTIVE → INTERRUPTED → ACTIVE if policy permits.
   *
   * @param now - Timestamp at which the interruption was detected.
   */
  signalInterruption(now: Timestamp): Promise<void>;

  /**
   * Temporarily suspends audio processing. Transitions ACTIVE → PAUSED.
   *
   * @param reason - Human-readable reason for the pause.
   * @throws {VoiceEngineError} if called from an illegal state.
   */
  pause(reason: string): Promise<void>;

  /**
   * Resumes a paused session. Transitions PAUSED → ACTIVE.
   *
   * @throws {VoiceEngineError} if called from an illegal state.
   */
  resume(): Promise<void>;

  /**
   * Requests a graceful completion. Transitions ACTIVE | PAUSED →
   * COMPLETING → COMPLETED.
   *
   * @param reason - Human-readable completion reason.
   */
  complete(reason: string): Promise<void>;

  /**
   * Releases all resources and transitions COMPLETED | FAILED → DESTROYED.
   * Safe to call multiple times; subsequent calls are no-ops.
   */
  destroy(): void;

  /** Subscribes to a typed session event. */
  on<T extends MediaEventType>(
    type: T,
    handler: MediaEventHandler<Extract<MediaEvent, { type: T }>>
  ): void;

  /** Unsubscribes from a typed session event. */
  off<T extends MediaEventType>(
    type: T,
    handler: MediaEventHandler<Extract<MediaEvent, { type: T }>>
  ): void;
}

// ─── Implementation ────────────────────────────────────────────────────────────

/**
 * Production implementation of `IMediaSession`.
 */
export class MediaSession implements IMediaSession {
  private readonly _ctx: Readonly<MediaSessionContext>;
  private readonly _coordinator: MediaCoordinator;

  private _state: MediaSessionState = MediaSessionState.CREATED;
  private _createdAt: Timestamp;
  private _readyAt: Nullable<Timestamp> = null;
  private _destroyed = false;

  private readonly _handlers = new Map<
    MediaEventType,
    Set<MediaEventHandler>
  >();

  constructor(ctx: Readonly<MediaSessionContext>) {
    this._ctx = ctx;
    this._createdAt = ctx.clock.now();

    this._coordinator = new MediaCoordinator(
      ctx,
      this._handleTransition.bind(this),
      this._handleError.bind(this)
    );

    this._emit({
      type: 'media.created',
      timestamp: this._createdAt,
      sessionId: ctx.sessionId,
      callSid: ctx.callSid,
      campaignId: ctx.campaignId,
    } satisfies MediaCreatedEvent);
  }

  // ─── Accessors ─────────────────────────────────────────────────────────────

  get sessionId(): string {
    return this._ctx.sessionId;
  }

  get state(): MediaSessionState {
    return this._state;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    this._assertNotDestroyed('initialize');
    this._assertTransition(MediaSessionState.INITIALIZING, 'initialize');

    this._ctx.logger.info('MediaSession initializing', {
      sessionId: this._ctx.sessionId,
      callSid: this._ctx.callSid,
    });

    this._setState(MediaSessionState.INITIALIZING);

    try {
      await this._ctx.runtime.initialize();
      await this._ctx.runtime.connect();
    } catch (err) {
      this._transitionToFailed(err, MediaSessionState.INITIALIZING, false);
      throw err;
    }

    const now = this._ctx.clock.now();
    this._readyAt = now;
    this._setState(MediaSessionState.READY);

    this._emit({
      type: 'media.ready',
      timestamp: now,
      sessionId: this._ctx.sessionId,
      callSid: this._ctx.callSid,
      initDurationMs: now - this._createdAt,
    } satisfies MediaReadyEvent);

    this._ctx.logger.info('MediaSession ready', {
      initDurationMs: now - this._createdAt,
    });
  }

  async start(): Promise<void> {
    this._assertNotDestroyed('start');
    this._assertTransition(MediaSessionState.ACTIVE, 'start');

    this._ctx.logger.info('MediaSession starting');

    try {
      await this._coordinator.start();
    } catch (err) {
      this._transitionToFailed(err, MediaSessionState.READY, false);
      throw err;
    }

    this._emit({
      type: 'media.started',
      timestamp: this._ctx.clock.now(),
      sessionId: this._ctx.sessionId,
      callSid: this._ctx.callSid,
    } satisfies MediaStartedEvent);
  }

  deliverInboundAudio(chunk: AudioChunk, now: Timestamp): void {
    if (this._destroyed) return;
    this._coordinator.deliverInboundAudio(chunk, now);
  }

  async signalInterruption(now: Timestamp): Promise<void> {
    if (this._destroyed) return;
    await this._coordinator.signalInterruption(now);
  }

  async pause(reason: string): Promise<void> {
    this._assertNotDestroyed('pause');
    await this._coordinator.pause(reason);
  }

  async resume(): Promise<void> {
    this._assertNotDestroyed('resume');
    await this._coordinator.resume();
  }

  async complete(reason: string): Promise<void> {
    this._assertNotDestroyed('complete');
    await this._coordinator.requestCompletion(reason);
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;

    const fromState = this._state;
    this._ctx.logger.info('MediaSession destroying', { fromState });

    this._coordinator.destroy();
    this._ctx.runtime.destroy();

    this._state = MediaSessionState.DESTROYED;

    this._emit({
      type: 'media.destroyed',
      timestamp: this._ctx.clock.now(),
      sessionId: this._ctx.sessionId,
      callSid: this._ctx.callSid,
      destroyedFromState: fromState,
    } satisfies MediaDestroyedEvent);

    this._handlers.clear();
  }

  // ─── Event Bus ──────────────────────────────────────────────────────────────

  on<T extends MediaEventType>(
    type: T,
    handler: MediaEventHandler<Extract<MediaEvent, { type: T }>>
  ): void {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type)!.add(handler as MediaEventHandler);
  }

  off<T extends MediaEventType>(
    type: T,
    handler: MediaEventHandler<Extract<MediaEvent, { type: T }>>
  ): void {
    this._handlers.get(type)?.delete(handler as MediaEventHandler);
  }

  // ─── Internal Transition Handlers ────────────────────────────────────────────

  /**
   * Called by `MediaCoordinator` whenever a state transition occurs.
   */
  private _handleTransition(
    next: MediaSessionState,
    meta?: Readonly<Record<string, unknown>>
  ): void {
    if (this._destroyed) return;

    const prev = this._state;
    this._state = next;

    this._ctx.logger.debug('MediaSession state transition', {
      from: prev,
      to: next,
    });

    const now = this._ctx.clock.now();

    switch (next) {
      case MediaSessionState.PAUSED:
        this._emit({
          type: 'media.paused',
          timestamp: now,
          sessionId: this._ctx.sessionId,
          callSid: this._ctx.callSid,
          reason: String(meta?.['reason'] ?? 'requested'),
        } satisfies MediaPausedEvent);
        break;

      case MediaSessionState.INTERRUPTED:
        this._emit({
          type: 'media.interrupted',
          timestamp: now,
          sessionId: this._ctx.sessionId,
          callSid: this._ctx.callSid,
          turnIndex: (meta?.['turnIndex'] as number) ?? 0,
          agentAudioOffsetMs: (meta?.['agentAudioOffsetMs'] as number) ?? 0,
        } satisfies MediaInterruptedEvent);
        break;

      case MediaSessionState.COMPLETED:
        this._emit({
          type: 'media.completed',
          timestamp: now,
          sessionId: this._ctx.sessionId,
          callSid: this._ctx.callSid,
          totalTurns: (meta?.['totalTurns'] as number) ?? 0,
          durationMs: (meta?.['durationMs'] as number) ?? 0,
          completionReason: String(meta?.['reason'] ?? 'completed'),
        } satisfies MediaCompletedEvent);
        break;

      default:
        break;
    }
  }

  /**
   * Called by `MediaCoordinator` when an unrecoverable error occurs.
   */
  private _handleError(
    error: unknown,
    fromState: MediaSessionState
  ): void {
    if (this._destroyed) return;
    this._transitionToFailed(error, fromState, true);
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private _setState(next: MediaSessionState): void {
    this._state = next;
  }

  private _assertNotDestroyed(method: string): void {
    if (this._destroyed) {
      throw new VoiceEngineError(
        `MediaSession.${method}() called after destroy()`,
        ErrorCode.PIPELINE_ABORTED,
        false,
        { sessionId: this._ctx.sessionId }
      );
    }
  }

  private _assertTransition(next: MediaSessionState, method: string): void {
    const result = MediaLifecycle.evaluate(this._state, next);
    if (!result.allowed) {
      throw new VoiceEngineError(
        `MediaSession.${method}(): ${result.reason}`,
        ErrorCode.PIPELINE_ABORTED,
        false,
        { sessionId: this._ctx.sessionId, currentState: this._state }
      );
    }
  }

  private _transitionToFailed(
    error: unknown,
    fromState: MediaSessionState,
    providerError: boolean
  ): void {
    const legalPredecessors = MEDIA_VALID_TRANSITIONS[MediaSessionState.FAILED];
    if (!legalPredecessors.has(fromState)) return;

    this._state = MediaSessionState.FAILED;

    const engineError =
      error instanceof VoiceEngineError
        ? error
        : new VoiceEngineError(
            String(error),
            ErrorCode.PIPELINE_ABORTED,
            false
          );

    this._ctx.logger.error('MediaSession failed', {
      errorCode: engineError.code,
      errorMessage: engineError.message,
      failedInState: fromState,
    });

    this._emit({
      type: 'media.error',
      timestamp: this._ctx.clock.now(),
      sessionId: this._ctx.sessionId,
      callSid: this._ctx.callSid,
      errorCode: engineError.code,
      errorMessage: engineError.message,
      failedInState: fromState,
      providerError,
    } satisfies MediaErrorEvent);
  }

  private _emit(event: MediaEvent): void {
    const handlers = this._handlers.get(event.type);
    if (!handlers) return;
    Array.from(handlers).forEach((handler) => {
      try {
        handler(event);
      } catch {
        // Swallow — event delivery must never crash the session.
      }
    });
  }
}
