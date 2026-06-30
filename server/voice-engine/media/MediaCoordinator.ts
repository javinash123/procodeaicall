/**
 * @module MediaCoordinator
 *
 * Coordinates all media-level concerns for a single live phone call.
 *
 * ## Purpose
 * `MediaCoordinator` is the operational brain of a `MediaSession`. It
 * coordinates inbound audio delivery, outbound audio scheduling, barge-in
 * interruption signalling, turn lifecycle events, and session shutdown.
 *
 * It contains NO transport logic, NO provider-specific logic, NO OpenAI
 * imports, NO Exotel imports, NO WebSocket, and NO HTTP. All AI and
 * telephony concerns are accessed exclusively through the abstractions
 * injected via `MediaSessionContext`.
 *
 * ## Responsibilities
 * - Deliver inbound caller audio to the provider session via the orchestrator.
 * - Relay outbound audio scheduling results from the audio engine.
 * - Accept and gate interruption signals through lifecycle policy.
 * - Drive session lifecycle transitions (start → pause → resume → complete).
 * - Drive per-turn lifecycle events (turn start / turn complete).
 * - Coordinate graceful and forced shutdown in all error scenarios.
 *
 * ## Ownership
 * Created once per `MediaSession` and torn down with it.
 * The `MediaSession` is the sole caller of every public method.
 *
 * ## Thread Safety
 * All public methods are async and must be awaited sequentially by the owner.
 * `MediaCoordinator` does not acquire locks internally.
 */

import type { MediaSessionContext } from './MediaSessionContext.js';
import type { AudioChunk } from '../audio-engine/AudioChunk.js';
import { MediaSessionState } from './MediaSessionState.js';
import { MediaLifecycle } from './MediaLifecycle.js';
import { VoiceEngineError, ErrorCode } from '../errors/index.js';
import type { Timestamp, Nullable } from '../types/index.js';
import type {
  OrchestratorEventType,
  OrchestratorEvent,
} from '../orchestrator/ConversationOrchestrator.js';

/**
 * Callback invoked by the coordinator when the session state must change.
 * The `MediaSession` registers this to propagate state transitions and
 * emit the corresponding events.
 */
export type StateTransitionCallback = (
  next: MediaSessionState,
  meta?: Readonly<Record<string, unknown>>
) => void;

/**
 * Callback invoked by the coordinator when an unrecoverable error occurs.
 */
export type ErrorCallback = (
  error: unknown,
  fromState: MediaSessionState
) => void;

/**
 * Public contract for the media coordinator.
 */
export interface IMediaCoordinator {
  /**
   * Wires orchestrator event handlers and starts the orchestrator.
   * Must be called once, after context is ready and the session is
   * transitioning from READY → ACTIVE.
   */
  start(): Promise<void>;

  /**
   * Delivers a caller audio chunk into the inbound pipeline and
   * forwards it to the provider session via the orchestrator.
   *
   * Safe to call only while the session is ACTIVE or INTERRUPTED.
   * Silently ignored in all other states.
   *
   * @param chunk - The inbound audio chunk received from the transport layer.
   * @param now   - Current monotonic timestamp (ms).
   */
  deliverInboundAudio(chunk: AudioChunk, now: Timestamp): void;

  /**
   * Signals a barge-in detected by the transport layer.
   * The coordinator validates the interruption against lifecycle policy
   * and forwards it to the orchestrator.
   *
   * @param now - Timestamp at which the interruption was detected.
   */
  signalInterruption(now: Timestamp): Promise<void>;

  /**
   * Suspends active audio processing. Only valid from ACTIVE.
   *
   * @param reason - Human-readable reason for the pause.
   */
  pause(reason: string): Promise<void>;

  /**
   * Resumes a paused session. Only valid from PAUSED.
   */
  resume(): Promise<void>;

  /**
   * Requests a graceful shutdown. Transitions the session towards COMPLETING.
   *
   * @param reason - Human-readable completion reason.
   */
  requestCompletion(reason: string): Promise<void>;

