/**
 * @module SessionSupervisor
 *
 * Monitors a live call session for timeouts, disconnections, provider
 * failures, and heartbeat health — and triggers graceful recovery when
 * thresholds are breached.
 *
 * ## Responsibilities
 * - Periodic heartbeat timer that detects stale sessions (no activity).
 * - Inactivity timeout: calls `IMediaSession.complete('session_timeout')`
 *   when no audio is received within the configured window.
 * - Provider failure monitoring: calls `IMediaSession.complete('provider_failure')`
 *   on fatal bridge errors.
 * - Disconnect monitoring: calls `IMediaSession.complete('transport_disconnected')`
 *   when the bridge reports a provider disconnect.
 * - Records last-activity timestamp on each heartbeat tick.
 *
 * ## Rules
 * - No business logic.
 * - No CRM, no MongoDB, no campaign queries.
 * - No OpenAI SDK imports.
 * - No Exotel protocol imports.
 * - Dependency Injection only.
 *
 * ## Recovery Philosophy
 * `SessionSupervisor` never retries connections itself. It delegates all
 * recovery decisions to the `IMediaSession` via its public interface.
 * The supervisor only detects anomalies and calls the correct lifecycle method.
 */

import type { ILogger } from '../logger/index.js';
import type { IMediaSession } from '../media/MediaSession.js';
import type {
  IRealtimeBridge,
  BridgeDisconnectedEvent,
  BridgeErrorEvent,
} from './RealtimeBridge.js';
import { MediaSessionState, MEDIA_TERMINAL_STATES } from '../media/MediaSessionState.js';

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Timing configuration for `SessionSupervisor`.
 */
export interface SessionSupervisorConfig {
  /**
   * Interval in milliseconds between heartbeat ticks.
   * Defaults to 5 000 ms.
   */
  readonly heartbeatIntervalMs: number;

  /**
   * Maximum milliseconds of inactivity before the session is timed out.
   * "Activity" is defined as any inbound audio chunk being delivered.
   * Defaults to 30 000 ms.
   */
  readonly inactivityTimeoutMs: number;

  /**
   * Whether to complete the session on a non-fatal provider error.
   * When `false`, only fatal provider errors trigger session completion.
   * Defaults to `false`.
   */
  readonly completeOnNonFatalError: boolean;
}

const DEFAULT_SUPERVISOR_CONFIG: Readonly<SessionSupervisorConfig> = Object.freeze({
  heartbeatIntervalMs: 5_000,
  inactivityTimeoutMs: 30_000,
  completeOnNonFatalError: false,
});

// ─── Dependencies ─────────────────────────────────────────────────────────────

/** Injected dependencies for `SessionSupervisor`. */
export interface SessionSupervisorDependencies {
  /** Media session to monitor and signal lifecycle events on. */
  readonly mediaSession: IMediaSession;
  /** Realtime bridge to monitor for provider disconnects and errors. */
  readonly bridge: IRealtimeBridge;
  /** Structured logger. */
  readonly logger: ILogger;
  /** Session identifier for log correlation. */
  readonly sessionId: string;
  /** Optional configuration overrides. */
  readonly config?: Partial<SessionSupervisorConfig>;
}

// ─── Public Interface ─────────────────────────────────────────────────────────

/**
 * Public contract for `SessionSupervisor`.
 */
export interface ISessionSupervisor {
  /**
   * Begins heartbeat monitoring and bridge event observation.
   * Must be called after the bridge is connected and the media session is ACTIVE.
   */
  start(): void;

  /**
   * Stops all monitoring timers and removes bridge event listeners.
   * Safe to call multiple times; subsequent calls are no-ops.
   */
  stop(): void;

  /**
   * Records a new activity timestamp. Call this whenever meaningful
   * session activity is detected (e.g. inbound audio received).
   */
  recordActivity(): void;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Production implementation of `ISessionSupervisor`.
 */
export class SessionSupervisor implements ISessionSupervisor {
  private readonly _mediaSession: IMediaSession;
  private readonly _bridge: IRealtimeBridge;
  private readonly _logger: ILogger;
  private readonly _sessionId: string;
  private readonly _config: Readonly<SessionSupervisorConfig>;

  private _active = false;
  private _lastActivityAt: number = Date.now();
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Pre-bound handler references retained for clean `off()` equality.
   */
  private readonly _onBridgeDisconnected: (event: BridgeDisconnectedEvent) => void;
  private readonly _onBridgeError: (event: BridgeErrorEvent) => void;

