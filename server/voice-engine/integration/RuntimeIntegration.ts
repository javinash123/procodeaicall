/**
 * @module RuntimeIntegration
 *
 * The final executable integration that wires together all Voice Engine V2
 * components into a single, runnable phone conversation.
 *
 * ## Ownership
 * `RuntimeIntegration` is the single object that owns the full lifecycle of:
 * - `IRealtimeBridge`     — provider ↔ media session audio channel
 * - `IInboundAudioFlow`   — Transport → AudioEngine → Bridge pipeline
 * - `IOutboundAudioFlow`  — Bridge → AudioEngine → Transport pipeline
 * - `ISessionSupervisor`  — Timeout / disconnect / heartbeat monitoring
 *
 * ## Lifecycle
 * ```
 * new RuntimeIntegration(deps)
 *   └─► start()     — initialize bridge, start flows & supervisor, start media session
 *         └─► stop()     — graceful stop (complete session, stop flows & supervisor)
 *               └─► shutdown() — forced teardown (stop all, destroy media session)
 * ```
 *
 * ## Rules
 * - No OpenAI SDK imports.
 * - No Exotel protocol imports.
 * - No business logic, no CRM, no MongoDB.
 * - Dependency Injection only through `RuntimeIntegrationDependencies`.
 * - Integration only through public interfaces.
 */

import type { ILogger } from '../logger/index.js';
import type { IMediaSession } from '../media/MediaSession.js';
import type { IAudioEngine } from '../audio-engine/AudioEngine.js';
import type { ITransportGateway } from '../transport/TransportGateway.js';
import type { SessionId } from '../types/index.js';
import type { IRealtimeBridge } from './RealtimeBridge.js';
import type { IInboundAudioFlow } from './InboundAudioFlow.js';
import type { IOutboundAudioFlow } from './OutboundAudioFlow.js';
import type { ISessionSupervisor } from './SessionSupervisor.js';
import { VoiceEngineError, ErrorCode } from '../errors/index.js';

// ─── Integration State ────────────────────────────────────────────────────────

/** Lifecycle states of `RuntimeIntegration`. */
export enum IntegrationState {
  /** Constructed; not yet started. */
  IDLE = 'IDLE',
  /** `start()` is in-progress. */
  STARTING = 'STARTING',
  /** Fully started; conversation is running. */
  RUNNING = 'RUNNING',
  /** `stop()` or `shutdown()` is in-progress. */
  STOPPING = 'STOPPING',
  /** All components stopped; resources released. */
  STOPPED = 'STOPPED',
}

// ─── Dependencies ─────────────────────────────────────────────────────────────

/** Injected dependencies for `RuntimeIntegration`. */
export interface RuntimeIntegrationDependencies {
  /** Session identifier for log correlation and transport addressing. */
  readonly sessionId: SessionId;

  /** Media session that owns this call's lifecycle. */
  readonly mediaSession: IMediaSession;

  /** Audio engine driving inbound and outbound pipelines. */
  readonly audioEngine: IAudioEngine;

  /** Transport gateway used to send outbound audio and clear commands. */
  readonly transport: ITransportGateway;

  /** Realtime bridge between MediaSession and the AI provider. */
  readonly bridge: IRealtimeBridge;

  /** Inbound audio flow pipeline. */
  readonly inboundFlow: IInboundAudioFlow;

  /** Outbound audio flow pipeline. */
  readonly outboundFlow: IOutboundAudioFlow;

  /** Session supervisor for monitoring timeouts and disconnects. */
  readonly supervisor: ISessionSupervisor;

  /** Structured logger. */
  readonly logger: ILogger;
}

// ─── Public Interface ─────────────────────────────────────────────────────────

/**
 * Public contract for the top-level runtime integration.
 */
export interface IRuntimeIntegration {
  /** The current integration lifecycle state. */
  readonly state: IntegrationState;

  /** Session identifier associated with this integration. */
  readonly sessionId: SessionId;

  /**
   * Starts the full integration:
   * 1. Starts the audio engine.
   * 2. Connects the realtime bridge to the AI provider.
   * 3. Initialises and starts the media session.
   * 4. Activates the inbound and outbound audio flows.
   * 5. Starts the session supervisor.
   *
   * @throws {VoiceEngineError} if any component fails during start-up.
   */
  start(): Promise<void>;

  /**
   * Gracefully stops the integration:
   * 1. Stops the session supervisor.
   * 2. Stops inbound and outbound flows.
   * 3. Signals graceful session completion.
   * 4. Disconnects the realtime bridge.
   * 5. Stops the audio engine.
   *
   * @param reason - Human-readable reason for stopping.
   */
  stop(reason?: string): Promise<void>;

  /**
   * Forcibly tears down all components without waiting for graceful flushing.
   * Safe to call from any state, including STARTING or STOPPING.
   * Subsequent calls are no-ops.
   */
  shutdown(): void;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Production implementation of `IRuntimeIntegration`.
 */
export class RuntimeIntegration implements IRuntimeIntegration {
  private readonly _sessionId: SessionId;
  private readonly _mediaSession: IMediaSession;
  private readonly _audioEngine: IAudioEngine;
  private readonly _bridge: IRealtimeBridge;
  private readonly _inboundFlow: IInboundAudioFlow;
  private readonly _outboundFlow: IOutboundAudioFlow;
  private readonly _supervisor: ISessionSupervisor;
  private readonly _logger: ILogger;

  private _state: IntegrationState = IntegrationState.IDLE;