  /**
   * Forces an immediate teardown of all coordinated components.
   * Safe to call from any state. Idempotent — subsequent calls are no-ops.
   */
  destroy(): void;
}

/**
 * Production implementation of `IMediaCoordinator`.
 */
export class MediaCoordinator implements IMediaCoordinator {
  private readonly _ctx: Readonly<MediaSessionContext>;
  private readonly _onTransition: StateTransitionCallback;
  private readonly _onError: ErrorCallback;

  private _state: MediaSessionState = MediaSessionState.CREATED;
  private _destroyed = false;
  private _startedAt: Nullable<Timestamp> = null;
  private _turnIndex = 0;
  private _lastInterruptionOffsetMs = 0;

  constructor(
    ctx: Readonly<MediaSessionContext>,
    onTransition: StateTransitionCallback,
    onError: ErrorCallback
  ) {
    this._ctx = ctx;
    this._onTransition = onTransition;
    this._onError = onError;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this._assertNotDestroyed('start');

    this._registerOrchestratorHandlers();
    this._ctx.logger.info('MediaCoordinator starting orchestrator');

    try {
      await this._ctx.orchestrator.start();
      this._startedAt = this._ctx.clock.now();
      this._ctx.audioEngine.start();

      this._setState(MediaSessionState.ACTIVE);
      this._ctx.logger.info('MediaCoordinator active');
    } catch (err) {
      this._ctx.logger.error('MediaCoordinator failed to start', {
        error: String(err),
      });
      throw err;
    }
  }

  deliverInboundAudio(chunk: AudioChunk, now: Timestamp): void {
    if (this._destroyed) return;
    if (!MediaLifecycle.acceptsInboundAudio(this._state)) return;

    this._ctx.audioEngine.ingestInbound(chunk);
    this._ctx.orchestrator.handleAudioChunk(
      typeof chunk.payload === 'string'
        ? chunk.payload
        : Buffer.from(chunk.payload).toString('base64'),
      now
    );
  }

  async signalInterruption(now: Timestamp): Promise<void> {
    if (this._destroyed) return;
    if (!MediaLifecycle.canInterrupt(this._state)) return;

    const agentOffset = this._resolveAgentAudioOffset(now);
    this._setState(MediaSessionState.INTERRUPTED, { turnIndex: this._turnIndex });

    try {
      this._ctx.audioEngine.flushOutbound();
      await this._ctx.orchestrator.interrupt(now);
    } catch (err) {
      this._ctx.logger.error('MediaCoordinator: interruption failed', {
        error: String(err),
      });
      this._onError(err, MediaSessionState.INTERRUPTED);
      return;
    }

    this._lastInterruptionOffsetMs = agentOffset;
    this._setState(MediaSessionState.ACTIVE, {
      turnIndex: this._turnIndex,
      agentAudioOffsetMs: agentOffset,
    });
  }

  async pause(reason: string): Promise<void> {
    this._assertNotDestroyed('pause');
    this._assertCanTransition(MediaSessionState.PAUSED, 'pause');

    this._ctx.logger.info('MediaCoordinator pausing', { reason });
    this._setState(MediaSessionState.PAUSED, { reason });
  }

  async resume(): Promise<void> {
    this._assertNotDestroyed('resume');
    if (!MediaLifecycle.canResume(this._state)) {
      throw new VoiceEngineError(
        `MediaCoordinator.resume() called from illegal state: ${this._state}`,
        ErrorCode.PIPELINE_ABORTED,
        false
      );
    }

    this._ctx.logger.info('MediaCoordinator resuming');
    this._setState(MediaSessionState.ACTIVE);
  }

