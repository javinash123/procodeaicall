/**
 * @module TurnState
 *
 * State machine for a single conversational turn within a live call.
 *
 * ## Ownership
 * Owned by `ConversationTurn`. Transitions are applied only through the
 * `ConversationOrchestrator`; no external code mutates turn state directly.
 *
 * ## Thread Safety
 * Reads are safe from any context. Mutations are single-threaded through
 * the orchestrator's sequential async pipeline.
 *
 * ## State Machine
 * ```
 * CREATED
 *   └─► LISTENING     (orchestrator signals audio capture has started)
 *         └─► PROCESSING   (utterance complete; LLM request in-flight)
 *               └─► RESPONDING  (response streaming to caller)
 *                     ├─► COMPLETED   (response delivered fully)
 *                     └─► INTERRUPTED (barge-in during response)
 *
 * Any state ──► FAILED      (unrecoverable error in this turn)
 * ```
 */

/**
 * All states a single conversational turn may occupy.
 * States are mutually exclusive.
 */
export enum TurnState {
  /**
   * Turn has been created but no audio capture has begun.
   * The orchestrator allocates the turn before entering LISTENING.
   */
  CREATED = 'CREATED',

  /**
   * The runtime is capturing and buffering caller audio.
   * The turn accumulates audio until an utterance boundary is detected.
   */
  LISTENING = 'LISTENING',

  /**
   * A complete utterance has been received and transcribed.
   * The LLM is generating a response. No audio is streaming yet.
   */
  PROCESSING = 'PROCESSING',

  /**
   * The response is being synthesised and streamed to the caller.
   * Barge-in detection is active.
   */
  RESPONDING = 'RESPONDING',

  /**
   * The caller spoke during RESPONDING, cancelling the current response.
   * The orchestrator will create a new turn after interrupt handling.
   */
  INTERRUPTED = 'INTERRUPTED',

  /**
   * The full response was delivered without interruption.
   * The turn is sealed — no further state transitions occur.
   */
  COMPLETED = 'COMPLETED',

  /**
   * A fatal error occurred in this turn (provider failure, timeout, etc.).
   * The turn is sealed. The orchestrator may attempt a recovery turn.
   */
  FAILED = 'FAILED',
}

/** Terminal states after which no further transitions are valid. */
export const TERMINAL_TURN_STATES: ReadonlySet<TurnState> = new Set([
  TurnState.COMPLETED,
  TurnState.INTERRUPTED,
  TurnState.FAILED,
]);

/**
 * Valid predecessor states for each target turn state.
 * Authoritative — no transition not present here is permitted.
 */
export const VALID_TURN_TRANSITIONS: Readonly<Record<TurnState, ReadonlySet<TurnState>>> = {
  [TurnState.CREATED]:      new Set<TurnState>([]),
  [TurnState.LISTENING]:    new Set<TurnState>([TurnState.CREATED]),
  [TurnState.PROCESSING]:   new Set<TurnState>([TurnState.LISTENING]),
  [TurnState.RESPONDING]:   new Set<TurnState>([TurnState.PROCESSING]),
  [TurnState.INTERRUPTED]:  new Set<TurnState>([TurnState.RESPONDING]),
  [TurnState.COMPLETED]:    new Set<TurnState>([TurnState.RESPONDING]),
  [TurnState.FAILED]:       new Set<TurnState>([
    TurnState.CREATED,
    TurnState.LISTENING,
    TurnState.PROCESSING,
    TurnState.RESPONDING,
  ]),
};