  constructor(deps: Readonly<SessionSupervisorDependencies>) {
    this._mediaSession = deps.mediaSession;
    this._bridge = deps.bridge;
    this._logger = deps.logger.child({
      component: 'SessionSupervisor',
      sessionId: deps.sessionId,
    });
    this._sessionId = deps.sessionId;
    this._config = Object.freeze({ ...DEFAULT_SUPERVISOR_CONFIG, ...deps.config });

    this._onBridgeDisconnected = this._handleBridgeDisconnected.bind(this);
    this._onBridgeError = this._handleBridgeError.bind(this);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  /**
   * Starts the heartbeat timer and subscribes to bridge failure events.
   */
  start(): void {
    if (this._active) return;
    this._active = true;
    this._lastActivityAt = Date.now();

    this._bridge.on('bridge.disconnected', this._onBridgeDisconnected);
    this._bridge.on('bridge.error', this._onBridgeError);

    this._heartbeatTimer = setInterval(
      () => this._tick(),
      this._config.heartbeatIntervalMs
    );

    this._logger.info('SessionSupervisor started', {
      heartbeatIntervalMs: this._config.heartbeatIntervalMs,
      inactivityTimeoutMs: this._config.inactivityTimeoutMs,
    });
  }

  /**
   * Stops the heartbeat timer and removes bridge event listeners.
   */
  stop(): void {
    if (!this._active) return;
    this._active = false;

    if (this._heartbeatTimer !== null) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }

    this._bridge.off('bridge.disconnected', this._onBridgeDisconnected);
    this._bridge.off('bridge.error', this._onBridgeError);

    this._logger.info('SessionSupervisor stopped');
  }

  /**
   * Updates the last-activity timestamp.
   * Call this whenever inbound audio is delivered.
   */
  recordActivity(): void {
    this._lastActivityAt = Date.now();
  }

  // ─── Private: Heartbeat ───────────────────────────────────────────────────────

  /**
   * Runs on each heartbeat interval.
   * Checks for inactivity timeout and session terminal state.
   */
  private _tick(): void {
    if (!this._active) return;

    const sessionState = this._mediaSession.state;

    // Stop supervising if the session has already terminated.
    if (MEDIA_TERMINAL_STATES.has(sessionState)) {
      this._logger.info('SessionSupervisor: session reached terminal state, stopping', {
        state: sessionState,
      });
      this.stop();
      return;
    }

    // Only enforce inactivity timeout when the session is ACTIVE.
    if (sessionState !== MediaSessionState.ACTIVE) return;

    const idleMs = Date.now() - this._lastActivityAt;

    this._logger.debug('SessionSupervisor heartbeat', {
      sessionState,
      idleMs,
      inactivityTimeoutMs: this._config.inactivityTimeoutMs,
    });

    if (idleMs >= this._config.inactivityTimeoutMs) {
      this._logger.warn('SessionSupervisor: inactivity timeout exceeded, completing session', {
        idleMs,
        threshold: this._config.inactivityTimeoutMs,
      });
      this._completeSession('session_timeout');
    }
  }

  // ─── Private: Bridge Event Handlers ──────────────────────────────────────────

  /**
   * Called when the realtime bridge reports a provider disconnect.
   * Signals graceful session completion via `IMediaSession.complete()`.
   */
  private _handleBridgeDisconnected(event: BridgeDisconnectedEvent): void {
    this._logger.warn('SessionSupervisor: bridge disconnected, completing session', {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    });
    this._completeSession('provider_disconnected');
  }

  /**
   * Called when the realtime bridge reports a provider error.
   * Completes the session on fatal errors (or all errors if configured).
   */
  private _handleBridgeError(event: BridgeErrorEvent): void {
    if (!event.fatal && !this._config.completeOnNonFatalError) {
      this._logger.warn('SessionSupervisor: non-fatal provider error (ignoring)', {
        errorType: event.errorType,
        message: event.message,
      });
      return;
    }

    this._logger.error('SessionSupervisor: provider error, completing session', {
      errorType: event.errorType,
      message: event.message,
      fatal: event.fatal,
    });
    this._completeSession('provider_failure');
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Attempts a graceful session completion with a given reason.
   * Stops the supervisor after initiating completion.
   *
   * @param reason - Human-readable completion reason.
   */
  private _completeSession(reason: string): void {
    this.stop();

    if (MEDIA_TERMINAL_STATES.has(this._mediaSession.state)) return;

    this._mediaSession.complete(reason).catch((err: unknown) => {
      this._logger.error('SessionSupervisor: mediaSession.complete() failed', {
        reason,
        error: String(err),
        sessionId: this._sessionId,
      });
    });
  }
}
