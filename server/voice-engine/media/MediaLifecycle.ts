/**
 * @module MediaLifecycle
 *
 * Pure lifecycle decision logic for a `MediaSession`.
 *
 * ## Purpose
 * `MediaLifecycle` is a stateless decision engine. Given a current state
 * and a proposed transition, it returns whether the transition is legal
 * and, if not, why. It encodes NO timers, NO network calls, NO provider
 * references, and NO side effects.
 *
 * All state machine rules are derived from `MEDIA_VALID_TRANSITIONS` in
 * `MediaSessionState.ts`. `MediaLifecycle` is the single place where those
 * rules are enforced at runtime.
 *
 * ## Usage
 * ```typescript
 * const result = MediaLifecycle.evaluate(current, MediaSessionState.ACTIVE);
 * if (!result.allowed) {
 *   throw new VoiceEngineError(result.reason, ErrorCode.PIPELINE_ABORTED, false);
 * }
 * ```
 *
 * ## Thread Safety
 * All methods are pure functions with no shared mutable state.
 * Safe to call from any context without synchronisation.
 */

import {
  MediaSessionState,
  MEDIA_VALID_TRANSITIONS,
  MEDIA_TERMINAL_STATES,
} from './MediaSessionState.js';

/**
 * The result returned by a lifecycle decision evaluation.
 */
export type LifecycleDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

/**
 * Pure lifecycle decision functions for `MediaSession` state transitions.
 *
 * All methods are static and stateless. The class serves as a namespace.
 */
export class MediaLifecycle {
  private constructor() {
    // Namespace class — not instantiable.
  }

  /**
   * Evaluates whether a transition from `current` to `next` is legal
   * according to the media state machine.
   *
   * @param current - The state the session is currently in.
   * @param next    - The target state being requested.
   * @returns `{ allowed: true }` if the transition is legal, or
   *          `{ allowed: false, reason }` describing the violation.
   */
  static evaluate(
    current: MediaSessionState,
    next: MediaSessionState
  ): LifecycleDecision {
    const validPredecessors = MEDIA_VALID_TRANSITIONS[next];

    if (!validPredecessors.has(current)) {
      return {
        allowed: false,
        reason:
          `Illegal MediaSession state transition: ${current} → ${next}. ` +
          `Valid predecessors for ${next}: [${Array.from(validPredecessors).join(', ') || 'none'}].`,
      };
    }

    return { allowed: true };
  }

  /**
   * Returns `true` if `state` is a terminal state from which no further
   * active transitions are possible (except DESTROYED via `destroy()`).
   *
   * @param state - The state to check.
   */
  static isTerminal(state: MediaSessionState): boolean {
    return MEDIA_TERMINAL_STATES.has(state);
  }

  /**
   * Returns `true` if transitioning to DESTROYED from `state` is legal.
   * DESTROYED is always reachable from COMPLETED or FAILED.
   *
   * @param state - The state to check.
   */
  static canDestroy(state: MediaSessionState): boolean {
    return MEDIA_VALID_TRANSITIONS[MediaSessionState.DESTROYED].has(state);
  }

  /**
   * Returns `true` if the session is allowed to accept inbound audio
   * in the given state. Audio is only processed while the session is
   * actively running (ACTIVE or INTERRUPTED).
   *
   * @param state - The state to check.
   */
  static acceptsInboundAudio(state: MediaSessionState): boolean {
    return (
      state === MediaSessionState.ACTIVE ||
      state === MediaSessionState.INTERRUPTED
    );
  }

  /**
   * Returns `true` if the session is allowed to emit outbound audio
   * in the given state. Outbound audio flows while ACTIVE or COMPLETING
   * (to allow final utterance flush).
   *
   * @param state - The state to check.
   */
  static acceptsOutboundAudio(state: MediaSessionState): boolean {
    return (
      state === MediaSessionState.ACTIVE ||
      state === MediaSessionState.COMPLETING
    );
  }

  /**
   * Returns `true` if a pause request is legal from `state`.
   *
   * @param state - The state to check.
   */
  static canPause(state: MediaSessionState): boolean {
    return MEDIA_VALID_TRANSITIONS[MediaSessionState.PAUSED].has(state);
  }

  /**
   * Returns `true` if a resume (PAUSED → ACTIVE) request is legal.
   *
   * @param state - The state to check.
   */
  static canResume(state: MediaSessionState): boolean {
    return state === MediaSessionState.PAUSED;
  }

  /**
   * Returns `true` if an interruption can be signalled from `state`.
   *
   * @param state - The state to check.
   */
  static canInterrupt(state: MediaSessionState): boolean {
    return MEDIA_VALID_TRANSITIONS[MediaSessionState.INTERRUPTED].has(state);
  }

  /**
   * Returns `true` if a graceful completion can be requested from `state`.
   *
   * @param state - The state to check.
   */
  static canComplete(state: MediaSessionState): boolean {
    return MEDIA_VALID_TRANSITIONS[MediaSessionState.COMPLETING].has(state);
  }
}
