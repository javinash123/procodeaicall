/**
 * @module Bootstrap
 *
 * The single entry point for constructing a fully wired Voice Engine runtime.
 *
 * ## Purpose
 * `createVoiceEngineRuntime()` orchestrates environment loading, config
 * merging, DI container construction, and service registration. It returns
 * an immutable runtime object that future modules plug into.
 *
 * ## Ownership
 * Called once per process startup by the application server. The returned
 * `VoiceEngineRuntime` is shared across all concurrent calls.
 *
 * ## Thread Safety
 * `createVoiceEngineRuntime()` is not reentrant — call it once and cache
 * the result. The returned runtime object is fully thread-safe after creation.
 *
 * ## Lifecycle
 * ```
 * createVoiceEngineRuntime(options?)
 *   └─► loadEnvironment()           — read + validate process.env
 *         └─► loadConfig(env, overrides)  — merge, validate, freeze config
 *               └─► new DependencyContainer()
 *                     └─► register core services (logger, metrics, health)
 *                           └─► register provider stubs (slots for future impls)
 *                                 └─► seal container
 *                                       └─► return VoiceEngineRuntime
 * ```
 *
 * ## Extension Points
 * Callers supply concrete provider implementations through `BootstrapOptions`.
 * The bootstrap layer never instantiates providers itself.
 */

import { loadEnvironment } from './EnvironmentLoader.js';
import { loadConfig } from './ConfigLoader.js';
import type { ConfigOverrides } from './ConfigLoader.js';
import { DependencyContainer, token } from './DependencyContainer.js';
import { ProviderResolver, Tokens } from './ProviderResolver.js';
import { HealthRegistry } from './HealthRegistry.js';
import type { VoiceEngineConfig } from '../config/index.js';
import type { ILogger } from '../logger/index.js';
import type { IMetricsCollector } from '../metrics/index.js';
import type {
  ITelephonyProvider,
  ISTTProvider,
  ILLMProvider,
  ITTSProvider,
} from '../interfaces/index.js';
import type { ReadyStatus } from '../monitoring/index.js';

/** DI token for the frozen config object. */
export const CONFIG_TOKEN = token<Readonly<VoiceEngineConfig>>('VoiceEngineConfig');

/** DI token for the provider resolver. */
export const PROVIDER_RESOLVER_TOKEN = token<ProviderResolver>('ProviderResolver');

/**
 * Options accepted by `createVoiceEngineRuntime()`.
 *
 * All provider fields are optional at bootstrap time. If omitted, resolving
 * that provider token will throw until a concrete implementation is registered
 * by a future module.
 */
export interface BootstrapOptions {
  /** Programmatic configuration overrides applied after environment loading. */
  readonly configOverrides?: ConfigOverrides;

  /**
   * Concrete provider implementations to register into the DI container.
   * These are the only injection points the bootstrap accepts.
   * The bootstrap itself never creates provider implementations.
   */
  readonly providers?: {
    readonly logger?: ILogger;
    readonly metrics?: IMetricsCollector;
    readonly telephony?: ITelephonyProvider;
    readonly stt?: ISTTProvider;
    readonly llm?: ILLMProvider;
    readonly tts?: ITTSProvider;
  };
}

/**
 * The immutable runtime object returned by `createVoiceEngineRuntime()`.
 *
 * This is the root dependency for every future Voice Engine module.
 */
export interface VoiceEngineRuntime {
  /** The frozen, validated configuration for this runtime. */
  readonly config: Readonly<VoiceEngineConfig>;

  /**
   * The sealed DI container.
   * Future modules should resolve dependencies from here rather than
   * importing them directly.
   */
  readonly container: DependencyContainer;

  /**
   * Role-based provider resolver backed by the DI container.
   * Use this to access logger, metrics, and provider instances.
   */
  readonly resolver: ProviderResolver;

  /**
   * The health registry. Future providers register their health callbacks here.
   */
  readonly healthRegistry: HealthRegistry;

  /**
   * Convenience method — delegates to `healthRegistry.getReadyStatus()`.
   */
  getReadyStatus(): Promise<ReadyStatus>;

  /**
   * Releases all DI container registrations.
   * Must be called during process shutdown.
   */
  shutdown(): void;
}

/**
 * Constructs and returns a fully wired, immutable `VoiceEngineRuntime`.
 *
 * @param options - Optional providers and config overrides.
 * @throws {ConfigurationError} if environment or config validation fails.
 *
 * @example
 * ```typescript
 * const runtime = createVoiceEngineRuntime({
 *   providers: {
 *     logger: myPinoLogger,
 *     metrics: myPrometheusCollector,
 *   },
 * });
 * ```
 */
export function createVoiceEngineRuntime(
  options: BootstrapOptions = {}
): VoiceEngineRuntime {
  const env = loadEnvironment();
  const config = loadConfig(env, options.configOverrides ?? {});

  const container = new DependencyContainer();
  const healthRegistry = new HealthRegistry();

  container.registerInstance(CONFIG_TOKEN, config, true);
  container.registerInstance(Tokens.HEALTH_REGISTRY, healthRegistry, true);

  if (options.providers?.logger) {
    container.registerInstance(Tokens.LOGGER, options.providers.logger, true);
  }

  if (options.providers?.metrics) {
    container.registerInstance(Tokens.METRICS, options.providers.metrics, true);
  }

  if (options.providers?.telephony) {
    container.registerInstance(Tokens.TELEPHONY_PROVIDER, options.providers.telephony);
  }

  if (options.providers?.stt) {
    container.registerInstance(Tokens.STT_PROVIDER, options.providers.stt);
  }

  if (options.providers?.llm) {
    container.registerInstance(Tokens.LLM_PROVIDER, options.providers.llm);
  }

  if (options.providers?.tts) {
    container.registerInstance(Tokens.TTS_PROVIDER, options.providers.tts);
  }

  const resolver = new ProviderResolver(container);
  container.registerInstance(PROVIDER_RESOLVER_TOKEN, resolver, true);

  container.seal();

  return Object.freeze({
    config,
    container,
    resolver,
    healthRegistry,

    getReadyStatus(): Promise<ReadyStatus> {
      return healthRegistry.getReadyStatus();
    },

    shutdown(): void {
      container.clear();
    },
  });
}
