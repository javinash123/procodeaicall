/**
 * @module HealthRegistry
 *
 * Tracks health-check callbacks for all registered Voice Engine providers
 * and aggregates them into a single `ReadyStatus`.
 *
 * ## Purpose
 * Any component (provider, transport, session store) that exposes a health
 * check registers itself here. The registry aggregates and exposes the
 * collective health of the Voice Engine without owning any provider logic.
 *
 * ## Ownership
 * Owned by the bootstrap container. There is one registry per Voice Engine
 * runtime instance.
 *
 * ## Thread Safety
 * `register()` and `unregister()` must be called during bootstrap before
 * any concurrent `getHealth()` calls begin. `getHealth()` and `getReadyStatus()`
 * are safe to call concurrently once the registry is sealed.
 *
 * ## Lifecycle
 * 1. Bootstrap registers all provider health callbacks.
 * 2. Monitoring layer calls `getReadyStatus()` periodically.
 * 3. On shutdown, providers call `unregister()`.
 */

import type { HealthStatus, ProviderHealth, ReadyStatus } from '../monitoring/index.js';

/**
 * A callback that asynchronously returns the current health of a provider.
 */
export type HealthCallback = () => Promise<HealthStatus>;

/**
 * A registered health entry in the registry.
 */
interface HealthEntry {
  readonly providerName: string;
  readonly callback: HealthCallback;
}

/**
 * Manages health-check registrations and aggregates provider health.
 */
export class HealthRegistry {
  private readonly _entries = new Map<string, HealthEntry>();

  /**
   * Registers a health-check callback for the named provider.
   * If a registration already exists for this name, it is replaced.
   *
   * @param providerName - Unique identifier for the provider (e.g. "openai-llm").
   * @param callback - Async function returning the current `HealthStatus`.
   */
  register(providerName: string, callback: HealthCallback): void {
    this._entries.set(providerName, { providerName, callback });
  }

  /**
   * Removes the health-check registration for the named provider.
   * Safe to call even if the provider was never registered.
   */
  unregister(providerName: string): void {
    this._entries.delete(providerName);
  }

  /**
   * Invokes the health callback for a single named provider.
   *
   * @returns `ProviderHealth` for the named provider.
   * @throws {Error} if no provider with that name is registered.
   */
  async getHealth(providerName: string): Promise<ProviderHealth> {
    const entry = this._entries.get(providerName);
    if (!entry) {
      throw new Error(
        `HealthRegistry: no provider registered with name "${providerName}".`
      );
    }

    const startMs = Date.now();
    let health: HealthStatus;

    try {
      health = await entry.callback();
    } catch (err) {
      health = {
        status: 'unhealthy',
        message: err instanceof Error ? err.message : String(err),
        checkedAt: Date.now(),
      };
    }

    return {
      providerName,
      health,
      latencyMs: Date.now() - startMs,
    };
  }

  /**
   * Invokes all registered health callbacks in parallel and aggregates
   * the results into a `ReadyStatus`.
   *
   * The engine is considered ready only if every registered provider
   * reports a status of `"healthy"` or `"degraded"`.
   */
  async getReadyStatus(): Promise<ReadyStatus> {
    const timestamp = Date.now();
    const names = Array.from(this._entries.keys());

    const results = await Promise.allSettled(
      names.map((name) => this.getHealth(name))
    );

    const providers: ProviderHealth[] = results.map((result, i) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        providerName: names[i],
        health: {
          status: 'unhealthy' as const,
          message: result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
          checkedAt: timestamp,
        },
        latencyMs: 0,
      };
    });

    const ready = providers.every((p) => p.health.status !== 'unhealthy');

    return { ready, providers, timestamp };
  }

  /** Returns the number of registered health callbacks. */
  get size(): number {
    return this._entries.size;
  }

  /** Returns the names of all registered providers. */
  get registeredProviders(): readonly string[] {
    return Array.from(this._entries.keys());
  }
}
