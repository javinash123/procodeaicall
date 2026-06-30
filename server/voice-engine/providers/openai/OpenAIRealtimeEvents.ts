/**
 * @module OpenAIRealtimeEvents
 *
 * Strongly typed event models emitted by `OpenAIRealtimeSession`.
 *
 * ## Purpose
 * Provides a clean, provider-specific event surface that hides the raw
 * OpenAI WebSocket protocol from the rest of the Voice Engine. Consumers
 * subscribe to these events rather than parsing raw server events.
 *
 * ## Ownership
 * Consumed only within the `server/voice-engine/providers/openai/` module
 * and by the session owner (ConversationRuntime) via the session callbacks.
 *
 * ## Thread Safety
 * All event objects are value types — immutable once created.
 */

import type { Timestamp } from '../../types/index.js';
import type { RealtimeSessionResource, RateLimitResource, Tool } from './OpenAIRealtimeTypes.js';

interface BaseRealtimeEvent {
  readonly timestamp: Timestamp;
  /** The OpenAI event_id from the server, if present. */
  readonly eventId: string;
}

// ─── Connection ───────────────────────────────────────────────────────────────

/**
 * Emitted when the WebSocket handshake completes and the session is ready.
 */
export interface RealtimeConnectedEvent extends BaseRealtimeEvent {
  readonly type: 'realtime.connected';
  readonly sessionId: string;
  readonly model: string;
}

/**
 * Emitted when the WebSocket connection closes, for any reason.
 */
export interface RealtimeDisconnectedEvent extends BaseRealtimeEvent {
  readonly type: 'realtime.disconnected';
  readonly code: number;
  readonly reason: string;
  readonly wasClean: boolean;
}

// ─── Session ──────────────────────────────────────────────────────────────────

/**
 * Emitted when the session configuration is acknowledged by the server.
 */
export interface RealtimeSessionUpdatedEvent extends BaseRealtimeEvent {
  readonly type: 'realtime.session_updated';
  readonly session: Readonly<RealtimeSessionResource>;
}

// ─── Audio ────────────────────────────────────────────────────────────────────

/**
 * Emitted for each chunk of output audio received from the server.
 * `audio` is a base64-encoded PCM/G.711 chunk.
 */
export interface RealtimeAudioReceivedEvent extends BaseRealtimeEvent {
  readonly type: 'realtime.audio_received';
  readonly responseId: string;
  readonly itemId: string;
  readonly delta: string;
}

/**
 * Emitted when a full audio chunk has been committed to the input buffer.
 */
export interface RealtimeAudioSentEvent extends BaseRealtimeEvent {
  readonly type: 'realtime.audio_sent';
  readonly byteLength: number;
}

// ─── Transcription ────────────────────────────────────────────────────────────

/**
 * Emitted for each text delta of the assistant's audio transcript.
 */
export interface RealtimeTranscriptDeltaEvent extends BaseRealtimeEvent {
  readonly type: 'realtime.transcript_delta';
  readonly responseId: string;
  readonly itemId: string;
  readonly delta: string;
}

/**
 * Emitted when the full transcript of a response audio is complete.
 */
export interface RealtimeTranscriptCompletedEvent extends BaseRealtimeEvent {
  readonly type: 'realtime.transcript_completed';
  readonly responseId: string;
  readonly itemId: string;
  readonly transcript: string;
}

// ─── Response ─────────────────────────────────────────────────────────────────

/**
 * Emitted when the server begins generating a response.
 */
export interface RealtimeResponseStartedEvent extends BaseRealtimeEvent {
  readonly type: 'realtime.response_started';
  readonly responseId: string;
}

/**
 * Emitted for each text delta of a text-mode response.
 */
export interface RealtimeResponseDeltaEvent extends BaseRealtimeEvent {
  readonly type: 'realtime.response_delta';
  readonly responseId: string;
  readonly itemId: string;
  readonly delta: string;
}

/**
 * Emitted when a full response has been generated and the server is done.
 */
export interface RealtimeResponseCompletedEvent extends BaseRealtimeEvent {
  readonly type: 'realtime.response_completed';
  readonly responseId: string;
  readonly status: 'completed' | 'cancelled' | 'failed' | 'incomplete';
  readonly totalTokens: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

// ─── Tool Calls ───────────────────────────────────────────────────────────────

/**
 * Emitted when the model finishes generating function call arguments.
 */
export interface RealtimeToolCallEvent extends BaseRealtimeEvent {
  readonly type: 'realtime.tool_call';
  readonly responseId: string;
  readonly itemId: string;
  readonly callId: string;
  readonly functionName: string;
  readonly arguments: string;
}

/**
 * Emitted after the caller has submitted a function call result back to
 * the session via `submitToolResult()`.
 */
export interface RealtimeToolResultEvent extends BaseRealtimeEvent {
  readonly type: 'realtime.tool_result';
  readonly callId: string;
  readonly output: string;
}

// ─── Input VAD ────────────────────────────────────────────────────────────────

/**
 * Emitted when the server detects the start of speech in the input buffer.
 */
export interface RealtimeSpeechStartedEvent extends BaseRealtimeEvent {
  readonly type: 'realtime.speech_started';
  readonly itemId: string;
  readonly audioStartMs: number;
}

/**
 * Emitted when the server detects the end of speech in the input buffer.
 */
export interface RealtimeSpeechStoppedEvent extends BaseRealtimeEvent {
  readonly type: 'realtime.speech_stopped';
  readonly itemId: string;
  readonly audioEndMs: number;
}

// ─── Rate Limits ──────────────────────────────────────────────────────────────

/**
 * Emitted when the server updates rate limit information.
 */
export interface RealtimeRateLimitEvent extends BaseRealtimeEvent {
  readonly type: 'realtime.rate_limit';
  readonly rateLimits: readonly RateLimitResource[];
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Emitted when the OpenAI server sends an error event or a protocol error
 * occurs on the WebSocket.
 */
export interface RealtimeErrorEvent extends BaseRealtimeEvent {
  readonly type: 'realtime.error';
  readonly errorType: string;
  readonly errorCode?: string;
  readonly message: string;
  readonly fatal: boolean;
}

// ─── Union ────────────────────────────────────────────────────────────────────

export type RealtimeProviderEvent =
  | RealtimeConnectedEvent
  | RealtimeDisconnectedEvent
  | RealtimeSessionUpdatedEvent
  | RealtimeAudioReceivedEvent
  | RealtimeAudioSentEvent
  | RealtimeTranscriptDeltaEvent
  | RealtimeTranscriptCompletedEvent
  | RealtimeResponseStartedEvent
  | RealtimeResponseDeltaEvent
  | RealtimeResponseCompletedEvent
  | RealtimeToolCallEvent
  | RealtimeToolResultEvent
  | RealtimeSpeechStartedEvent
  | RealtimeSpeechStoppedEvent
  | RealtimeRateLimitEvent
  | RealtimeErrorEvent;

export type RealtimeProviderEventType = RealtimeProviderEvent['type'];
export type RealtimeProviderEventMap = { [E in RealtimeProviderEvent as E['type']]: E };
export type RealtimeEventHandler<T extends RealtimeProviderEvent = RealtimeProviderEvent> =
  (event: T) => void;
