/**
 * @module MediaSessionEvents
 *
 * Strongly typed event definitions emitted by a `MediaSession`.
 *
 * ## Purpose
 * Events are value objects produced by `MediaSession` and consumed by
 * the surrounding orchestration layer (transport adapters, monitoring,
 * analytics). No module inside the media layer consumes its own events.
 *
 * ## Thread Safety
 * Events are immutable once constructed. Safe to pass across async
 * boundaries without copying.
 *
 * ## Ordering
 * Events are emitted in strict chronological order within a single
 * `MediaSession` instance. Subscribers must not mutate the event payload.
 */

import type { Timestamp, SessionId, CallSid } from '../types/index.js';
import type { MediaSessionState } from './MediaSessionState.js';

/**
 * Common fields carried by every media session event.
 */
interface BaseMediaEvent {
  /** Millisecond Unix timestamp at the moment the event was created. */
  readonly timestamp: Timestamp;
  /** Unique identifier of the session that emitted this event. */
  readonly sessionId: SessionId;
  /** The telephony call identifier bound to this session. */
  readonly callSid: CallSid;
}

// ─── Lifecycle Events ─────────────────────────────────────────────────────────

/**
 * Emitted immediately after a `MediaSession` is constructed and enters
 * the CREATED state.
 */
export interface MediaCreatedEvent extends BaseMediaEvent {
  readonly type: 'media.created';
  /** Campaign identifier associated with this session. */
  readonly campaignId: string;
}

/**
 * Emitted when all components (runtime, audio engine, orchestrator,
 * provider session) have connected successfully and the session enters
 * the READY state.
 */
export interface MediaReadyEvent extends BaseMediaEvent {
  readonly type: 'media.ready';
  /** Wall-clock milliseconds elapsed from CREATED to READY. */
  readonly initDurationMs: number;
}

/**
 * Emitted when the first conversational turn begins and the session
 * transitions from READY to ACTIVE.
 */
export interface MediaStartedEvent extends BaseMediaEvent {
  readonly type: 'media.started';
}

/**
 * Emitted when the session transitions from ACTIVE to PAUSED.
 */
export interface MediaPausedEvent extends BaseMediaEvent {
  readonly type: 'media.paused';
  /** Human-readable reason for the pause. */
  readonly reason: string;
}

/**
 * Emitted when the caller speaks during agent output, triggering a
 * barge-in. The session enters the INTERRUPTED state momentarily
 * before returning to ACTIVE.
 */
export interface MediaInterruptedEvent extends BaseMediaEvent {
  readonly type: 'media.interrupted';
  /** Zero-based turn index at which the interruption occurred. */
  readonly turnIndex: number;
  /** Milliseconds of agent audio played before the interruption. */
  readonly agentAudioOffsetMs: number;
}

/**
 * Emitted when the session enters the COMPLETED state and all
 * resources have been flushed gracefully.
 */
export interface MediaCompletedEvent extends BaseMediaEvent {
  readonly type: 'media.completed';
  /** Total number of completed conversational turns. */
  readonly totalTurns: number;
  /** Total wall-clock duration of the conversation in milliseconds. */
  readonly durationMs: number;
  /** Human-readable completion reason (e.g. "goal_reached", "caller_hung_up"). */
  readonly completionReason: string;
}

/**
 * Emitted when the session enters the DESTROYED state and all
 * resources have been released.
 */
export interface MediaDestroyedEvent extends BaseMediaEvent {
  readonly type: 'media.destroyed';
  /** The state the session occupied immediately before being destroyed. */
  readonly destroyedFromState: MediaSessionState;
}

/**
 * Emitted when the session encounters an unrecoverable error and
 * transitions to the FAILED state.
 */
export interface MediaErrorEvent extends BaseMediaEvent {
  readonly type: 'media.error';
  /** Machine-readable error code. */
  readonly errorCode: string;
  /** Human-readable error description. */
  readonly errorMessage: string;
  /** The state the session occupied when the error occurred. */
  readonly failedInState: MediaSessionState;
  /** Whether the originating error was thrown by a provider component. */
  readonly providerError: boolean;
}

// ─── Union & Helpers ──────────────────────────────────────────────────────────

/**
 * Discriminated union of every event a `MediaSession` can emit.
 */
export type MediaEvent =
  | MediaCreatedEvent
  | MediaReadyEvent
  | MediaStartedEvent
  | MediaPausedEvent
  | MediaInterruptedEvent
  | MediaCompletedEvent
  | MediaDestroyedEvent
  | MediaErrorEvent;

/** Maps each event type literal to its concrete event interface. */
export type MediaEventMap = {
  [E in MediaEvent as E['type']]: E;
};

/** Union of all event type string literals. */
export type MediaEventType = MediaEvent['type'];

/** Handler signature for a typed media event. */
export type MediaEventHandler<T extends MediaEvent = MediaEvent> = (
  event: T
) => void;
