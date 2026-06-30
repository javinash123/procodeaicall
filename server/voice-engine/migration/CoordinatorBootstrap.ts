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
 * - No OpenAI imports.
 * - No Exotel imports.
 * - No transport or WebSocket logic.
 * - This is the ONLY file allowed to hold the coordinator singleton.
 */

import { VoiceEngineFactory } from '../engine/VoiceEngineFactory.js';
import { TransportFactory } from '../transport/TransportFactory.js';
import { createV2SessionCoordinator } from './MigrationFactory.js';
import type { IV2SessionCoordinator } from './V2SessionCoordinator.js';
import type { ILogger, LogContext } from '../logger/index.js';

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

// ─── Singleton ────────────────────────────────────────────────────────────────

let _coordinator: IV2SessionCoordinator | null = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the process-level `IV2SessionCoordinator` singleton.
 *
 * Lazy-initialises on first call. Thread-safe in Node.js single-threaded
 * runtime — no race condition is possible.
 *
 * @returns The singleton coordinator.
 */
export function getV2Coordinator(): IV2SessionCoordinator {
  if (_coordinator) return _coordinator;

  const logger = createConsoleLogger({ subsystem: 'V2SessionCoordinator' });

  logger.info('Initialising V2SessionCoordinator singleton');

  _coordinator = createV2SessionCoordinator(
    {
      voiceEngineFactory: new VoiceEngineFactory(),
      transportFactory:   new TransportFactory(logger),
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
