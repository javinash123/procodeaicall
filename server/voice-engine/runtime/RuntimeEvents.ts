/**
 * @module RuntimeEvents
 *
 * Strongly typed event definitions emitted by a `ConversationRuntime`.
 *
 * ## Ownership
 * Events are produced by `ConversationRuntime` and consumed by the surrounding
 * orchestration layer (call coordinator, monitoring, analytics). No module
 * inside the runtime consumes its own events.
 *
 * ## Thread Safety
 * Events are value objects — immutable once constructed. Safe to pass across
 * async boundaries without copying.
 *
 * ## Lifecycle
 * Events are emitted in strict chronological order within a single runtime
 * instance. Subscribers must not mutate the event payload.
 */

import type { Timestamp, SessionId, CallSid } from '../types/index.js';
import type { RuntimeState } from './RuntimeState.js';

/**
 * Common fields carried by every runtime event.
 */
interface BaseRuntimeEvent {
  /** Millisecond Unix timestamp of when the event was created. */
  readonly timestamp: Timestamp;
  /** The session this runtime is managing. */
  readonly sessionId: SessionId;
  /** The telephony call identifier bound to this runtime. */
  readonly callSid: CallSid;
}

/**
 * Emitted immediately after a `ConversationRuntime` instance is constructed
 * and enters the CREATED state.
 */
export interface RuntimeCreatedEvent extends BaseRuntimeEvent {
  readonly type: 'runtime.created';
  readonly campaignId: string;
}

/**
 * Emitted when the transport is fully established and the runtime enters
 * the CONNECTED state, ready to start the conversation.
 */
export interface RuntimeConnectedEvent extends BaseRuntimeEvent {
  readonly type: 'runtime.connected';
  readonly transportProtocol: string;
}

/**
 * Emitted each time the runtime enters the LISTENING state and begins
 * capturing caller audio via STT.
 */
export interface RuntimeListeningEvent extends BaseRuntimeEvent {
  readonly type: 'runtime.listening';
  /** Zero-based index of the current conversational turn. */
  readonly turnIndex: number;
}

/**
 * Emitted when the runtime enters the THINKING state.
 * The caller's utterance has been transcribed and the LLM request is in-flight.
 */
export interface RuntimeThinkingEvent extends BaseRuntimeEvent {
  readonly type: 'runtime.thinking';
  readonly turnIndex: number;
  /** The final transcript that triggered this thinking phase. */
  readonly transcript: string;
  /** Milliseconds elapsed from utterance end to LLM request dispatch. */
  readonly sttLatencyMs: number;
}

/**
 * Emitted when the runtime enters the SPEAKING state.
 * TTS audio is now streaming to the caller.
 */
export interface RuntimeSpeakingEvent extends BaseRuntimeEvent {
  readonly type: 'runtime.speaking';
  readonly turnIndex: number;
  /** Character count of the text being synthesised. */
  readonly textLength: number;
  /** The voice identifier used for synthesis. */
  readonly voice: string;
  /** Milliseconds elapsed from LLM response completion to TTS stream start. */
  readonly ttsLatencyMs: number;
}

/**
 * Emitted when the caller speaks while the runtime is in SPEAKING state,
 * triggering a barge-in and entering the INTERRUPTED state.
 */
export interface RuntimeInterruptedEvent extends BaseRuntimeEvent {
  readonly type: 'runtime.interrupted';
  readonly turnIndex: number;
  /** Milliseconds into the TTS stream at which the interruption occurred. */
  readonly interruptedAtMs: number;
}

/**
 * Emitted when the conversation ends gracefully and the runtime enters
 * the COMPLETED state.
 */
export interface RuntimeCompletedEvent extends BaseRuntimeEvent {
  readonly type: 'runtime.completed';
  /** Total number of completed conversational turns. */
  readonly totalTurns: number;
  /** Total wall-clock duration of the conversation in milliseconds. */
  readonly durationMs: number;
  /** Human-readable reason for completion (e.g. "goal_reached", "max_turns"). */
  readonly completionReason: string;
}

/**
 * Emitted when the runtime enters the CLOSED state and all resources
 * have been released.
 */
export interface RuntimeClosedEvent extends BaseRuntimeEvent {
  readonly type: 'runtime.closed';
  /** The state the runtime was in immediately before closing. */
  readonly closedFromState: RuntimeState;
}

/**
 * Emitted when the runtime encounters an unrecoverable error and enters
 * the FAILED state.
 */
export interface RuntimeErrorEvent extends BaseRuntimeEvent {
  readonly type: 'runtime.error';
  readonly errorCode: string;
  readonly errorMessage: string;
  /** The state the runtime occupied when the error occurred. */
  readonly failedInState: RuntimeState;
  /** Whether the error originated in a provider (STT/LLM/TTS/telephony). */
  readonly providerError: boolean;
}

/**
 * Discriminated union of all events emitted by a `ConversationRuntime`.
 */
export type RuntimeEvent =
  | RuntimeCreatedEvent
  | RuntimeConnectedEvent
  | RuntimeListeningEvent
  | RuntimeThinkingEvent
  | RuntimeSpeakingEvent
  | RuntimeInterruptedEvent
  | RuntimeCompletedEvent
  | RuntimeClosedEvent
  | RuntimeErrorEvent;

/** Maps each event type literal to its concrete event interface. */
export type RuntimeEventMap = {
  [E in RuntimeEvent as E['type']]: E;
};

export type RuntimeEventType = RuntimeEvent['type'];
export type RuntimeEventHandler<T extends RuntimeEvent = RuntimeEvent> = (event: T) => void;