  async requestCompletion(reason: string): Promise<void> {
    this._assertNotDestroyed('requestCompletion');
    if (!MediaLifecycle.canComplete(this._state)) return;

    this._ctx.logger.info('MediaCoordinator requesting completion', { reason });
    this._setState(MediaSessionState.COMPLETING, { reason });

    try {
      await this._ctx.orchestrator.stop(reason);
    } catch (err) {
      this._ctx.logger.error('MediaCoordinator: orchestrator stop failed', {
        error: String(err),
      });
    }

    this._ctx.audioEngine.stop();
    this._setState(MediaSessionState.COMPLETED, {
      reason,
      durationMs: this._uptimeMs(),
      totalTurns: this._ctx.orchestrator.getContext().completedTurnCount,
    });
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._ctx.logger.info('MediaCoordinator destroying');

    try {
      this._ctx.orchestrator.destroy();
    } catch {
      // Swallow — destroy must never throw.
    }

    try {
      this._ctx.audioEngine.destroy();
    } catch {
      // Swallow — destroy must never throw.
    }
  }

  // ─── Orchestrator Event Wiring ─────────────────────────────────────────────

  private _registerOrchestratorHandlers(): void {
    const handle = (
      type: OrchestratorEventType,
      fn: (event: OrchestratorEvent) => void
    ): void => {
      this._ctx.orchestrator.on(type, fn);
    };

    handle('orchestrator.turn_started', (event) => {
      this._turnIndex = (event.payload['turnIndex'] as number) ?? this._turnIndex;
      this._ctx.logger.debug('Turn started', {
        turnId: event.payload['turnId'],
        turnIndex: this._turnIndex,
      });
    });

    handle('orchestrator.turn_completed', (event) => {
      this._ctx.logger.debug('Turn completed', {
        turnId: event.payload['turnId'],
        turnIndex: event.payload['turnIndex'],
      });
    });

    handle('orchestrator.turn_failed', (event) => {
      this._ctx.logger.warn('Turn failed', {
        turnId: event.payload['turnId'],
        reason: event.payload['reason'],
      });
    });

    handle('orchestrator.completed', (event) => {
      if (this._state === MediaSessionState.COMPLETING || this._state === MediaSessionState.ACTIVE) {
        const reason = String(event.payload['reason'] ?? 'completed');
        this._ctx.logger.info('Orchestrator signalled completion', { reason });
        // Drive the completing→completed transition if not already completing.
        this.requestCompletion(reason).catch((err) => {
          this._ctx.logger.error('Post-orchestrator completion failed', {
            error: String(err),
          });
        });
      }
    });

    handle('orchestrator.failed', (event) => {
      const reason = String(event.payload['reason'] ?? 'unknown');
      this._ctx.logger.error('Orchestrator failed', { reason });
      this._onError(
        new VoiceEngineError(reason, ErrorCode.PIPELINE_ABORTED, false),
        this._state
      );
    });
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private _setState(
    next: MediaSessionState,
    meta?: Readonly<Record<string, unknown>>
  ): void {
    this._state = next;
    this._onTransition(next, meta);
  }

  private _assertNotDestroyed(method: string): void {
    if (this._destroyed) {
      throw new VoiceEngineError(
        `MediaCoordinator.${method}() called after destroy()`,
        ErrorCode.PIPELINE_ABORTED,
        false
      );
    }
  }

  private _assertCanTransition(
    next: MediaSessionState,
    method: string
  ): void {
    const result = MediaLifecycle.evaluate(this._state, next);
    if (!result.allowed) {
      throw new VoiceEngineError(
        `MediaCoordinator.${method}(): ${result.reason}`,
        ErrorCode.PIPELINE_ABORTED,
        false
      );
    }
  }

  private _resolveAgentAudioOffset(now: Timestamp): number {
    const snapshot = this._ctx.audioEngine.getSnapshot();
    return snapshot.outboundBufferDurationMs > 0
      ? snapshot.outboundBufferDurationMs
      : 0;
  }

  private _uptimeMs(): number {
    return this._startedAt !== null
      ? this._ctx.clock.now() - this._startedAt
      : 0;
  }
}
