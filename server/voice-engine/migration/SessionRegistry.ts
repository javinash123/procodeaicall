/**
 * @module SessionRegistry
 *
 * Thread-safe, dependency-injected registry of active Voice Engine V2 sessions.
 *
 * ## Responsibility
 * `SessionRegistry` is the single source of truth for all live sessions.
 * It maintains three indices for fast lookup by session ID, call SID, and
 * phone number. It owns no business logic — it stores, retrieves, and
 * removes `SessionContext` objects only.
 *
 * ## Thread Safety
 * Node.js is single-threaded. All mutations are synchronous. No locking
 * is required beyond the guarantee that callers must not hold stale
 * references after calling `unregister`.
 *
 * ## Rules
 * - No OpenAI imports.
 * - No Exotel imports.
 * - No transport logic.
 * - No WebSocket logic.
 * - No global singletons — always constructed via `MigrationFactory`.
 * - All dependencies injected through the constructor.
 */

import type { ILogger } from '../logger/index.js';
import type { SessionContext } from './SessionContext.js';
import type { SessionId, CallSid, Nullable } from '../types/index.js';
import { normalizePhoneNumber } from '../../phoneUtils.js';

// ─── Public Interface ─────────────────────────────────────────────────────────

/**
 * Public contract for the session registry.
 */
export interface ISessionRegistry {
  /**
   * Adds a session to the registry.
   * Indexed by `context.sessionId`. No-op if already registered.
   *
   * @param context - The fully constructed, frozen `SessionContext`.
   * @throws {Error} if `context.sessionId` is already registered.
   */
  register(context: SessionContext): void;

  /**
   * Removes a session from the registry and all lookup indices.
   * No-op if the session is not found.
   *
   * @param sessionId - The session to remove.
   */
  unregister(sessionId: SessionId): void;

  /**
   * Retrieves a session by its unique session ID.
   *
   * @param sessionId - The session to look up.
   * @returns The `SessionContext`, or `null` if not found.
   */
  get(sessionId: SessionId): Nullable<SessionContext>;

  /**
   * Retrieves a session by its telephony call SID.
   *
   * @param callSid - The call SID previously registered via `updateCallSid`.
   * @returns The `SessionContext`, or `null` if not found.
   */
  getByCallSid(callSid: CallSid): Nullable<SessionContext>;

  /**
   * Retrieves a session by the remote party's phone number.
   *
   * @param phone - The E.164 phone number previously registered via `updatePhone`.
   * @returns The `SessionContext`, or `null` if not found.
   */
  getByPhone(phone: string): Nullable<SessionContext>;

  /**
   * Associates a call SID with an existing session.
   * Adds or replaces the entry in the callSid index.
   *
   * @param sessionId - The owning session.
   * @param callSid   - The call SID to associate.
   * @throws {Error} if `sessionId` is not registered.
   */
  updateCallSid(sessionId: SessionId, callSid: CallSid): void;

  /**
   * Associates a phone number with an existing session.
   * Adds or replaces the entry in the phone index.
   *
   * @param sessionId - The owning session.
   * @param phone     - The E.164 phone number to associate.
   * @throws {Error} if `sessionId` is not registered.
   */
  updatePhone(sessionId: SessionId, phone: string): void;

  /**
   * Returns all registered sessions as an ordered array.
   * The order is insertion order (Map iteration order).
   *
   * @returns A snapshot array — mutations to the array do not affect the registry.
   */
  list(): readonly SessionContext[];

  /**
   * Returns the number of active sessions.
   */
  count(): number;

  /**
   * Removes all sessions whose `createdAt` timestamp is older than
   * `maxAgeMs` milliseconds from `now`.
   *
   * @param maxAgeMs - Maximum session age in milliseconds.
   * @param now      - Current time in Unix ms. Defaults to `Date.now()`.
   * @returns The number of sessions removed.
   */
  cleanup(maxAgeMs: number, now?: number): number;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Production implementation of `ISessionRegistry`.
 *
 * Uses three `Map` instances for O(1) lookup by sessionId, callSid, and phone.
 * Construct via `MigrationFactory.createRegistry()` to ensure proper DI.
 */
export class SessionRegistry implements ISessionRegistry {
  private readonly _log: ILogger;

