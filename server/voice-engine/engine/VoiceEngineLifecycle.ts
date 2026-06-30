/**
 * @module VoiceEngineLifecycle
 *
 * State machine for the `VoiceEngine` lifecycle.
 *
 * ## Purpose
 * `VoiceEngineLifecycle` is the single source of truth for what state the
 * engine is currently in. It validates every transition, prevents illegal
 * moves (e.g. RUNNING → INITIALIZING), and provides guard helpers that
 * callers use to check pre-conditions before performing operations.
 *
 * ## States
 * ```
 * INITIALIZING ──► READY ──► RUNNING ──► STOPPING ──► STOPPED
 *      │              │          │                        │
 *      │              └──────────┴────────────────────────┤
 *      └──────────────────────────────────────────────────▼
 *                                                       FAILED
 *                                                         │
 *                                    (any state) ────────►▼
 *                                                     DESTROYED
 * ```
 *
 * ## Rules
 * - No OpenAI imports.
 * - No Exotel imports.
 * - No Audio Engine imports.
 * - No IO — purely synchronous state manipulation.
 *
 * ## Thread Safety
 * Node.js is single-threaded. All transitions are synchronous.
 * No locking is required.
 */

// ─── States ───────────────────────────────────────────────────────────────────

/**
 * Enumeration of all possible voice engine lifecycle states.
 */
export type VoiceEngineLifecycleState =
  | 'INITIALIZING'
  | 'READY'
  | 'RUNNING'
  | 'STOPPING'
  | 'STOPPED'
  | 'FAILED'
  | 'DESTROYED';

/**
 * States in which the engine can accept new calls.
 */
export const ACTIVE_STATES: ReadonlySet<VoiceEngineLifecycleState> = new Set<VoiceEngineLifecycleState>([
  'RUNNING',
]);

/**
 * States in which the engine has been permanently halted.
 */
export const TERMINAL_STATES: ReadonlySet<VoiceEngineLifecycleState> = new Set<VoiceEngineLifecycleState>([
  'STOPPED',
  'FAILED',
  'DESTROYED',
]);

/**
 * Valid lifecycle transitions.
 * Each key is a source state; each value is the set of reachable target states.
 */
export const VALID_ENGINE_TRANSITIONS: Readonly<
  Record<VoiceEngineLifecycleState, ReadonlySet<VoiceEngineLifecycleState>>
> = Object.freeze({
  INITIALIZING: new Set<VoiceEngineLifecycleState>(['READY', 'FAILED', 'DESTROYED']),
  READY:        new Set<VoiceEngineLifecycleState>(['RUNNING', 'FAILED', 'DESTROYED']),
  RUNNING:      new Set<VoiceEngineLifecycleState>(['STOPPING', 'FAILED', 'DESTROYED']),
  STOPPING:     new Set<VoiceEngineLifecycleState>(['STOPPED', 'FAILED', 'DESTROYED']),
  STOPPED:      new Set<VoiceEngineLifecycleState>(['DESTROYED']),
  FAILED:       new Set<VoiceEngineLifecycleState>(['DESTROYED']),
  DESTROYED:    new Set<VoiceEngineLifecycleState>(),
});

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Thrown when an illegal lifecycle transition is attempted.
 */
export class LifecycleTransitionError extends Error {
  readonly from: VoiceEngineLifecycleState;
  readonly to: VoiceEngineLifecycleState;

  constructor(from: VoiceEngineLifecycleState, to: VoiceEngineLifecycleState) {
    super(
      `VoiceEngine: illegal lifecycle transition ${from} → ${to}. ` +
        `Valid targets from ${from}: [${Array.from(
          VALID_ENGINE_TRANSITIONS[from]
        ).join(', ')}]`
    );
    this.name = 'LifecycleTransitionError';
    this.from = from;
    this.to = to;
  }
}

// ─── Lifecycle Class ──────────────────────────────────────────────────────────

/**
 * Manages the lifecycle state machine of a single `VoiceEngine` instance.
 *
 * Call `transition(to)` to advance the state. Call the `assert*` helpers
 * to enforce pre-conditions before performing operations.
 */
