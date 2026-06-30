/**
 * @module VoiceEngineBuilder
 *
 * Assembles the `VoiceEngine` dependency graph from a `VoiceEngineRuntime`.
 *
 * ## Purpose
 * `VoiceEngineBuilder` is the single place that knows HOW to wire together
 * all the independently built subsystems into a functioning `VoiceEngine`.
 *
 * It contains:
 * - ONLY dependency wiring and factory calls.
 * - NO business logic.
 * - NO transport protocol logic.
 * - NO provider logic.
 * - NO OpenAI SDK imports.
 * - NO Exotel protocol imports.
 * - NO Audio Engine internals.
 * - NO `process.env`.
 *
 * ## Dependency Graph
 * ```
 * VoiceEngineRuntime
 *   ├── config
 *   ├── resolver              → IProviderResolver
 *   └── healthRegistry        → HealthRegistry
 *         │
 * TransportFactory
 *   └── TransportGateway      → ITransportGateway
 *         │
 * MediaSessionFactory         → IMediaSessionFactory
 *         │
 * VoiceEngineHealth           (wraps HealthRegistry + gateway snapshot)
 *         │
 * VoiceEngineEventBus         → IVoiceEngineEventBus
 *         │
 * VoiceEngine ◄───────────────────────────────────────
 * ```
 *
 * ## Usage
 * ```typescript
 * const builder = new VoiceEngineBuilder();
 * const engine = builder.build(runtime);
 * await engine.initialize();
 * await engine.start();
 * ```
 */

import type { VoiceEngineRuntime } from '../bootstrap/Bootstrap.js';
import { TransportFactory } from '../transport/TransportFactory.js';
import type { ITransportGateway } from '../transport/TransportGateway.js';
import { MediaSessionFactory } from '../media/MediaSessionFactory.js';
import type { IMediaSessionFactory } from '../media/MediaSessionFactory.js';
import { VoiceEngineHealth } from './VoiceEngineHealth.js';
import type {
  IVoiceEngineHealth,
  TransportHealth,
  MediaHealth,
} from './VoiceEngineHealth.js';
import { VoiceEngineEventBus } from './VoiceEngineEvents.js';
import type { IVoiceEngineEventBus } from './VoiceEngineEvents.js';
import { VoiceEngine } from './VoiceEngine.js';
import type { IVoiceEngine, VoiceEngineDependencies } from './VoiceEngine.js';
import type { ILogger } from '../logger/index.js';

// ─── Builder Options ──────────────────────────────────────────────────────────

/**
 * Optional overrides for the default dependency wiring.
 *
 * These allow tests and special environments to inject alternative
 * implementations without changing the builder itself.
 */
export interface VoiceEngineBuilderOptions {
  /**
   * Pre-built transport gateway.
   * If not provided, a new one is created via `TransportFactory`.
   */
  readonly gateway?: ITransportGateway;

  /**
   * Pre-built media session factory.
   * If not provided, `MediaSessionFactory` is instantiated with no arguments.
   */
  readonly mediaSessionFactory?: IMediaSessionFactory;

  /**
   * Pre-built health aggregator.
   * If not provided, `VoiceEngineHealth` is constructed from the registry.
   */
  readonly health?: IVoiceEngineHealth;

  /**
   * Pre-built event bus.
   * If not provided, `VoiceEngineEventBus` is instantiated with no arguments.
   */
  readonly eventBus?: IVoiceEngineEventBus;
}

// ─── Public Interface ─────────────────────────────────────────────────────────

/**
 * Public contract for the engine builder.
 */
export interface IVoiceEngineBuilder {
  /**
   * Assembles the full dependency graph and returns a new `IVoiceEngine`
   * in the INITIALIZING state (not yet initialised).
   *
   * @param runtime - The immutable bootstrap runtime.
   * @param options - Optional dependency overrides.
   * @returns A fully wired `IVoiceEngine`.
   */
  build(runtime: VoiceEngineRuntime, options?: VoiceEngineBuilderOptions): IVoiceEngine;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Production implementation of `IVoiceEngineBuilder`.
 *
 * Stateless — safe to reuse across multiple builds (e.g. in tests).
 */
export class VoiceEngineBuilder implements IVoiceEngineBuilder {
  build(runtime: VoiceEngineRuntime, options: VoiceEngineBuilderOptions = {}): IVoiceEngine {
    const logger = this._resolveLogger(runtime);

    // ── Transport ────────────────────────────────────────────────────────────
    const gateway: ITransportGateway =
      options.gateway ?? this._buildGateway(runtime, logger);

    // ── Media ────────────────────────────────────────────────────────────────
    const mediaSessionFactory: IMediaSessionFactory =
      options.mediaSessionFactory ?? new MediaSessionFactory();

    // ── Health ───────────────────────────────────────────────────────────────
    const health: IVoiceEngineHealth =
      options.health ??
      this._buildHealth(runtime, gateway);

    // ── Event Bus ────────────────────────────────────────────────────────────
    const eventBus: IVoiceEngineEventBus =
      options.eventBus ?? new VoiceEngineEventBus();

    // ── Engine ───────────────────────────────────────────────────────────────
    const deps: VoiceEngineDependencies = {
      runtime,
      gateway,
      mediaSessionFactory,
      health,
      eventBus,
      logger,
    };

    return new VoiceEngine(deps);
  }

  // ─── Private Wiring ────────────────────────────────────────────────────────

  /**
   * Resolves the logger from the DI container.
   * Falls back to a minimal console logger if none is registered.
   */
  private _resolveLogger(runtime: VoiceEngineRuntime): ILogger {
    try {
      return runtime.resolver.logger();
    } catch {
      // No logger registered in the container — use a minimal fallback.
      return {
        debug: (msg, ctx) => console.debug('[VoiceEngine]', msg, ctx ?? ''),
        info:  (msg, ctx) => console.info('[VoiceEngine]', msg, ctx ?? ''),
        warn:  (msg, ctx) => console.warn('[VoiceEngine]', msg, ctx ?? ''),
        error: (msg, ctx) => console.error('[VoiceEngine]', msg, ctx ?? ''),
        child: () => this._resolveLogger(runtime),
      };
    }
  }

  /**
   * Creates a `TransportGateway` using `TransportFactory`.
   * The gateway has no adapters registered yet; adapters are registered
   * per-provider by the relevant factory (e.g. `ExotelFactory`).
   */
  private _buildGateway(runtime: VoiceEngineRuntime, logger: ILogger): ITransportGateway {
    const factory = new TransportFactory(logger);
    return factory.createGateway();
  }

  /**
   * Creates a `VoiceEngineHealth` instance wired to the bootstrap
   * `HealthRegistry` and snapshot callbacks.
   *
   * The snapshot callbacks close over the gateway and a mutable media
   * session counter without importing the concrete gateway or session types.
   */
  private _buildHealth(
    runtime: VoiceEngineRuntime,
    gateway: ITransportGateway
  ): IVoiceEngineHealth {
    const transportProvider = (): TransportHealth => ({
      activeConnections: gateway.connectionCount,
      accepting: true,
    });

    const mediaProvider = (): MediaHealth => ({
      activeSessions: 0,    // Updated by the call coordinator as sessions open/close.
      degradedSessions: 0,
    });

    return new VoiceEngineHealth(
      runtime.healthRegistry,
      transportProvider,
      mediaProvider,
      () => 'READY'        // State provider is patched by VoiceEngine post-construction.
    );
  }
}
