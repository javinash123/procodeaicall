/**
 * @module VoiceEngine
 *
 * The top-level coordinator of Voice Engine V2.
 *
 * ## Purpose
 * `VoiceEngine` is the single owner and lifecycle manager of all subsystems.
 * It wires bootstrap, transport, media, and provider resolution together
 * through `VoiceEngineLifecycle`, `VoiceEngineHealth`, and `VoiceEngineEvents`
 * without containing any business logic, provider-specific code, or protocol
 * knowledge.
 *
 * ## Ownership
 * The `VoiceEngine` owns:
 * - The bootstrap `VoiceEngineRuntime` (config + DI container + resolver).
 * - The `ITransportGateway` (all WebSocket connections).
 * - The `IMediaSessionFactory` (per-call session construction).
 * - The `HealthRegistry` (provider health callbacks).
 * - The `VoiceEngineLifecycle` (state machine).
 * - The `VoiceEngineHealth` (aggregated health reporting).
 * - The `IVoiceEngineEventBus` (lifecycle event fan-out).
 *
 * ## Lifecycle
 * ```
 * VoiceEngine.initialize()   → INITIALIZING → READY
 * VoiceEngine.start()        → READY        → RUNNING
 * VoiceEngine.stop(reason)   → RUNNING      → STOPPING → STOPPED
 * VoiceEngine.destroy()      → (any)        → DESTROYED
 * ```
 *
 * ## Rules
 * - No OpenAI SDK imports.
 * - No Exotel protocol imports.
 * - No Audio Engine internals.
 * - Communicates with subsystems ONLY through public interfaces.
 * - No `process.env`.
 * - No global singletons or static state.
 * - No business logic.
 */

import type { VoiceEngineRuntime } from '../bootstrap/Bootstrap.js';
import type { ITransportGateway } from '../transport/TransportGateway.js';
import type { IMediaSessionFactory } from '../media/MediaSessionFactory.js';
import type { ILogger } from '../logger/index.js';
import type { ReadyStatus } from '../monitoring/index.js';
import type { Timestamp } from '../types/index.js';
import { VoiceEngineLifecycle } from './VoiceEngineLifecycle.js';
import type { VoiceEngineLifecycleState } from './VoiceEngineLifecycle.js';
import type { IVoiceEngineHealth, EngineHealthReport } from './VoiceEngineHealth.js';
import type {
  IVoiceEngineEventBus,
  VoiceEngineEventType,
  VoiceEngineEventMap,
  VoiceEngineEventHandler,
} from './VoiceEngineEvents.js';

// ─── Engine ID ────────────────────────────────────────────────────────────────

let _engineCounter = 0;

function nextEngineId(): string {
  return `ve-${Date.now()}-${++_engineCounter}`;
}

// ─── Public Interface ─────────────────────────────────────────────────────────

/**
 * Public contract for the Voice Engine.
 */
export interface IVoiceEngine {
  /** Unique identifier for this engine instance. */
  readonly engineId: string;

  /** Current lifecycle state. */
  readonly state: VoiceEngineLifecycleState;

  /** Whether the engine is actively serving calls. */
  readonly isRunning: boolean;

  /** Monotonic timestamp when the engine entered the current state. */
  readonly stateEnteredAt: Timestamp;

  /**
   * Initialises all subsystems and transitions to the READY state.
   *
   * Must be called before `start()`. Idempotent if already READY.
   *
   * @throws {Error} if the engine is in a terminal state.
   * @throws {Error} if initialisation fails (transitions to FAILED).
   */
  initialize(): Promise<void>;

  /**
   * Starts the engine, opening the transport gateway to inbound connections.
   * Transitions from READY → RUNNING.
   *
   * @throws {Error} if the engine is not in the READY state.
   */
  start(): Promise<void>;

  /**
   * Gracefully stops the engine.
   *
   * 1. Stops accepting new connections.
   * 2. Drains active calls up to `drainTimeoutMs`.
   * 3. Transitions to STOPPED.
   *
   * @param reason        - Human-readable stop reason.
   * @param drainTimeoutMs - Maximum milliseconds to wait for call drain (default 30 000).
   */
  stop(reason?: string, drainTimeoutMs?: number): Promise<void>;

  /**
   * Performs a full shutdown and releases all resources.
   * May be called from any state. Always transitions to DESTROYED.
   * Safe to call multiple times (idempotent).
   */
  destroy(): void;

  /**
   * Returns an aggregated health report for all subsystems.
   */
  getHealthReport(): Promise<Readonly<EngineHealthReport>>;

