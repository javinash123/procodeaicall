/**
 * @module MigrationFactory
 *
 * Dependency-injection entry point for the V2 migration layer.
 *
 * ## Purpose
 * `MigrationFactory` is the single place in the application where all
 * migration-layer dependencies (registry, session factory, coordinator) are
 * assembled. It wires together existing Voice Engine factories with the new
 * migration-specific classes and returns a fully configured
 * `V2SessionCoordinator` ready for use.
 *
 * ## Usage
 * Call `MigrationFactory.create(deps)` once during application startup.
 * Hold the returned coordinator as a process-level singleton.
 *
 * ## Rules
 * - No OpenAI imports.
 * - No Exotel imports.
 * - No transport logic.
 * - No WebSocket logic.
 * - No business logic — wiring only.
 * - All dependencies injected through `MigrationFactoryDependencies`.
 */

import type { ILogger } from '../logger/index.js';
import type { ILLMProvider } from '../interfaces/index.js';
import type { IMetricsCollector } from '../metrics/index.js';
import type { IVoiceEngineFactory } from '../engine/VoiceEngineFactory.js';
import type { ITransportFactory } from '../transport/TransportFactory.js';
import { SessionRegistry } from './SessionRegistry.js';
import type { ISessionRegistry } from './SessionRegistry.js';
import { SessionFactory } from './SessionFactory.js';
import type { ISessionFactory } from './SessionFactory.js';
import { V2SessionCoordinator } from './V2SessionCoordinator.js';
import type { IV2SessionCoordinator, V2SessionCoordinatorOptions } from './V2SessionCoordinator.js';

// ─── Dependencies ─────────────────────────────────────────────────────────────

/**
 * All external dependencies required by `MigrationFactory`.
 *
 * These must be fully constructed and ready before calling
 * `MigrationFactory.create()`.
 */
export interface MigrationFactoryDependencies {
  /**
   * Factory for constructing `IVoiceEngine` instances.
   * Typically `new VoiceEngineFactory()` from the engine module.
   */
  readonly voiceEngineFactory: IVoiceEngineFactory;

  /**
   * Factory for constructing `ITransportGateway` instances.
   * Typically `new TransportFactory(logger)` from the transport module.
   */
  readonly transportFactory: ITransportFactory;

  /**
   * Structured logger scoped to the migration layer.
   * All child components receive child-bound instances.
   */
  readonly logger: ILogger;

  /**
   * LLM provider singleton. When supplied, it is registered as
   * Tokens.LLM_PROVIDER in every session's VoiceEngineRuntime container
   * so that ctx.runtime.resolver.llm() resolves correctly.
   */
  readonly llmProvider?: ILLMProvider;

  /**
   * Metrics collector singleton. When supplied, it is registered as
   * Tokens.METRICS in every session's VoiceEngineRuntime container
   * so that ctx.runtime.resolver.metrics() resolves correctly.
   */
  readonly metricsCollector?: IMetricsCollector;
}

// ─── Options ──────────────────────────────────────────────────────────────────

/**
 * Optional configuration forwarded to the `V2SessionCoordinator`.
 */
export interface MigrationFactoryOptions {
  /**
   * Coordinator-level options (e.g. `maxSessionAgeMs`).
   */
  readonly coordinator?: V2SessionCoordinatorOptions;
}

// ─── Public Interface ─────────────────────────────────────────────────────────

/**
 * Public contract for the migration factory.
 */
export interface IMigrationFactory {
  /**
   * Constructs and returns a fully wired `IV2SessionCoordinator`.
   *
   * @returns A ready-to-use coordinator.
   */
  createCoordinator(): IV2SessionCoordinator;

  /**
   * Constructs and returns the underlying `ISessionRegistry`.
   *
   * Exposed for consumers that need direct registry access (e.g. health
   * checks, admin endpoints). In production use, prefer the coordinator.
   *
   * @returns A new `ISessionRegistry` instance.
   */
  createRegistry(): ISessionRegistry;

  /**
   * Constructs and returns the underlying `ISessionFactory`.
   *
   * Exposed for testing. In production use, prefer the coordinator.
   *
   * @returns A new `ISessionFactory` instance.
   */
  createSessionFactory(): ISessionFactory;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Production implementation of `IMigrationFactory`.
 *
 * ```typescript
 * const factory = new MigrationFactory(deps, options);
 * const coordinator = factory.createCoordinator();
 *
 * // Application code:
 * const session = await coordinator.createSession({ campaignId: 'camp-1', phone: '+917000000001' });
 * coordinator.attachCallSid(session.sessionId, exotelCallSid);
 * ```
 */
export class MigrationFactory implements IMigrationFactory {
  private readonly _deps: MigrationFactoryDependencies;
  private readonly _options: MigrationFactoryOptions;

  constructor(
    deps: MigrationFactoryDependencies,
    options: MigrationFactoryOptions = {}
  ) {
    this._deps    = deps;
    this._options = options;
  }

  // ─── IMigrationFactory ──────────────────────────────────────────────────────

  createCoordinator(): IV2SessionCoordinator {
    const registry = this.createRegistry();
    const factory  = this.createSessionFactory();

    return new V2SessionCoordinator(
      registry,
      factory,
      this._deps.logger,
      this._options.coordinator ?? {}
    );
  }

  createRegistry(): ISessionRegistry {
    return new SessionRegistry(this._deps.logger);
  }

  createSessionFactory(): ISessionFactory {
    return new SessionFactory(
      this._deps.voiceEngineFactory,
      this._deps.transportFactory,
      this._deps.logger,
      this._deps.llmProvider,
      this._deps.metricsCollector
    );
  }
}

// ─── Convenience Function ─────────────────────────────────────────────────────

/**
 * Top-level convenience function.
 *
 * Equivalent to `new MigrationFactory(deps, options).createCoordinator()`.
 *
 * Call once at process startup and hold the result as a module-level constant.
 *
 * @param deps    - Required external dependencies.
 * @param options - Optional configuration overrides.
 * @returns A fully wired `IV2SessionCoordinator`.
 *
 * @example
 * ```typescript
 * import { VoiceEngineFactory } from '../engine/VoiceEngineFactory.js';
 * import { TransportFactory }   from '../transport/TransportFactory.js';
 * import { createV2SessionCoordinator } from './migration/index.js';
 *
 * const coordinator = createV2SessionCoordinator({
 *   voiceEngineFactory: new VoiceEngineFactory(),
 *   transportFactory:   new TransportFactory(logger),
 *   logger,
 * });
 *
 * // On outbound call initiation:
 * const session = await coordinator.createSession({ campaignId, phone });
 * coordinator.attachCallSid(session.sessionId, exotelCallSid);
 *
 * // On session end:
 * coordinator.destroySession(session.sessionId);
 * ```
 */
export function createV2SessionCoordinator(
  deps: MigrationFactoryDependencies,
  options: MigrationFactoryOptions = {}
): IV2SessionCoordinator {
  return new MigrationFactory(deps, options).createCoordinator();
}
