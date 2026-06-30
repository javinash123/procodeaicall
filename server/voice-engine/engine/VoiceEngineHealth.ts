/**
 * @module VoiceEngineHealth
 *
 * Aggregates health from all subsystems of a running `VoiceEngine`.
 *
 * ## Purpose
 * `VoiceEngineHealth` is the single place that knows about ALL health
 * dimensions of the engine — transport connections, provider availability,
 * active media sessions, and runtime state. It reads from injected snapshot
 * providers and the `HealthRegistry` to produce a unified `EngineHealthReport`.
 *
 * ## Rules
 * - No HTTP routes or HTTP framework imports.
 * - No OpenAI SDK imports.
 * - No Exotel protocol imports.
 * - No Audio Engine internals.
 * - All data is pulled from injected interfaces; no direct subsystem access.
 * - No `process.env`.
 *
 * ## Usage
 * ```typescript
 * const report = await engineHealth.getReport();
 * if (!report.healthy) {
 *   logger.warn('Engine health degraded', { report });
 * }
 * ```
 */

import type { HealthRegistry } from '../bootstrap/HealthRegistry.js';
import type { ReadyStatus, HealthStatus, ProviderHealth } from '../monitoring/index.js';
import type { Timestamp } from '../types/index.js';
import type { VoiceEngineLifecycleState } from './VoiceEngineLifecycle.js';

// ─── Sub-system Health ────────────────────────────────────────────────────────

/**
 * Health snapshot for the transport layer.
 */
export interface TransportHealth {
  /** Total number of currently active WebSocket connections. */
  readonly activeConnections: number;
  /** Whether the transport gateway is accepting new connections. */
  readonly accepting: boolean;
}

/**
 * Health snapshot for the active media sessions.
 */
export interface MediaHealth {
  /** Number of currently active `MediaSession` instances. */
  readonly activeSessions: number;
  /** Number of sessions in a degraded or errored state. */
  readonly degradedSessions: number;
}

/**
 * Unified health report for the entire Voice Engine.
 */
export interface EngineHealthReport {
  /**
   * `true` if all required subsystems are healthy or degraded.
   * `false` if any required subsystem is unhealthy.
   */
  readonly healthy: boolean;
  /** Current lifecycle state of the engine. */
  readonly engineState: VoiceEngineLifecycleState;
  /** Aggregated provider health from the `HealthRegistry`. */
  readonly providers: ReadyStatus;
  /** Transport layer health snapshot. */
  readonly transport: TransportHealth;
  /** Active media session health snapshot. */
  readonly media: MediaHealth;
  /** UTC millisecond timestamp when this report was generated. */
  readonly timestamp: Timestamp;
}

// ─── Snapshot Providers ───────────────────────────────────────────────────────

/**
 * Callback that provides a point-in-time transport health snapshot.
 * Injected by `VoiceEngineBuilder` — the health module does not import the gateway.
 */
export type TransportHealthProvider = () => TransportHealth;

/**
 * Callback that provides a point-in-time media session health snapshot.
 * Injected by `VoiceEngineBuilder` — the health module does not import MediaSession.
 */
export type MediaHealthProvider = () => MediaHealth;

/**
 * Callback that returns the current engine lifecycle state.
 */
export type EngineStateProvider = () => VoiceEngineLifecycleState;

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Configuration for `VoiceEngineHealth`.
 */
export interface VoiceEngineHealthConfig {
  /**
   * Whether provider health failures cause the overall `healthy` flag to
   * be `false`. Defaults to `true`.
   */
  readonly requireHealthyProviders: boolean;

  /**
   * Maximum age in milliseconds for a cached health report.
   * Requests within this window re-use the previous report.
   * Set to 0 to disable caching. Defaults to 5000.
   */
  readonly cacheMaxAgeMs: number;
}

const DEFAULT_HEALTH_CONFIG: Readonly<VoiceEngineHealthConfig> = Object.freeze({
  requireHealthyProviders: true,
  cacheMaxAgeMs: 5_000,
});

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Public contract for the engine health aggregator.
 */
export interface IVoiceEngineHealth {
  /**
   * Generates an aggregated `EngineHealthReport`.
   *
   * If the cached report is still within `cacheMaxAgeMs`, the cached value
   * is returned without invoking any subsystem. Otherwise all providers are
   * polled in parallel.
   */
  getReport(): Promise<Readonly<EngineHealthReport>>;

  /**
   * Convenience method — returns `true` if the last report indicates the
   * engine is healthy.
   */
  isHealthy(): Promise<boolean>;

  /**
   * Invalidates the health cache. The next `getReport()` call will
   * re-poll all providers regardless of cache age.
   */
  invalidateCache(): void;
}

/**
 * Production implementation of `IVoiceEngineHealth`.
 */
export class VoiceEngineHealth implements IVoiceEngineHealth {
  private readonly _registry: HealthRegistry;
  private readonly _transportProvider: TransportHealthProvider;
  private readonly _mediaProvider: MediaHealthProvider;
  private readonly _stateProvider: EngineStateProvider;
  private readonly _config: Readonly<VoiceEngineHealthConfig>;

  private _cachedReport: Readonly<EngineHealthReport> | null = null;
  private _cachedAt: Timestamp = 0;

  constructor(
    registry: HealthRegistry,
    transportProvider: TransportHealthProvider,
    mediaProvider: MediaHealthProvider,
    stateProvider: EngineStateProvider,
    config: Partial<VoiceEngineHealthConfig> = {}
  ) {
    this._registry = registry;
    this._transportProvider = transportProvider;
    this._mediaProvider = mediaProvider;
    this._stateProvider = stateProvider;
    this._config = Object.freeze({ ...DEFAULT_HEALTH_CONFIG, ...config });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  async getReport(): Promise<Readonly<EngineHealthReport>> {
    const now = Date.now();

    if (
      this._cachedReport !== null &&
      this._config.cacheMaxAgeMs > 0 &&
      now - this._cachedAt < this._config.cacheMaxAgeMs
    ) {
      return this._cachedReport;
    }

    const [providers, transport, media, engineState] = await Promise.all([
      this._getProviderHealth(),
      Promise.resolve(this._transportProvider()),
      Promise.resolve(this._mediaProvider()),
      Promise.resolve(this._stateProvider()),
    ]);

    const healthy = this._computeHealthy(providers, engineState);

    const report = Object.freeze<EngineHealthReport>({
      healthy,
      engineState,
      providers,
      transport,
      media,
      timestamp: Date.now(),
    });

    this._cachedReport = report;
    this._cachedAt = now;

    return report;
  }

  async isHealthy(): Promise<boolean> {
    const report = await this.getReport();
    return report.healthy;
  }

  invalidateCache(): void {
    this._cachedReport = null;
    this._cachedAt = 0;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async _getProviderHealth(): Promise<ReadyStatus> {
    try {
      return await this._registry.getReadyStatus();
    } catch {
      return {
        ready: false,
        providers: [],
        timestamp: Date.now(),
      };
    }
  }

  private _computeHealthy(
    providers: ReadyStatus,
    state: VoiceEngineLifecycleState
  ): boolean {
    if (state === 'FAILED' || state === 'DESTROYED') return false;
    if (this._config.requireHealthyProviders && !providers.ready) return false;
    return true;
  }
}