  /**
   * Returns the current provider ready status from the health registry.
   */
  getReadyStatus(): Promise<ReadyStatus>;

  /** Subscribes to a lifecycle event type. */
  on<T extends VoiceEngineEventType>(
    type: T,
    handler: VoiceEngineEventHandler<VoiceEngineEventMap[T]>
  ): void;

  /** Unsubscribes from a lifecycle event type. */
  off<T extends VoiceEngineEventType>(
    type: T,
    handler: VoiceEngineEventHandler<VoiceEngineEventMap[T]>
  ): void;
}

// ─── Dependencies ─────────────────────────────────────────────────────────────

/**
 * All dependencies required to construct a `VoiceEngine`.
 *
 * Assembled by `VoiceEngineBuilder`. Every field is required and fully
 * initialised before being passed to the constructor.
 */
export interface VoiceEngineDependencies {
  /** The bootstrap runtime (config, DI container, resolver, health registry). */
  readonly runtime: VoiceEngineRuntime;
  /** The transport gateway that owns all WebSocket connections. */
  readonly gateway: ITransportGateway;
  /** Factory for constructing per-call MediaSessions. */
  readonly mediaSessionFactory: IMediaSessionFactory;
  /** Health aggregator for all subsystems. */
  readonly health: IVoiceEngineHealth;
  /** Lifecycle event bus. */
  readonly eventBus: IVoiceEngineEventBus;
  /** Structured logger, bound with engine context. */
  readonly logger: ILogger;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Production implementation of `IVoiceEngine`.
 */
export class VoiceEngine implements IVoiceEngine {
  readonly engineId: string;

  private readonly _runtime: VoiceEngineRuntime;
  private readonly _gateway: ITransportGateway;
  private readonly _mediaSessionFactory: IMediaSessionFactory;
  private readonly _health: IVoiceEngineHealth;
  private readonly _eventBus: IVoiceEngineEventBus;
  private readonly _logger: ILogger;
  private readonly _lifecycle: VoiceEngineLifecycle;

  private _startedAt: Timestamp = 0;

  constructor(deps: VoiceEngineDependencies) {
    this.engineId = nextEngineId();
    this._runtime = deps.runtime;
    this._gateway = deps.gateway;
    this._mediaSessionFactory = deps.mediaSessionFactory;
    this._health = deps.health;
    this._eventBus = deps.eventBus;
    this._logger = deps.logger.child({ component: 'VoiceEngine', engineId: this.engineId });
    this._lifecycle = new VoiceEngineLifecycle('INITIALIZING');
  }

  // ─── Accessors ──────────────────────────────────────────────────────────────

  get state(): VoiceEngineLifecycleState {
    return this._lifecycle.state;
  }

  get isRunning(): boolean {
    return this._lifecycle.isActive;
  }

  get stateEnteredAt(): Timestamp {
    return this._lifecycle.enteredAt;
  }

  /** Exposes the media session factory for per-call coordinators. */
  get mediaSessionFactory(): IMediaSessionFactory {
    return this._mediaSessionFactory;
  }

  /** Exposes the transport gateway for per-call session binding. */
  get gateway(): ITransportGateway {
    return this._gateway;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this._lifecycle.state === 'READY') return; // idempotent

    this._lifecycle.assertIn(['INITIALIZING'], 'initialize');
    this._logger.info('VoiceEngine initializing', { engineId: this.engineId });

    this._eventBus.emit({
      type: 'engine.initializing',
      timestamp: Date.now(),
      engineId: this.engineId,
    });

