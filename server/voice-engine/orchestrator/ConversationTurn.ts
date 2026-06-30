/**
 * @module ConversationTurn
 *
 * An immutable record of one request–response exchange within a live call.
 *
 * ## Purpose
 * `ConversationTurn` captures the complete lifecycle of a single turn:
 * who spoke, what was said, what the response was, all latency measurements,
 * and whether the turn was interrupted. It is append-only — completed turns
 * are never modified.
 *
 * ## Ownership
 * Turns are created by the `ConversationOrchestrator` and stored in
 * `ConversationContext.history`. They are not persisted by this module.
 *
 * ## Thread Safety
 * All public properties are readonly. The builder pattern produces a new
 * sealed object at each step; no in-place mutation occurs.
 */

import type { Timestamp, Nullable } from '../types/index.js';
import { TurnState } from './TurnState.js';

/**
 * Latency breakdown recorded at turn completion.
 */
export interface TurnLatency {
  /** Milliseconds from turn creation to first audio chunk received. */
  readonly listenStartMs: Nullable<number>;
  /** Milliseconds from utterance end to LLM request dispatch. */
  readonly sttLatencyMs: Nullable<number>;
  /** Milliseconds from LLM request to first response token. */
  readonly llmLatencyMs: Nullable<number>;
  /** Milliseconds from first LLM token to first audio chunk sent. */
  readonly ttsLatencyMs: Nullable<number>;
  /** Total wall-clock duration of the turn (CREATED → terminal state). */
  readonly totalMs: Nullable<number>;
}

/**
 * Recorded interruption within a turn.
 */
export interface TurnInterruption {
  /** Timestamp when the barge-in was detected. */
  readonly detectedAt: Timestamp;
  /** Milliseconds into the response at which the interruption occurred. */
  readonly responseOffsetMs: number;
}

/**
 * Immutable record of a single conversational exchange.
 */
export interface ConversationTurn {
  /** Unique identifier for this turn (UUID-like string). */
  readonly turnId: string;
  /** Zero-based index within the conversation. */
  readonly turnIndex: number;
  /** Who initiated this turn. */
  readonly speaker: 'user' | 'system';
  /** Current lifecycle state of this turn. */
  readonly state: TurnState;
  /** Timestamp when this turn was created. */
  readonly createdAt: Timestamp;
  /** Timestamp when the utterance recording started, or null if not yet begun. */
  readonly listeningStartedAt: Nullable<Timestamp>;
  /** Timestamp when the utterance was committed for processing. */
  readonly utteranceCommittedAt: Nullable<Timestamp>;
  /** Timestamp when the response started streaming to the caller. */
  readonly responseStartedAt: Nullable<Timestamp>;
  /** Timestamp when this turn reached a terminal state. */
  readonly completedAt: Nullable<Timestamp>;
  /** The final caller transcript for this turn, or null if not yet available. */
  readonly transcript: Nullable<string>;
  /** The assistant's response text, or null if not yet generated. */
  readonly response: Nullable<string>;
  /** Latency measurements, populated progressively as the turn advances. */
  readonly latency: TurnLatency;
  /** Interruption events that occurred during this turn. */
  readonly interruptions: readonly TurnInterruption[];
  /** Number of retry attempts made for this turn due to transient errors. */
  readonly retryCount: number;
  /** Error message if the turn reached the FAILED state. */
  readonly failureReason: Nullable<string>;
}

/**
 * Creates a new turn in the CREATED state.
 */
export function createTurn(
  turnId: string,
  turnIndex: number,
  speaker: 'user' | 'system',
  now: Timestamp
): ConversationTurn {
  return Object.freeze<ConversationTurn>({
    turnId,
    turnIndex,
    speaker,
    state: TurnState.CREATED,
    createdAt: now,
    listeningStartedAt: null,
    utteranceCommittedAt: null,
    responseStartedAt: null,
    completedAt: null,
    transcript: null,
    response: null,
    latency: Object.freeze<TurnLatency>({
      listenStartMs: null,
      sttLatencyMs: null,
      llmLatencyMs: null,
      ttsLatencyMs: null,
      totalMs: null,
    }),
    interruptions: Object.freeze([]),
    retryCount: 0,
    failureReason: null,
  });
}

/**
 * Produces a new `ConversationTurn` with the applied patch merged in.
 * The original turn is never modified.
 */
export function patchTurn(
  turn: ConversationTurn,
  patch: Partial<Omit<ConversationTurn, 'turnId' | 'turnIndex' | 'createdAt'>>
): ConversationTurn {
  return Object.freeze<ConversationTurn>({
    ...turn,
    ...patch,
    latency: Object.freeze({ ...turn.latency, ...patch.latency }),
    interruptions: patch.interruptions
      ? Object.freeze([...patch.interruptions])
      : turn.interruptions,
  });
}

/**
 * Returns a new turn with one additional interruption appended.
 */
export function recordInterruption(
  turn: ConversationTurn,
  interruption: TurnInterruption
): ConversationTurn {
  return patchTurn(turn, {
    state: TurnState.INTERRUPTED,
    interruptions: [...turn.interruptions, interruption],
  });
}

/**
 * Returns a new turn sealed as COMPLETED with full latency data.
 */
export function completeTurn(
  turn: ConversationTurn,
  response: string,
  now: Timestamp
): ConversationTurn {
  const totalMs = now - turn.createdAt;
  return patchTurn(turn, {
    state: TurnState.COMPLETED,
    response,
    completedAt: now,
    latency: { ...turn.latency, totalMs },
  });
}

/**
 * Returns a new turn sealed as FAILED with a reason.
 */
export function failTurn(
  turn: ConversationTurn,
  reason: string,
  now: Timestamp
): ConversationTurn {
  return patchTurn(turn, {
    state: TurnState.FAILED,
    failureReason: reason,
    completedAt: now,
    latency: { ...turn.latency, totalMs: now - turn.createdAt },
  });
}
