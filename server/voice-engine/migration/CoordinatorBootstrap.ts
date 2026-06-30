/**
 * @module CoordinatorBootstrap
 *
 * Process-level singleton holder for the V2SessionCoordinator.
 *
 * ## Purpose
 * Creates exactly ONE `IV2SessionCoordinator` per process lifetime and
 * exposes it via `getV2Coordinator()`. All wiring is done here so that
 * routes and other application code only need to call `getV2Coordinator()`
 * — they never instantiate engine or transport factories themselves.
 *
 * ## Lifecycle
 * - Lazy-initialised on first call to `getV2Coordinator()`.
 * - Call `destroyV2Coordinator()` during process shutdown to release
 *   all active sessions cleanly.
 *
 * ## Rules
 * - No Exotel imports.
 * - No transport or WebSocket logic.
 * - This is the ONLY file allowed to hold the coordinator singleton.
 */

import { VoiceEngineFactory } from '../engine/VoiceEngineFactory.js';
import type { IVoiceEngineFactory, VoiceEngineFactoryOptions } from '../engine/VoiceEngineFactory.js';
import type { IVoiceEngine } from '../engine/VoiceEngine.js';
import type { BootstrapOptions } from '../bootstrap/Bootstrap.js';
import { TransportFactory } from '../transport/TransportFactory.js';
import { createV2SessionCoordinator } from './MigrationFactory.js';
import type { IV2SessionCoordinator } from './V2SessionCoordinator.js';
import type { ILogger, LogContext } from '../logger/index.js';
import type { IMetricsCollector, Histogram, Counter, Gauge, MetricEvent } from '../metrics/index.js';
import { createOpenAIRealtimeProvider } from '../providers/openai/OpenAIRealtimeFactory.js';

// ─── Console Logger Adapter ───────────────────────────────────────────────────

/**
 * Minimal `ILogger` implementation backed by `console`.
 * Used for the migration layer until a structured logger is wired into the
 * bootstrap. Child bindings are merged into every log line as JSON context.
 */
function createConsoleLogger(bindings: LogContext = {}): ILogger {
  const prefix = Object.keys(bindings).length
    ? ` ${JSON.stringify(bindings)}`
    : '';

  const fmt = (level: string, message: string, ctx?: LogContext): string => {
    const ctxStr = ctx && Object.keys(ctx).length ? ` ${JSON.stringify(ctx)}` : '';
    return `[V2Migration${prefix}] [${level.toUpperCase()}] ${message}${ctxStr}`;
  };

  return {
    debug: (message, ctx) => console.debug(fmt('debug', message, ctx)),
    info:  (message, ctx) => console.info(fmt('info',  message, ctx)),
    warn:  (message, ctx) => console.warn(fmt('warn',  message, ctx)),
    error: (message, ctx) => console.error(fmt('error', message, ctx)),
    child: (childBindings) =>
      createConsoleLogger({ ...bindings, ...childBindings }),
  };
}

// ─── No-op Metrics ────────────────────────────────────────────────────────────

/**
 * Minimal no-op `IMetricsCollector` used when constructing the OpenAI
 * provider at bootstrap time before a real metrics collector is available.
 */
const _noopHistogram: Histogram = {
  observe: () => {},
  startTimer: () => () => {},
};

const _noopCounter: Counter = {
  increment: () => {},
  reset: () => {},
};

const _noopGauge: Gauge = {
  set: () => {},
  increment: () => {},
  decrement: () => {},
};

const _noopMetrics: IMetricsCollector = {
  histogram: () => _noopHistogram,
  counter: () => _noopCounter,
  gauge: () => _noopGauge,
  emit: (_event: MetricEvent) => {},
};

// ─── Provider-aware VoiceEngineFactory wrapper ────────────────────────────────

/**
 * Wraps `IVoiceEngineFactory` to merge a set of default providers into every
 * `create()` call's `bootstrapOptions.providers`.
 *
 * Callers that explicitly supply their own `providers` take precedence over the
 * defaults (caller-supplied values are spread last).
 */