export class VoiceEngineLifecycle {
  private _state: VoiceEngineLifecycleState;
  private _enteredAt: number;
  private readonly _history: Array<{
    readonly state: VoiceEngineLifecycleState;
    readonly enteredAt: number;
  }> = [];

  constructor(initialState: VoiceEngineLifecycleState = 'INITIALIZING') {
    this._state = initialState;
    this._enteredAt = Date.now();
  }

  // ─── Accessors ─────────────────────────────────────────────────────────────

  /** Current lifecycle state. */
  get state(): VoiceEngineLifecycleState {
    return this._state;
  }

  /** Monotonic timestamp when the engine entered the current state. */
  get enteredAt(): number {
    return this._enteredAt;
  }

  /** Elapsed milliseconds in the current state. */
  get elapsedMs(): number {
    return Date.now() - this._enteredAt;
  }

  /** Whether the engine is currently active and serving calls. */
  get isActive(): boolean {
    return ACTIVE_STATES.has(this._state);
  }

  /** Whether the engine has reached a terminal (non-recoverable) state. */
  get isTerminal(): boolean {
    return TERMINAL_STATES.has(this._state);
  }

  /** Whether the engine is destroyed and must not be used. */
  get isDestroyed(): boolean {
    return this._state === 'DESTROYED';
  }

  /** Ordered history of state transitions (oldest first). */
  get history(): ReadonlyArray<{ readonly state: VoiceEngineLifecycleState; readonly enteredAt: number }> {
    return this._history;
  }

  // ─── Transitions ───────────────────────────────────────────────────────────

  /**
   * Attempts to transition to the given target state.
   *
   * @param to - The target lifecycle state.
   * @throws {LifecycleTransitionError} if the transition is not allowed.
   */
  transition(to: VoiceEngineLifecycleState): void {
    if (!VALID_ENGINE_TRANSITIONS[this._state].has(to)) {
      throw new LifecycleTransitionError(this._state, to);
    }

    this._history.push({ state: this._state, enteredAt: this._enteredAt });
    this._state = to;
    this._enteredAt = Date.now();
  }

  /**
   * Attempts to transition to FAILED. Never throws, even if the current
   * state does not permit the transition (idempotent).
   *
   * @param reason - Human-readable failure reason for logging.
   * @returns `true` if the transition occurred; `false` if already terminal.
   */
  fail(reason?: string): boolean {
    if (this._state === 'FAILED' || this._state === 'DESTROYED') return false;
    if (!VALID_ENGINE_TRANSITIONS[this._state].has('FAILED')) return false;
    this.transition('FAILED');
    void reason; // consumed by caller for event emission
    return true;
  }

  /**
   * Transitions to DESTROYED. Safe to call from any state, including
   * FAILED and STOPPED.
   *
   * @returns `true` if the transition occurred; `false` if already DESTROYED.
   */
  destroy(): boolean {
    if (this._state === 'DESTROYED') return false;
    if (!VALID_ENGINE_TRANSITIONS[this._state].has('DESTROYED')) return false;
    this.transition('DESTROYED');
    return true;
  }

  // ─── Guards ────────────────────────────────────────────────────────────────

  /**
   * Asserts that the engine is in one of the given states.
   *
   * @param states  - Acceptable states.
   * @param context - Human-readable operation name for the error message.
   * @throws {Error} if the current state is not in the allowed set.
   */
  assertIn(states: readonly VoiceEngineLifecycleState[], context: string): void {
    if (!states.includes(this._state)) {
      throw new Error(
        `VoiceEngine.${context}(): expected state to be one of [${states.join(', ')}], ` +
          `but current state is ${this._state}.`
      );
    }
  }

  /**
   * Asserts that the engine has not been destroyed.
   *
   * @param context - Human-readable operation name for the error message.
   * @throws {Error} if the engine is DESTROYED.
   */
  assertNotDestroyed(context: string): void {
    if (this._state === 'DESTROYED') {
      throw new Error(
        `VoiceEngine.${context}(): engine has been destroyed and cannot be reused.`
      );
    }
  }
}
