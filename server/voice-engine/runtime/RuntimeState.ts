/**
 * @module RuntimeState
 *
 * Defines the complete state machine for a single live conversation runtime.
 *
 * ## Ownership
 * Owned exclusively by `ConversationRuntime`. No external code may mutate state
 * directly; all transitions happen through the runtime lifecycle methods.
 *
 * ## Thread Safety
 * State reads are safe from any context. Transitions are single-threaded and
 * serialised through the runtime's internal event loop.
 *
 * ## State Machine
 *
 * ```
 * CREATED
 *   └─► INITIALIZING   (initialize() called — providers verified, session hydrated)
 *         └─► CONNECTED    (connect() called — transport established)
 *               └─► LISTENING   (startListening() — awaiting caller audio)
 *                     ├─► THINKING    (startThinking() — STT done, LLM in-flight)
 *                     │     └─► SPEAKING   (startSpeaking() — TTS streaming to caller)
 *                     │           ├─► LISTENING   (turn complete, loop continues)
 *                     │           └─► INTERRUPTED (interrupt() — caller spoke mid-TTS)
 *                     │                 └─► LISTENING   (barge-in handled, loop continues)
 *                     └─► WAITING     (silence exceeded; waiting for re-engagement)
 *                           └─► LISTENING   (caller re-engaged)
 *
 * Any state ──► COMPLETED  (complete() — graceful end of conversation)
 *                 └─► CLOSED       (close() — resources released)
 *
 * Any state ──► FAILED     (unrecoverable error)
 *                 └─► CLOSED       (destroy() — forced teardown)
 * ```
 */

/**
 * All possible states a `ConversationRuntime` instance can occupy.
 *
 * States are mutually exclusive. The runtime is always in exactly one state.
 */
export enum RuntimeState {
  /**
   * Initial state after construction.
   * No resources are allocated. The runtime exists but is not yet usable.
   */
  CREATED = 'CREATED',

  /**
   * `initialize()` has been called.
   * Providers are being verified, the session is being hydrated, and the
   * campaign snapshot is being loaded. No audio flows yet.
   */
  INITIALIZING = 'INITIALIZING',

  /**
   * `connect()` has been called and the transport is established.
   * The runtime is ready to begin the conversation but has not yet started
   * listening for caller audio.
   */
  CONNECTED = 'CONNECTED',

  /**
   * The runtime is actively receiving and buffering caller audio.
   * STT is running. The runtime waits for a complete utterance.
   */
  LISTENING = 'LISTENING',

  /**
   * A complete caller utterance has been received.
   * The LLM is generating a response. Audio input is still monitored for
   * barge-in signals.
   */
  THINKING = 'THINKING',

  /**
   * The TTS-synthesised response is streaming to the caller.
   * Barge-in detection remains active; an incoming utterance will trigger
   * a transition to INTERRUPTED.
   */
  SPEAKING = 'SPEAKING',

  /**
   * The caller spoke while the runtime was in SPEAKING state.
   * The current TTS stream has been cancelled. The runtime is handling
   * the barge-in and preparing to resume LISTENING.
   */
  INTERRUPTED = 'INTERRUPTED',

  /**
   * Silence has persisted beyond the configured silence threshold.
   * The runtime is waiting for the caller to re-engage before resuming
   * the LISTENING state.
   */
  WAITING = 'WAITING',

  /**
   * The conversation has ended gracefully (goal reached, caller hung up,
   * or max-turn limit reached). No further audio will be processed.
   */
  COMPLETED = 'COMPLETED',

  /**
   * An unrecoverable error has occurred. The runtime is in a terminal
   * failure state. `destroy()` must be called to release resources.
   */
  FAILED = 'FAILED',

  /**
   * All resources have been released. The runtime instance is inert and
   * must not be reused.
   */
  CLOSED = 'CLOSED',
}

/**
 * The set of terminal states from which no further transitions are possible
 * (except to CLOSED via `close()` or `destroy()`).
 */
export const TERMINAL_STATES: ReadonlySet<RuntimeState> = new Set([
  RuntimeState.COMPLETED,
  RuntimeState.FAILED,
  RuntimeState.CLOSED,
]);

/**
 * Valid predecessor states for each target state.
 * This map fully documents every legal transition in the state machine.
 * It is authoritative — no transition not listed here is permitted.
 */
export const VALID_TRANSITIONS: Readonly<Record<RuntimeState, ReadonlySet<RuntimeState>>> = {
  [RuntimeState.CREATED]:       new Set([]),
  [RuntimeState.INITIALIZING]:  new Set([RuntimeState.CREATED]),
  [RuntimeState.CONNECTED]:     new Set([RuntimeState.INITIALIZING]),
  [RuntimeState.LISTENING]:     new Set([
    RuntimeState.CONNECTED,
    RuntimeState.SPEAKING,
    RuntimeState.INTERRUPTED,
    RuntimeState.WAITING,
  ]),
  [RuntimeState.THINKING]:      new Set([RuntimeState.LISTENING]),
  [RuntimeState.SPEAKING]:      new Set([RuntimeState.THINKING]),
  [RuntimeState.INTERRUPTED]:   new Set([RuntimeState.SPEAKING]),
  [RuntimeState.WAITING]:       new Set([RuntimeState.LISTENING]),
  [RuntimeState.COMPLETED]:     new Set([
    RuntimeState.CONNECTED,
    RuntimeState.LISTENING,
    RuntimeState.THINKING,
    RuntimeState.SPEAKING,
    RuntimeState.INTERRUPTED,
    RuntimeState.WAITING,
  ]),
  [RuntimeState.FAILED]:        new Set([
    RuntimeState.INITIALIZING,
    RuntimeState.CONNECTED,
    RuntimeState.LISTENING,
    RuntimeState.THINKING,
    RuntimeState.SPEAKING,
    RuntimeState.INTERRUPTED,
    RuntimeState.WAITING,
  ]),
  [RuntimeState.CLOSED]:        new Set([
    RuntimeState.COMPLETED,
    RuntimeState.FAILED,
  ]),
};
