/**
 * @module MediaSessionFactory
 *
 * Dependency-injected factory for constructing `MediaSession` instances.
 *
 * ## Purpose
 * `MediaSessionFactory` is the single authoritative entry point for creating
 * `MediaSession` objects. It centralises all wiring of per-session dependencies,
 * ensures the `MediaSessionContext` is fully populated and frozen before the
 * session is returned, and emits a CREATED event before handing the session
 * to the caller.
 *
 * ## Ownership
 * The factory is a stateless singleton owned by the application bootstrap layer.
 * It does not hold any per-call state. Concurrent calls each produce an
 * independent `MediaSession` instance with no shared mutable state.
 *
 * ## Rules
 * - No OpenAI imports.
 * - No Exotel imports.
 * - No WebSocket or HTTP.
 * - No `process.env`.
 * - All dependencies are supplied by the caller via `MediaSessionDependencies`.
 */

import type { ConversationRuntime } from '../runtime/ConversationRuntime.js';
import type { IAudioEngine } from '../audio-engine/AudioEngine.js';
import type {
  IConversationOrchestrator,
  IRealtimeProviderSession,
} from '../orchestrator/ConversationOrchestrator.js';
import type { IClock } from '../runtime/RuntimeContext.js';
import type { VoiceEngineConfig } from '../config/index.js';
import type { ILogger } from '../logger/index.js';
import type { IMetricsCollector } from '../metrics/index.js';
import type { SessionId, CallSid } from '../types/index.js';
import { createMediaSessionContext } from './MediaSessionContext.js';
import { MediaSession } from './MediaSession.js';
import type { IMediaSession } from './MediaSession.js';

/**
 * All dependencies required to construct a `MediaSession`.
 *
 * Every field is required. The factory performs no defaulting and no
 * resolution of optional fields. All injected objects must be fully
 * initialised before being passed to `createMediaSession`.
 */
export interface MediaSessionDependencies {
  /**
   * The low-level conversation runtime that drives the call state machine.
   * Must be in the CREATED state when passed to the factory.
   */
  readonly runtime: ConversationRuntime;

  /**
   * The audio processing engine for this call.
   * Must not yet be started — `MediaCoordinator` calls `start()` internally.
   */
  readonly audioEngine: IAudioEngine;

  /**
   * The conversation orchestrator that manages turn scheduling and barge-in.
   * Must be in the IDLE state when passed to the factory.
   */
  readonly orchestrator: IConversationOrchestrator;

  /**
   * The real-time AI provider session.
   * Must not be connected — `ConversationOrchestrator.start()` calls `connect()`.
   */
  readonly providerSession: IRealtimeProviderSession;

  /**
   * Frozen voice engine configuration snapshot for this call.
   */
  readonly config: Readonly<VoiceEngineConfig>;

  /**
   * Structured logger. Should already be bound with `sessionId` and `callSid`.
   */
  readonly logger: ILogger;

  /**
   * Metrics collector scoped to this call.
   */
  readonly metrics: IMetricsCollector;

  /**
   * Monotonic clock. Shared across all components in this session.
   */
  readonly clock: IClock;

  /**
   * Unique identifier for this session.
   */
  readonly sessionId: SessionId;

  /**
   * Telephony call identifier bound to this session.
   */
  readonly callSid: CallSid;

  /**
   * Campaign identifier associated with this session.
   */
  readonly campaignId: string;
}

/**
 * Public interface for the media session factory.
 *
 * Implementations must be stateless — all per-call state lives inside
 * the produced `IMediaSession`, not in the factory.
 */
export interface IMediaSessionFactory {
  /**
   * Constructs and returns a new `IMediaSession` in the CREATED state.
   *
   * The returned session has not been initialised. The caller must invoke
   * `initialize()` and then `start()` before audio processing can begin.
   *
   * @param deps - Fully wired per-call dependencies.
   * @returns A new `IMediaSession` in the CREATED state.
   */
  createMediaSession(deps: MediaSessionDependencies): IMediaSession;
}

/**
 * Production implementation of `IMediaSessionFactory`.
 *
 * Construct once at bootstrap and reuse across all calls.
 */
export class MediaSessionFactory implements IMediaSessionFactory {
  /**
   * Constructs a new `MediaSession` from the provided dependencies.
   *
   * Steps performed by this method:
   * 1. Assembles and freezes a `MediaSessionContext` from `deps`.
   * 2. Constructs a `MediaSession` (which emits `media.created`).
   * 3. Returns the session in the CREATED state.
   *
   * @param deps - All per-call dependencies, fully initialised.
   * @returns A new `IMediaSession` in the CREATED state.
   */
  createMediaSession(deps: MediaSessionDependencies): IMediaSession {
    const ctx = createMediaSessionContext({
      runtime: deps.runtime,
      audioEngine: deps.audioEngine,
      orchestrator: deps.orchestrator,
      providerSession: deps.providerSession,
      config: deps.config,
      logger: deps.logger.child({
        component: 'MediaSession',
        sessionId: deps.sessionId,
        callSid: deps.callSid,
      }),
      metrics: deps.metrics,
      clock: deps.clock,
      sessionId: deps.sessionId,
      callSid: deps.callSid,
      campaignId: deps.campaignId,
    });

    return new MediaSession(ctx);
  }
}

/**
 * Convenience function — constructs a `MediaSession` using the given factory
 * and dependencies. Mirrors the pattern used by `createConversationRuntime`.
 *
 * @param factory - Factory implementation to delegate to.
 * @param deps    - Per-call dependencies.
 * @returns A new `IMediaSession` in the CREATED state.
 *
 * @example
 * ```typescript
 * const session = createMediaSession(factory, deps);
 * await session.initialize();
 * await session.start();
 * session.on('media.completed', (event) => {
 *   logger.info('Call ended', { durationMs: event.durationMs });
 * });
 * ```
 */
export function createMediaSession(
  factory: IMediaSessionFactory,
  deps: MediaSessionDependencies
): IMediaSession {
  return factory.createMediaSession(deps);
}