  constructor(deps: Readonly<RuntimeIntegrationDependencies>) {
    this._sessionId = deps.sessionId;
    this._mediaSession = deps.mediaSession;
    this._audioEngine = deps.audioEngine;
    this._bridge = deps.bridge;
    this._inboundFlow = deps.inboundFlow;
    this._outboundFlow = deps.outboundFlow;
    this._supervisor = deps.supervisor;
    this._logger = deps.logger.child({
      component: 'RuntimeIntegration',
      sessionId: deps.sessionId,
    });
  }

  // ─── Accessors ───────────────────────────────────────────────────────────────

  get state(): IntegrationState {
    return this._state;
  }

  get sessionId(): SessionId {
    return this._sessionId;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  /**
   * Starts all components in dependency order.
   *
   * Start order (each step awaited before the next):
   * 1. AudioEngine.start()
   * 2. RealtimeBridge.connect()
   * 3. MediaSession.initialize()
   * 4. MediaSession.start()
   * 5. InboundAudioFlow.start()
   * 6. OutboundAudioFlow.start()
   * 7. SessionSupervisor.start()
   */
  async start(): Promise<void> {
    console.log(`[V2 TRACE] 8. RuntimeIntegration.start()  sessionId=${this._sessionId}`);
    this._assertState(IntegrationState.IDLE, 'start');
    this._state = IntegrationState.STARTING;

    this._logger.info('RuntimeIntegration starting');

    try {
      // Step 1 — Audio engine must be running before any pipeline operations.
      this._audioEngine.start();
      this._logger.debug('RuntimeIntegration: AudioEngine started');

      // Step 2 — Provider connection before media session initialises.
      await this._bridge.connect();
      this._logger.debug('RuntimeIntegration: RealtimeBridge connected');

      // Step 3 — Wire all media session components.
      await this._mediaSession.initialize();
      this._logger.debug('RuntimeIntegration: MediaSession initialised');

      // Step 4 — Begin the first conversational turn.
      await this._mediaSession.start();
      this._logger.debug('RuntimeIntegration: MediaSession started');

      // Step 5 — Begin receiving inbound audio from transport.
      this._inboundFlow.start();
      this._logger.debug('RuntimeIntegration: InboundAudioFlow started');

      // Step 6 — Begin forwarding AI audio to transport.
      this._outboundFlow.start();
      this._logger.debug('RuntimeIntegration: OutboundAudioFlow started');

      // Step 7 — Begin heartbeat and failure monitoring.
      this._supervisor.start();
      this._logger.debug('RuntimeIntegration: SessionSupervisor started');

    } catch (err) {
      this._logger.error('RuntimeIntegration: start failed, initiating shutdown', {
        error: String(err),
      });
      this.shutdown();
      throw err;
    }

    this._state = IntegrationState.RUNNING;
    this._logger.info('RuntimeIntegration running');
  }

  /**
   * Gracefully stops all components in reverse dependency order.
   *
   * Stop order:
   * 1. SessionSupervisor.stop()
   * 2. InboundAudioFlow.stop()
   * 3. OutboundAudioFlow.stop()
   * 4. MediaSession.complete(reason)
   * 5. RealtimeBridge.disconnect()
   * 6. AudioEngine.stop()
   *
   * @param reason - Human-readable reason for stopping.
   */
  async stop(reason = 'requested'): Promise<void> {
    if (
      this._state === IntegrationState.STOPPING ||
      this._state === IntegrationState.STOPPED
    ) {
      return;
    }

    console.log(`[V2 TRACE] 15. Runtime stopping  sessionId=${this._sessionId}  reason=${reason}`);
    this._state = IntegrationState.STOPPING;
    this._logger.info('RuntimeIntegration stopping', { reason });

    // Steps 1–3 are synchronous — stop before any async calls.
    this._supervisor.stop();
    this._inboundFlow.stop();
    this._outboundFlow.stop();

    // Step 4 — Gracefully complete the media session.
    try {
      await this._mediaSession.complete(reason);
    } catch (err) {
      this._logger.warn('RuntimeIntegration: mediaSession.complete() failed during stop', {
        error: String(err),
      });
    }

    // Step 5 — Close the provider connection.
    try {
      await this._bridge.disconnect();
    } catch (err) {
      this._logger.warn('RuntimeIntegration: bridge.disconnect() failed during stop', {
        error: String(err),
      });
    }

    // Step 6 — Signal end-of-stream on the audio pipelines.
    this._audioEngine.stop();

    this._state = IntegrationState.STOPPED;
    this._logger.info('RuntimeIntegration stopped');
  }

  /**
   * Forcibly tears down all components without waiting for graceful flushing.
   * Idempotent — safe to call from any state or multiple times.
   */
  shutdown(): void {
    if (this._state === IntegrationState.STOPPED) return;

    this._state = IntegrationState.STOPPING;
    this._logger.warn('RuntimeIntegration shutdown (forced)');

    // All synchronous teardown paths — no awaiting.
    try { this._supervisor.stop(); } catch { /* swallow */ }
    try { this._inboundFlow.stop(); } catch { /* swallow */ }
    try { this._outboundFlow.stop(); } catch { /* swallow */ }
    try { this._mediaSession.destroy(); } catch { /* swallow */ }
    try { this._bridge.disconnect().catch(() => undefined); } catch { /* swallow */ }
    try { this._audioEngine.destroy(); } catch { /* swallow */ }

    this._state = IntegrationState.STOPPED;
    this._logger.info('RuntimeIntegration shutdown complete');
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private _assertState(expected: IntegrationState, method: string): void {
    if (this._state !== expected) {
      throw new VoiceEngineError(
        `RuntimeIntegration.${method}() called in state '${this._state}'; expected '${expected}'`,
        ErrorCode.PIPELINE_ABORTED,
        false,
        { sessionId: this._sessionId, currentState: this._state, expectedState: expected }
      );
    }
  }
}
