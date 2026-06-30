/**
 * @module V2SessionCoordinator
 *
 * The single, authoritative entry point for creating and managing
 * Voice Engine V2 call sessions during the V1→V2 migration period.
 *
 * ## Responsibility
 * `V2SessionCoordinator` owns the full lifecycle of a V2 session:
 * creation, lookup-index attachment, retrieval, destruction, and
 * periodic expiry cleanup. It delegates all storage concerns to
 * `SessionRegistry` and all construction concerns to `SessionFactory`.
 *
 * ## What it does NOT do
 * - No OpenAI calls.
 * - No Exotel calls.
 * - No transport or WebSocket logic.
 * - No audio processing.
 *
 * ## Thread Safety
 * Node.js is single-threaded. All methods are synchronous or sequential
 * `async/await`. No locking is required.
 *
 * ## Rules
 * - No OpenAI imports.
 * - No Exotel imports.
 * - No transport logic.
 * - No WebSocket logic.
 * - Owns ONLY `SessionRegistry`.
 * - All dependencies injected through the constructor.
 */

import type { ILogger } from '../logger/index.js';
import type { SessionId, CallSid, Nullable } from '../types/index.js';
import type { ISessionRegistry } from './SessionRegistry.js';
import type { ISessionFactory, CreateSessionParams } from './SessionFactory.js';
import type { SessionContext } from './SessionContext.js';

// ─── Options ──────────────────────────────────────────────────────────────────

/**
 * Configuration options for `V2SessionCoordinator`.
 */
export interface V2SessionCoordinatorOptions {
  /**
   * Maximum session age before it is eligible for cleanup.
   * Defaults to 3 600 000 ms (1 hour).
   */
  readonly maxSessionAgeMs?: number;
}

// ─── Public Interface ─────────────────────────────────────────────────────────

/**
 * Public contract for the V2 session coordinator.
 */
export interface IV2SessionCoordinator {
  /**
   * Creates a new V2 call session.
   *
   * Internally calls `SessionFactory.createSession()` to construct all
   * V2 engine dependencies, then registers the result in `SessionRegistry`.
   *
   * @param params - Session creation parameters (campaignId required; phone
   *                 and callSid are optional at creation time).
   * @returns The frozen `SessionContext` for the new session.
   *
   * @throws {Error} if session construction fails.
   */
  createSession(params: CreateSessionParams): Promise<Readonly<SessionContext>>;

  /**
   * Associates a telephony call SID with an existing session.
   *
   * Updates the `callSid` lookup index in `SessionRegistry` so that
   * future calls to `getSession({ callSid })` resolve correctly.
   *
   * @param sessionId - The session to update.
   * @param callSid   - The call SID returned by the telephony provider.
   *
   * @throws {Error} if `sessionId` is not registered.
   */
  attachCallSid(sessionId: SessionId, callSid: CallSid): void;

  /**
   * Associates a phone number with an existing session.
   *
   * Updates the `phone` lookup index in `SessionRegistry` so that
   * future calls to `getSession({ phone })` resolve correctly.
   *
   * @param sessionId - The session to update.
   * @param phone     - The E.164 phone number of the remote party.
   *
   * @throws {Error} if `sessionId` is not registered.
   */
  attachPhone(sessionId: SessionId, phone: string): void;

  /**
   * Retrieves a session by one of several lookup keys.
   *
   * Exactly one lookup key should be provided. If multiple are provided,
   * `sessionId` takes precedence over `callSid`, which takes precedence
   * over `phone`.
   *
   * @returns The `SessionContext`, or `null` if no match is found.
   */
  getSession(lookup: SessionLookup): Nullable<Readonly<SessionContext>>;

  /**
   * Destroys a session and releases all associated resources.
   *
   * Steps performed:
   * 1. Retrieves the context from the registry.
   * 2. Calls `voiceEngine.destroy()`.
   * 3. Unregisters the session from `SessionRegistry`.
   *
   * No-op if the session is not found.
   *
   * @param sessionId - The session to destroy.
   */
  destroySession(sessionId: SessionId): void;

  /**
   * Removes all sessions older than the configured `maxSessionAgeMs`.
   *
   * Calls `voiceEngine.destroy()` on each removed session before
   * unregistering it from the registry.
   *
   * @returns The number of sessions removed.
   */
  cleanupExpiredSessions(): number;

  /**
   * Returns the number of active sessions currently held in the registry.
   */
  readonly activeSessionCount: number;
}

