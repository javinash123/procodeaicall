/**
 * @module RuntimeTimers
 *
 * Timer interfaces used by a `ConversationRuntime` to enforce time-based
 * conversation policies without any concrete scheduling logic.
 *
 * ## Ownership
 * Timer instances are created and owned by the runtime factory.
 * The runtime holds references through these interfaces only — it never
 * owns or allocates OS-level timer resources directly.
 *
 * ## Thread Safety
 * All timer methods are intended to be called from the same async context
 * as the runtime. External cancellation is safe but must be followed by
 * a call to `reset()` or `cancel()` before the runtime transitions state.
 *
 * ## Lifecycle
 * Each timer is started, reset, and cancelled in strict coordination with
 * state transitions. A timer MUST be cancelled before `destroy()` is called
 * on the runtime.
 */

import type { Timestamp } from '../types/index.js';

/**
 * A cancellable, resettable one-shot or repeating timer handle.
 * Concrete implementations must not use `setTimeout` directly inside
 * the runtime layer — scheduling is owned by the factory/infrastructure.
 */
export interface TimerHandle {
  /** Whether this timer is currently active (started and not yet fired or cancelled). */
  readonly isActive: boolean;
  /** The UTC timestamp at which this timer was last started, or null if never started. */
  readonly startedAt: Timestamp | null;
  /** Cancels the timer. Safe to call even if the timer is not active. */
  cancel(): void;
  /** Resets the timer to its configured duration without changing the callback. */
  reset(): void;
}

/**
 * Monitors caller silence after the runtime enters LISTENING state.
 *
 * If the caller does not speak within `thresholdMs`, the runtime should
 * transition from LISTENING → WAITING so a re-engagement prompt can be sent.
 *
 * ## Lifecycle
 * - Started: on entry to LISTENING state.
 * - Reset: each time a non-silent audio chunk is received.
 * - Cancelled: on exit from LISTENING state (to THINKING or any terminal state).
 */
export interface SilenceTimer extends TimerHandle {
  /** Duration of silence in milliseconds that triggers the timeout callback. */
  readonly thresholdMs: number;
  /** Callback invoked when silence threshold is exceeded. */
  readonly onSilenceTimeout: () => void;
}

/**
 * Guards the maximum duration a TTS speech turn is allowed to run.
 *
 * If the TTS stream has not completed within `maxDurationMs`, the runtime
 * must abort the speech and transition to INTERRUPTED or COMPLETED.
 *
 * ## Lifecycle
 * - Started: on entry to SPEAKING state.
 * - Cancelled: when TTS stream completes normally, or when a barge-in occurs.
 */
export interface SpeechTimeoutTimer extends TimerHandle {
  /** Maximum milliseconds a single speech turn may last. */
  readonly maxDurationMs: number;
  /** Callback invoked when the speech timeout fires. */
  readonly onSpeechTimeout: () => void;
}

/**
 * Guards the maximum duration the LLM is allowed to produce a response.
 *
 * If the LLM has not completed within `maxDurationMs`, the runtime must
 * abort the LLM call, transition to FAILED or LISTENING with an error prompt.
 *
 * ## Lifecycle
 * - Started: on entry to THINKING state.
 * - Cancelled: when the LLM response is received or an error occurs.
 */
export interface ThinkingTimeoutTimer extends TimerHandle {
  /** Maximum milliseconds the LLM may take to return a complete response. */
  readonly maxDurationMs: number;
  /** Callback invoked when the thinking timeout fires. */
  readonly onThinkingTimeout: () => void;
}

/**
 * Enforces the maximum wall-clock duration for the entire conversation session.
 *
 * When this timer fires, the runtime must gracefully complete or forcibly close
 * the session, regardless of current state.
 *
 * ## Lifecycle
 * - Started: on entry to CONNECTED state.
 * - Cancelled: on entry to COMPLETED, FAILED, or CLOSED state.
 */
export interface SessionTimeoutTimer extends TimerHandle {
  /** Maximum session duration in milliseconds. */
  readonly maxDurationMs: number;
  /** Callback invoked when the session wall-clock timeout fires. */
  readonly onSessionTimeout: () => void;
}

/**
 * Sends periodic keep-alive signals over the transport to prevent proxy
 * or NAT timeouts from silently dropping the connection.
 *
 * ## Lifecycle
 * - Started: on entry to CONNECTED state.
 * - Cancelled: on exit from CONNECTED state or any terminal state.
 */
export interface HeartbeatTimer extends TimerHandle {
  /** Interval in milliseconds between heartbeat pulses. */
  readonly intervalMs: number;
  /** Callback invoked on each heartbeat tick. */
  readonly onHeartbeat: () => void;
}

/**
 * Aggregated container of all timers managed by a single runtime instance.
 */
export interface RuntimeTimers {
  readonly silence: SilenceTimer;
  readonly speech: SpeechTimeoutTimer;
  readonly thinking: ThinkingTimeoutTimer;
  readonly session: SessionTimeoutTimer;
  readonly heartbeat: HeartbeatTimer;
}
