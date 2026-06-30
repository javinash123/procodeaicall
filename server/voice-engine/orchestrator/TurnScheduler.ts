/**
 * @module TurnScheduler
 *
 * Makes scheduling decisions for conversational turns without owning any
 * timer resources.
 *
 * ## Purpose
 * The `TurnScheduler` is a pure decision-maker. It evaluates the current
 * conversation state and returns a `SchedulingDecision` telling the
 * orchestrator what to do next. No `setTimeout`, no I/O, no side effects.
 *
 * ## Ownership
 * One `TurnScheduler` per `ConversationOrchestrator`. The orchestrator calls
 * `decide()` after each significant event and acts on the result.
 *
 * ## Thread Safety
 * All methods are synchronous and pure with respect to the inputs. No shared
 * mutable state beyond the `_turnCount` counter.
 */

import type { Timestamp, Nullable } from '../types/index.js';
import type { TurnPolicy } from './TurnPolicy.js';
import { TurnState } from './TurnState.js';
import type { ConversationTurn } from './ConversationTurn.js';

/**
 * The action the orchestrator should take next, as determined by the scheduler.
 */
export type SchedulingAction =
  | 'start_listening'   // Begin the next turn's audio capture.
  | 'start_processing'  // Commit utterance and trigger LLM.
  | 'start_responding'  // Begin streaming response to caller.
  | 'handle_interrupt'  // Cancel current response, prepare for new turn.
  | 'retry_turn'        // Retry the current failed turn (within retry limit).
  | 'complete'          // Gracefully end the conversation.
  | 'wait'              // No action yet — await next event.
  | 'fail';             // Irrecoverable state — surface a fatal error.

/**
 * A scheduling decision returned by `TurnScheduler.decide()`.
 */
export interface SchedulingDecision {
  /** The recommended next action. */
  readonly action: SchedulingAction;
  /** Human-readable reason for the decision (for logging only). */
  readonly reason: string;
  /**
   * For `retry_turn` — the delay in milliseconds to wait before retrying,
   * based on the policy's retry delay configuration.
   */
  readonly retryDelayMs?: number;
}

/**
 * Snapshot of conversation state passed to `TurnScheduler.decide()`.
 */
export interface SchedulingInput {
  /** The current active turn, or null between turns. */
  readonly currentTurn: Nullable<ConversationTurn>;
  /** The most recently completed turn, or null on the first turn. */
  readonly previousTurn: Nullable<ConversationTurn>;
  /** Total number of completed turns so far. */
  readonly completedTurnCount: number;
  /** Whether an interrupt is currently active and pending acknowledgement. */
  readonly interruptPending: boolean;
  /** Whether a silence timeout has been signalled since the last reset. */
  readonly silenceTimeout: boolean;
  /** Whether a response generation timeout has fired. */
  readonly responseTimeout: boolean;
  /** Whether a session-level timeout has fired. */
  readonly sessionTimeout: boolean;
  /** Current wall-clock time from the orchestrator's clock. */
  readonly now: Timestamp;
}

/**
 * Pure scheduling decision engine for conversational turns.
 */
export class TurnScheduler {
  private readonly _policy: TurnPolicy;

  constructor(policy: TurnPolicy) {
    this._policy = policy;
  }

  /**
   * Evaluates the current conversation state and returns the next action
   * the orchestrator should take.
   *
   * Called after every significant event: turn state changes, timeouts,
   * interrupts, provider events.
   */
  decide(input: SchedulingInput): SchedulingDecision {
    const { currentTurn, completedTurnCount, interruptPending, silenceTimeout, responseTimeout, sessionTimeout } = input;

    if (sessionTimeout) {
      return { action: 'complete', reason: 'Session wall-clock timeout reached' };
    }

    if (completedTurnCount >= this._policy.maxTurns) {
      return { action: 'complete', reason: `Maximum turn count reached (${this._policy.maxTurns})` };
    }

    if (currentTurn === null) {
      return { action: 'start_listening', reason: 'No active turn — beginning first turn' };
    }

    const state = currentTurn.state;

    if (interruptPending && state === TurnState.RESPONDING) {
      return { action: 'handle_interrupt', reason: 'Barge-in detected during response' };
    }

    if (state === TurnState.INTERRUPTED) {
      return { action: 'start_listening', reason: 'Interrupt acknowledged — starting new turn' };
    }

    if (state === TurnState.COMPLETED) {
      return { action: 'start_listening', reason: 'Turn completed — starting next turn' };
    }

    if (state === TurnState.FAILED) {
      if (currentTurn.retryCount < this._policy.retry.maxRetryAttempts) {
        return {
          action: 'retry_turn',
          reason: `Turn failed — retry ${currentTurn.retryCount + 1} of ${this._policy.retry.maxRetryAttempts}`,
          retryDelayMs: this._policy.retry.retryDelayMs,
        };
      }
      return { action: 'fail', reason: 'Turn failed and retry limit exceeded' };
    }

    if (state === TurnState.LISTENING) {
      if (silenceTimeout) {
        return { action: 'complete', reason: 'Silence timeout exceeded in LISTENING state' };
      }
      return { action: 'wait', reason: 'Waiting for caller utterance' };
    }

    if (state === TurnState.PROCESSING) {
      if (responseTimeout) {
        return { action: 'fail', reason: 'Response generation timeout exceeded' };
      }
      return { action: 'wait', reason: 'Waiting for LLM response' };
    }

    if (state === TurnState.RESPONDING) {
      return { action: 'wait', reason: 'Response streaming to caller' };
    }

    if (state === TurnState.CREATED) {
      return { action: 'start_listening', reason: 'Turn created — starting audio capture' };
    }

    return { action: 'wait', reason: `No action determined for turn state: ${state}` };
  }

  /**
   * Returns `true` if a response timeout should be fired based on elapsed time.
   *
   * @param responseStartedAt - When the PROCESSING state was entered, or null.
   * @param now - Current timestamp.
   */
  isResponseTimedOut(responseStartedAt: Nullable<Timestamp>, now: Timestamp): boolean {
    if (responseStartedAt === null) return false;
    return now - responseStartedAt > this._policy.responseTimeoutMs;
  }

  /**
   * Returns `true` if the silence policy threshold has been exceeded.
   *
   * @param lastAudioAt - Timestamp of the last non-silent audio chunk, or null.
   * @param now - Current timestamp.
   */
  isSilenceTimedOut(lastAudioAt: Nullable<Timestamp>, now: Timestamp): boolean {
    if (lastAudioAt === null) return false;
    return now - lastAudioAt > this._policy.maxSilenceMs;
  }

  /**
   * Returns `true` if the current turn has exceeded its maximum wall-clock duration.
   *
   * @param turnCreatedAt - When the current turn was created.
   * @param now - Current timestamp.
   */
  isTurnTimedOut(turnCreatedAt: Timestamp, now: Timestamp): boolean {
    return now - turnCreatedAt > this._policy.turnTimeoutMs;
  }
}