class ProviderAwareVoiceEngineFactory implements IVoiceEngineFactory {
  constructor(
    private readonly _inner: IVoiceEngineFactory,
    private readonly _defaults: NonNullable<BootstrapOptions['providers']>
  ) {}

  async create(options: VoiceEngineFactoryOptions = {}): Promise<IVoiceEngine> {
    return this._inner.create({
      ...options,
      bootstrapOptions: {
        ...options.bootstrapOptions,
        providers: {
          ...this._defaults,
          ...options.bootstrapOptions?.providers,
        },
      },
    });
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _coordinator: IV2SessionCoordinator | null = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the process-level `IV2SessionCoordinator` singleton.
 *
 * Lazy-initialises on first call. Thread-safe in Node.js single-threaded
 * runtime — no race condition is possible.
 *
 * On first call this function:
 * 1. Reads `OPENAI_API_KEY` from `process.env`.
 * 2. Logs `[VoiceEngine] OpenAI API Key Present = YES / NO` exactly once.
 * 3. Creates an `OpenAIRealtimeProvider` and wraps `VoiceEngineFactory` with
 *    `ProviderAwareVoiceEngineFactory` so every session automatically gets the
 *    LLM provider injected into its DI container.
 *
 * @returns The singleton coordinator.
 */
export function getV2Coordinator(): IV2SessionCoordinator {
  if (_coordinator) return _coordinator;

  const logger = createConsoleLogger({ subsystem: 'V2SessionCoordinator' });

  logger.info('Initialising V2SessionCoordinator singleton');

  // ── Step 1: resolve the OpenAI API key ──────────────────────────────────────
  const openAIApiKey = process.env.OPENAI_API_KEY ?? '';

  // Log key presence exactly once (singleton, so this block runs once).
  logger.info(`[VoiceEngine] OpenAI API Key Present = ${openAIApiKey ? 'YES' : 'NO'}`);

  // ── Step 2: build the engine factory, injecting provider if key is available ─
  let voiceEngineFactory: IVoiceEngineFactory = new VoiceEngineFactory();

  if (openAIApiKey) {
    try {
      const openAIProvider = createOpenAIRealtimeProvider(
        { apiKey: openAIApiKey },
        logger,
        _noopMetrics
      );

      voiceEngineFactory = new ProviderAwareVoiceEngineFactory(
        voiceEngineFactory,
        { llm: openAIProvider }
      );

      logger.info('[VoiceEngine] OpenAI LLM provider registered in DI chain');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('[VoiceEngine] Failed to create OpenAI provider — calls will proceed without LLM injection', {
        error: message,
      });
    }
  } else {
    logger.warn('[VoiceEngine] OPENAI_API_KEY not set — LLM provider will NOT be injected into session DI containers');
  }

  // ── Step 3: assemble the coordinator ────────────────────────────────────────
  _coordinator = createV2SessionCoordinator(
    {
      voiceEngineFactory,
      transportFactory: new TransportFactory(logger),
      logger,
    },
    {
      coordinator: {
        maxSessionAgeMs: 2 * 60 * 60 * 1000, // 2 hours
      },
    }
  );

  logger.info('V2SessionCoordinator ready', {
    activeSessions: _coordinator.activeSessionCount,
  });

  return _coordinator;
}

/**
 * Destroys all active V2 sessions and releases the singleton.
 *
 * Call during process shutdown (SIGTERM / SIGINT) to ensure no sessions
 * are leaked. After this call, the next `getV2Coordinator()` will
 * reinitialise a fresh coordinator.
 */
export function destroyV2Coordinator(): void {
  if (!_coordinator) return;

  const logger = createConsoleLogger({ subsystem: 'V2SessionCoordinator' });
  const active = _coordinator.activeSessionCount;

  logger.info('Destroying V2SessionCoordinator', { activeSessions: active });

  // Cleanup expires all sessions — destroySession is called per session.
  _coordinator.cleanupExpiredSessions();

  _coordinator = null;
  logger.info('V2SessionCoordinator destroyed');
}
