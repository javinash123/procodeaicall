/**
 * @module MediaSessionState
 *
 * Defines the complete state machine for a single Media Session.
 *
 * ## Purpose
 * `MediaSessionState` is the authoritative lifecycle enum for a `MediaSession`.
 * It is distinct from `RuntimeState` (low-level per-call runtime) and
 * `OrchestratorState` (turn coordination). `MediaSessionState` represents the
 * observable lifecycle at the Media coordination layer.
 *
 * ## State Machine
 *
 * ```
 * CREATED
 *   └─► INITIALIZING   (initialize() — wires runtime, audio engine, orchestrator)
 *         └─► READY       (all components connected, first turn pending)
 *               └─► ACTIVE    (conversation flowing; turns in progress)
 *                     ├─► PAUSED       (session temporarily suspended)
 *                     │     └─► ACTIVE  (resumed)
 *                     └─► INTERRUPTED  (barge-in; returning to ACTIVE)
 *                           └─► ACTIVE
 *
 * ACTIVE | PAUSED ──► COMPLETING  (graceful shutdown requested)
 *                       └─► COMPLETED   (all resources flushed)
 *
 * Any state ──► FAILED     (unrecoverable error)
 *
 * COMPLETED | FAILED ──► DESTROYED  (all resources released)
 * ```
 *
 * ## Thread Safety
 * State is owned exclusively by `MediaSession`. No external code may mutate
 * state directly. All transitions occur through `MediaSession` lifecycle methods.
 */

/**
 * All possible states a `MediaSession` instance can occupy.
 *
 * States are mutually exclusive. A session is always in exactly one state.
 */
export enum MediaSessionState {
  /**
   * Initial state after construction.
   * No components are wired. The session exists but is not usable.
   */
  CREATED = 'CREATED',

  /**
   * `initialize()` has been called.
   * The runtime, audio engine, and orchestrator are being connected.
   * No audio flows yet.
   */
  INITIALIZING = 'INITIALIZING',

  /**
   * All components are connected and the session is ready to begin.
   * The first conversational turn has not yet started.
   */
  READY = 'READY',

  /**
   * The conversation is active; turns are in progress.
   * Audio is flowing bidirectionally through the coordinator.
   */
  ACTIVE = 'ACTIVE',

  /**
   * The session has been temporarily suspended.
   * Audio processing is paused but resources remain allocated.
   */
  PAUSED = 'PAUSED',

  /**
   * A barge-in was detected while the agent was speaking.
   * The coordinator is cancelling the current response and returning
   * to the ACTIVE (listening) state.
   */
  INTERRUPTED = 'INTERRUPTED',

  /**
   * A graceful shutdown has been requested.
   * Final audio is being flushed and metrics are being persisted.
   */
  COMPLETING = 'COMPLETING',

  /**
   * The conversation has ended and all resources have been flushed.
   * The session is in a terminal state; only `destroy()` may be called.
   */
  COMPLETED = 'COMPLETED',

  /**
   * An unrecoverable error has occurred.
   * The session is in a terminal failure state; `destroy()` must be called.
   */
  FAILED = 'FAILED',

  /**
   * All resources have been released. The session instance is inert
   * and must not be reused.
   */
  DESTROYED = 'DESTROYED',
}

/**
 * States from which no further active transitions are possible.
 * `destroy()` is still permitted from COMPLETED and FAILED.
 */
export const MEDIA_TERMINAL_STATES: ReadonlySet<MediaSessionState> = new Set([
  MediaSessionState.COMPLETED,
  MediaSessionState.FAILED,
  MediaSessionState.DESTROYED,
]);

/**
 * Valid predecessor states for each target state.
 *
 * This map is the single authoritative record of every legal transition.
 * Any transition not listed here is rejected by `MediaLifecycle`.
 */
export const MEDIA_VALID_TRANSITIONS: Readonly<
  Record<MediaSessionState, ReadonlySet<MediaSessionState>>
> = {
  [MediaSessionState.CREATED]: new Set<MediaSessionState>([]),
  [MediaSessionState.INITIALIZING]: new Set<MediaSessionState>([
    MediaSessionState.CREATED,
  ]),
  [MediaSessionState.READY]: new Set<MediaSessionState>([
    MediaSessionState.INITIALIZING,
  ]),
  [MediaSessionState.ACTIVE]: new Set<MediaSessionState>([
    MediaSessionState.READY,
    MediaSessionState.PAUSED,
    MediaSessionState.INTERRUPTED,
  ]),
  [MediaSessionState.PAUSED]: new Set<MediaSessionState>([
    MediaSessionState.ACTIVE,
  ]),
  [MediaSessionState.INTERRUPTED]: new Set<MediaSessionState>([
    MediaSessionState.ACTIVE,
  ]),
  [MediaSessionState.COMPLETING]: new Set<MediaSessionState>([
    MediaSessionState.ACTIVE,
    MediaSessionState.PAUSED,
  ]),
  [MediaSessionState.COMPLETED]: new Set<MediaSessionState>([
    MediaSessionState.COMPLETING,
  ]),
  [MediaSessionState.FAILED]: new Set<MediaSessionState>([
    MediaSessionState.INITIALIZING,
    MediaSessionState.READY,
    MediaSessionState.ACTIVE,
    MediaSessionState.PAUSED,
    MediaSessionState.INTERRUPTED,
    MediaSessionState.COMPLETING,
  ]),
  [MediaSessionState.DESTROYED]: new Set<MediaSessionState>([
    MediaSessionState.COMPLETED,
    MediaSessionState.FAILED,
  ]),
};
