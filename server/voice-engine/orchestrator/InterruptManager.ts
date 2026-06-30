/**
 * @module InterruptManager
 *
 * Tracks and arbitrates barge-in (interruption) requests during a live call.
 *
 * ## Purpose
 * Provides a single place to gate, track, and acknowledge interruption events.
 * The orchestrator consults `InterruptManager` before acting on a barge-in
 * signal to enforce the `TurnPolicy.maxInterruptDepth` constraint and avoid
 * duplicate interruption handling.
 *
 * ## Ownership
 * One `InterruptManager` instance is created per `ConversationOrchestrator`.
 * Shared mutable state is confined to this object; no external code modifies
 * interruption state directly.
 *
 * ## Thread Safety
 * All methods are synchronous. The orchestrator must call them sequentially
 * from its async pipeline to avoid race conditions.
 */

import type { Timestamp, Nullable } from '../types/index.js';
import type { TurnPolicy } from './TurnPolicy.js';

/**
 * A recorded interruption request, created by `InterruptManager.request()`.
 */
export interface InterruptRequest {
  /** Monotonically increasing identifier for this interrupt request. */
  readonly requestId: number;
  /** When the barge-in signal was received. */
  readonly requestedAt: Timestamp;
  /** Whether this request has been acknowledged by the orchestrator. */
  acknowledged: boolean;
  /** When the acknowledgement was recorded, or null if not yet acknowledged. */
  acknowledgedAt: Nullable<Timestamp>;
}

/**
 * Manages barge-in state for one conversation.
 *
 * Lifecycle per interrupt:
 * 1. `request(now)`      — caller audio detected; interrupt is gated against policy.
 * 2. `acknowledge(now)`  — orchestrator confirms it has cancelled the active response.
 * 3. `clear()`           — interrupt cycle complete; ready for next turn.
 */
export class InterruptManager {
  private readonly _policy: TurnPolicy;
  private _activeRequest: Nullable<InterruptRequest> = null;
  private _totalInterruptions = 0;
  private _nextRequestId = 1;

  constructor(policy: TurnPolicy) {
    this._policy = policy;
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  /** Whether an interruption is currently pending acknowledgement. */
  get isPending(): boolean {
    return this._activeRequest !== null && !this._activeRequest.acknowledged;
  }

  /** Whether the active interruption has been acknowledged. */
  get isAcknowledged(): boolean {
    return this._activeRequest?.acknowledged === true;
  }

  /** Whether any interruption is active (pending or acknowledged). */
  get isActive(): boolean {
    return this._activeRequest !== null;
  }

  /** Total number of interruptions recorded in this conversation. */
  get totalInterruptions(): number {
    return this._totalInterruptions;
  }

  /** The active interrupt request, or null if none. */
  get activeRequest(): Nullable<Readonly<InterruptRequest>> {
    return this._activeRequest;
  }

  // ─── Commands ─────────────────────────────────────────────────────────────

  /**
   * Records an interrupt request if policy allows.
   *
   * Returns `true` if the interrupt was accepted (the orchestrator should act
   * on it). Returns `false` if the policy has been exceeded or a request is
   * already active.
   *
   * @param now - Current timestamp from the orchestrator's clock.
   */
  request(now: Timestamp): boolean {
    if (this._activeRequest !== null) {
      return false;
    }

    if (this._totalInterruptions >= this._policy.maxInterruptDepth) {
      return false;
    }

    this._activeRequest = {
      requestId: this._nextRequestId++,
      requestedAt: now,
      acknowledged: false,
      acknowledgedAt: null,
    };

    return true;
  }

  /**
   * Acknowledges the active interrupt request, recording that the orchestrator
   * has cancelled the in-progress response.
   *
   * @param now - Current timestamp.
   * @returns `true` if acknowledgement was recorded; `false` if no pending request.
   */
  acknowledge(now: Timestamp): boolean {
    if (!this._activeRequest || this._activeRequest.acknowledged) {
      return false;
    }

    this._activeRequest.acknowledged = true;
    this._activeRequest.acknowledgedAt = now;
    this._totalInterruptions += 1;
    return true;
  }

  /**
   * Clears the active interrupt, resetting the manager for the next turn.
   * Must be called after the orchestrator has started listening again.
   */
  clear(): void {
    this._activeRequest = null;
  }

  /**
   * Resets the manager entirely (e.g. on conversation restart).
   */
  reset(): void {
    this._activeRequest = null;
    this._totalInterruptions = 0;
    this._nextRequestId = 1;
  }
}
