/**
 * @module ProviderResolver
 *
 * Resolves registered provider instances from the DI container by role.
 *
 * ## Purpose
 * Provides a named, role-based lookup of provider implementations.
 * This module contains NO provider logic — it only reads from the container.
 *
 * ## Ownership
 * Created by `Bootstrap.ts`. Passed to `RuntimeContext` as the
 * `ProviderRegistry` interface.
 *
 * ## Thread Safety
 * Stateless after construction. Safe to share across concurrent runtimes.
 *
 * ## Lifecycle
 * Valid for the lifetime of the DI container. Becomes invalid after
 * `container.clear()` is called.
 */

import type { DependencyContainer } from './DependencyContainer.js';
import type { Token } from './DependencyContainer.js';
import type {
  ITelephonyProvider,
  ISTTProvider,
  ILLMProvider,
  ITTSProvider,
} from '../interfaces/index.js';
import type { ILogger } from '../logger/index.js';
import type { IMetricsCollector } from '../metrics/index.js';
import type { HealthRegistry } from './HealthRegistry.js';

/** All DI tokens used by the Voice Engine provider resolver. */
export const Tokens = {
  TELEPHONY_PROVIDER: { name: 'ITelephonyProvider' } as Token<ITelephonyProvider>,
  STT_PROVIDER:       { name: 'ISTTProvider' }       as Token<ISTTProvider>,
  LLM_PROVIDER:       { name: 'ILLMProvider' }       as Token<ILLMProvider>,
  TTS_PROVIDER:       { name: 'ITTSProvider' }       as Token<ITTSProvider>,
  LOGGER:             { name: 'ILogger' }            as Token<ILogger>,
  METRICS:            { name: 'IMetricsCollector' }  as Token<IMetricsCollector>,
  HEALTH_REGISTRY:    { name: 'HealthRegistry' }     as Token<HealthRegistry>,
} as const;

/**
 * Resolves provider instances from the DI container by semantic role.
 *
 * Consumers should depend on this interface rather than the concrete
 * `ProviderResolver` class.
 */
export interface IProviderResolver {
  /** Returns the registered telephony provider. */
  telephony(): ITelephonyProvider;
  /** Returns the registered STT provider. */
  stt(): ISTTProvider;
  /** Returns the registered LLM provider. */
  llm(): ILLMProvider;
  /** Returns the registered TTS provider. */
  tts(): ITTSProvider;
  /** Returns the registered logger. */
  logger(): ILogger;
  /** Returns the registered metrics collector. */
  metrics(): IMetricsCollector;
  /** Returns the health registry. */
  health(): HealthRegistry;
}

/**
 * Concrete resolver that reads provider instances from a `DependencyContainer`.
 */
export class ProviderResolver implements IProviderResolver {
  private readonly _container: DependencyContainer;

  constructor(container: DependencyContainer) {
    this._container = container;
  }

  telephony(): ITelephonyProvider {
    return this._container.resolve(Tokens.TELEPHONY_PROVIDER);
  }

  stt(): ISTTProvider {
    return this._container.resolve(Tokens.STT_PROVIDER);
  }

  llm(): ILLMProvider {
    return this._container.resolve(Tokens.LLM_PROVIDER);
  }

  tts(): ITTSProvider {
    return this._container.resolve(Tokens.TTS_PROVIDER);
  }

  logger(): ILogger {
    return this._container.resolve(Tokens.LOGGER);
  }

  metrics(): IMetricsCollector {
    return this._container.resolve(Tokens.METRICS);
  }

  health(): HealthRegistry {
    return this._container.resolve(Tokens.HEALTH_REGISTRY);
  }
}