  /** Primary store: sessionId → SessionContext */
  private readonly _sessions: Map<SessionId, SessionContext> = new Map();

  /** Secondary index: callSid → sessionId */
  private readonly _callSidIndex: Map<CallSid, SessionId> = new Map();

  /** Secondary index: phone → sessionId */
  private readonly _phoneIndex: Map<string, SessionId> = new Map();

  /**
   * @param logger - Logger bound to the `SessionRegistry` component.
   */
  constructor(logger: ILogger) {
    this._log = logger.child({ component: 'SessionRegistry' });
  }

  // ─── ISessionRegistry ───────────────────────────────────────────────────────

  register(context: SessionContext): void {
    const { sessionId } = context;

    if (this._sessions.has(sessionId)) {
      throw new Error(
        `SessionRegistry: session "${sessionId}" is already registered.`
      );
    }

    this._sessions.set(sessionId, context);
    this._log.debug('Session registered', { sessionId, campaignId: context.campaignId });
  }

  unregister(sessionId: SessionId): void {
    const ctx = this._sessions.get(sessionId);
    if (!ctx) {
      this._log.warn('Unregister called for unknown session', { sessionId });
      return;
    }

    this._sessions.delete(sessionId);

    if (ctx.callSid) {
      this._callSidIndex.delete(ctx.callSid);
    }

    if (ctx.phone) {
      this._phoneIndex.delete(ctx.phone);
    }

    // Sweep any orphaned callSid / phone entries pointing at this sessionId
    Array.from(this._callSidIndex.entries()).forEach(([callSid, sid]) => {
      if (sid === sessionId) this._callSidIndex.delete(callSid);
    });
    Array.from(this._phoneIndex.entries()).forEach(([phone, sid]) => {
      if (sid === sessionId) this._phoneIndex.delete(phone);
    });

    this._log.debug('Session unregistered', { sessionId });
  }

  get(sessionId: SessionId): Nullable<SessionContext> {
    return this._sessions.get(sessionId) ?? null;
  }

  getByCallSid(callSid: CallSid): Nullable<SessionContext> {
    const sessionId = this._callSidIndex.get(callSid);
    if (!sessionId) return null;
    return this._sessions.get(sessionId) ?? null;
  }

  getByPhone(phone: string): Nullable<SessionContext> {
    const normalized = normalizePhoneNumber(phone);
    const sessionId  = this._phoneIndex.get(normalized);
    if (!sessionId) return null;
    return this._sessions.get(sessionId) ?? null;
  }

  updateCallSid(sessionId: SessionId, callSid: CallSid): void {
    if (!this._sessions.has(sessionId)) {
      throw new Error(
        `SessionRegistry: cannot updateCallSid — session "${sessionId}" not registered.`
      );
    }
    this._callSidIndex.set(callSid, sessionId);
    this._log.debug('CallSid index updated', { sessionId, callSid });
  }

  updatePhone(sessionId: SessionId, phone: string): void {
    if (!this._sessions.has(sessionId)) {
      throw new Error(
        `SessionRegistry: cannot updatePhone — session "${sessionId}" not registered.`
      );
    }
    const normalized = normalizePhoneNumber(phone);
    this._phoneIndex.set(normalized, sessionId);
    this._log.debug('Phone index updated', { sessionId, phone: normalized });
  }

  list(): readonly SessionContext[] {
    return Array.from(this._sessions.values());
  }

  count(): number {
    return this._sessions.size;
  }

  cleanup(maxAgeMs: number, now: number = Date.now()): number {
    if (maxAgeMs < 0) {
      throw new Error('SessionRegistry: maxAgeMs must be non-negative.');
    }

    let removed = 0;
    const cutoff = now - maxAgeMs;

    Array.from(this._sessions.entries()).forEach(([sessionId, ctx]) => {
      if (ctx.createdAt < cutoff) {
        this.unregister(sessionId);
        removed++;
        this._log.info('Session removed by cleanup', { sessionId, ageMs: now - ctx.createdAt });
      }
    });

    if (removed > 0) {
      this._log.info('Session cleanup complete', { removed, remaining: this._sessions.size });
    }

    return removed;
  }
}