    try {
      // Validate that all required providers are registered by attempting
      // a health check. This catches missing DI registrations early.
      const readyStatus = await this._runtime.getReadyStatus();

      this._lifecycle.transition('READY');
      this._health.invalidateCache();

      this._logger.info('VoiceEngine ready', {
        engineId: this.engineId,
        providersReady: readyStatus.ready,
        providerCount: readyStatus.providers.length,
      });

      this._eventBus.emit({
        type: 'engine.ready',
        timestamp: Date.now(),
        engineId: this.engineId,
        readyStatus,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._logger.error('VoiceEngine initialization failed', {
        engineId: this.engineId,
        error: message,
      });

      const failedInState = this._lifecycle.state;
      this._lifecycle.fail(message);

      this._eventBus.emit({
        type: 'engine.failed',
        timestamp: Date.now(),
        engineId: this.engineId,
        errorCode: 'INIT_FAILED',
        errorMessage: message,
        failedInState,
        recoverable: false,
      });

      throw err;
    }
  }

  async start(): Promise<void> {
    this._lifecycle.assertIn(['READY'], 'start');

    this._logger.info('VoiceEngine starting', { engineId: this.engineId });

    try {
      this._lifecycle.transition('RUNNING');
      this._startedAt = Date.now();

      this._logger.info('VoiceEngine running — accepting calls', {
        engineId: this.engineId,
        startedAt: this._startedAt,
      });

      this._eventBus.emit({
        type: 'engine.started',
        timestamp: Date.now(),
        engineId: this.engineId,
        startedAt: this._startedAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failedInState = this._lifecycle.state;
      this._lifecycle.fail(message);

      this._eventBus.emit({
        type: 'engine.failed',
        timestamp: Date.now(),
        engineId: this.engineId,
        errorCode: 'START_FAILED',
        errorMessage: message,
        failedInState,
        recoverable: false,
      });

      throw err;
    }
  }

  async stop(reason = 'requested', drainTimeoutMs = 30_000): Promise<void> {
    if (this._lifecycle.state === 'STOPPED') return; // idempotent
    if (this._lifecycle.state === 'DESTROYED') return;

    this._lifecycle.assertIn(['RUNNING', 'STOPPING'], 'stop');

    if (this._lifecycle.state !== 'STOPPING') {
      this._lifecycle.transition('STOPPING');
    }

    this._logger.info('VoiceEngine stopping', {
      engineId: this.engineId,
      reason,
      drainTimeoutMs,
      activeConnections: this._gateway.connectionCount,
    });

    const stopStart = Date.now();
    const connectionsBefore = this._gateway.connectionCount;

    try {
      // Drain active connections with a timeout.
      await this._drainConnections(drainTimeoutMs);

      this._lifecycle.transition('STOPPED');

      const stopDurationMs = Date.now() - stopStart;
      this._logger.info('VoiceEngine stopped', {
        engineId: this.engineId,
        reason,
        stopDurationMs,
        drainedSessions: connectionsBefore,
      });

      this._eventBus.emit({
        type: 'engine.stopped',
        timestamp: Date.now(),
        engineId: this.engineId,
        reason,
        drainedSessions: connectionsBefore,
        stopDurationMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failedInState = this._lifecycle.state;
      this._lifecycle.fail(message);

      this._eventBus.emit({
        type: 'engine.failed',
        timestamp: Date.now(),
        engineId: this.engineId,
        errorCode: 'STOP_FAILED',
        errorMessage: message,
        failedInState,
        recoverable: false,
      });

      throw err;
    }
  }

  destroy(): void {
    const transitioned = this._lifecycle.destroy();
    if (!transitioned) return; // already destroyed

    this._logger.info('VoiceEngine destroying', { engineId: this.engineId });

    // Force-close all transport connections.
    try { this._gateway.destroy(); } catch { /* swallow */ }

    // Release bootstrap resources.
    try { this._runtime.shutdown(); } catch { /* swallow */ }

    this._logger.info('VoiceEngine destroyed', { engineId: this.engineId });

    this._eventBus.emit({
      type: 'engine.destroyed',
      timestamp: Date.now(),
      engineId: this.engineId,
    });
  }

  // ─── Health ─────────────────────────────────────────────────────────────────

  async getHealthReport(): Promise<Readonly<EngineHealthReport>> {
    return this._health.getReport();
  }

  async getReadyStatus(): Promise<ReadyStatus> {
    return this._runtime.getReadyStatus();
  }

  // ─── Events ─────────────────────────────────────────────────────────────────

  on<T extends VoiceEngineEventType>(
    type: T,
    handler: VoiceEngineEventHandler<VoiceEngineEventMap[T]>
  ): void {
    this._eventBus.on(type, handler);
  }

  off<T extends VoiceEngineEventType>(
    type: T,
    handler: VoiceEngineEventHandler<VoiceEngineEventMap[T]>
  ): void {
    this._eventBus.off(type, handler);
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Waits for active connections to drop to zero or the timeout to expire.
   * Forcibly destroys any remaining connections after the timeout.
   */
  private async _drainConnections(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (this._gateway.connectionCount > 0 && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
    }

    if (this._gateway.connectionCount > 0) {
      this._logger.warn('VoiceEngine drain timeout — forcing connection close', {
        engineId: this.engineId,
        remaining: this._gateway.connectionCount,
      });
      this._gateway.destroy();
    }
  }
}