// ─── Lookup Types ─────────────────────────────────────────────────────────────

/**
 * Identifies a session for retrieval.
 * Provide exactly one field. Priority: sessionId > callSid > phone.
 */
export interface SessionLookup {
  readonly sessionId?: SessionId;
  readonly callSid?: CallSid;
  readonly phone?: string;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Production implementation of `IV2SessionCoordinator`.
 *
 * Construct via `MigrationFactory.createCoordinator()`.
 */
export class V2SessionCoordinator implements IV2SessionCoordinator {
  private readonly _log: ILogger;
  private readonly _registry: ISessionRegistry;
  private readonly _factory: ISessionFactory;
  private readonly _maxSessionAgeMs: number;

  /**
   * @param registry - The session registry this coordinator owns.
   * @param factory  - Factory used to construct new sessions.
   * @param logger   - Logger; will be child-bound to this component.
   * @param options  - Optional configuration overrides.
   */
  constructor(
    registry: ISessionRegistry,
    factory: ISessionFactory,
    logger: ILogger,
    options: V2SessionCoordinatorOptions = {}
  ) {
    this._registry       = registry;
    this._factory        = factory;
    this._log            = logger.child({ component: 'V2SessionCoordinator' });
    this._maxSessionAgeMs = options.maxSessionAgeMs ?? 60 * 60 * 1000; // 1 hour
  }

  // ─── IV2SessionCoordinator ──────────────────────────────────────────────────

  async createSession(
    params: CreateSessionParams
  ): Promise<Readonly<SessionContext>> {
    this._log.info('Creating V2 session', {
      campaignId: params.campaignId,
      phone:      params.phone ?? null,
      callSid:    params.callSid ?? null,
    });

    const context = await this._factory.createSession(params);
    this._registry.register(context);

    if (context.callSid) {
      this._registry.updateCallSid(context.sessionId, context.callSid);
    }

    if (context.phone) {
      this._registry.updatePhone(context.sessionId, context.phone);
    }

    this._log.info('V2 session created', {
      sessionId:  context.sessionId,
      campaignId: context.campaignId,
    });

    return context;
  }

  attachCallSid(sessionId: SessionId, callSid: CallSid): void {
    this._log.debug('Attaching callSid', { sessionId, callSid });
    this._registry.updateCallSid(sessionId, callSid);
  }

  attachPhone(sessionId: SessionId, phone: string): void {
    this._log.debug('Attaching phone', { sessionId, phone });
    this._registry.updatePhone(sessionId, phone);
  }

  getSession(lookup: SessionLookup): Nullable<Readonly<SessionContext>> {
    if (lookup.sessionId !== undefined) {
      return this._registry.get(lookup.sessionId);
    }
    if (lookup.callSid !== undefined) {
      return this._registry.getByCallSid(lookup.callSid);
    }
    if (lookup.phone !== undefined) {
      return this._registry.getByPhone(lookup.phone);
    }

    this._log.warn('getSession called with no lookup key');
    return null;
  }

  destroySession(sessionId: SessionId): void {
    const ctx = this._registry.get(sessionId);
    if (!ctx) {
      this._log.warn('destroySession: session not found', { sessionId });
      return;
    }

    this._log.info('Destroying V2 session', { sessionId });

    try {
      ctx.voiceEngine.destroy();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this._log.error('Error destroying voice engine', { sessionId, error: message });
    }

    this._registry.unregister(sessionId);
    this._log.info('V2 session destroyed', { sessionId });
  }

  cleanupExpiredSessions(): number {
    this._log.debug('Running expired session cleanup', {
      maxSessionAgeMs: this._maxSessionAgeMs,
      activeSessions:  this._registry.count(),
    });

    const cutoff = Date.now() - this._maxSessionAgeMs;

    // Collect expired sessions first to avoid mutating the registry
    // while iterating (unregister sweeps indices during unregister).
    const expired = this._registry
      .list()
      .filter((ctx) => ctx.createdAt < cutoff)
      .map((ctx) => ctx.sessionId);

    for (const sessionId of expired) {
      this.destroySession(sessionId);
    }

    if (expired.length > 0) {
      this._log.info('Expired sessions cleaned up', {
        removed:   expired.length,
        remaining: this._registry.count(),
      });
    }

    return expired.length;
  }

  get activeSessionCount(): number {
    return this._registry.count();
  }
}
