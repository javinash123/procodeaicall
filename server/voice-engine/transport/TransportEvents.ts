/**
 * @module TransportEvents
 *
 * Strongly typed event definitions emitted by the Transport Layer.
 *
 * ## Purpose
 * Transport events are the single communication boundary between the raw
 * WebSocket/protocol world and the Media Session layer. Every inbound
 * protocol message is normalised into one of these events before any
 * media-layer code is invoked.
 *
 * ## Rules
 * - Events carry NO provider-specific fields (no Exotel, no OpenAI).
 * - Events are immutable value objects; subscribers must not mutate them.
 * - Events are emitted in strict chronological order within a session.
 *
 * ## Thread Safety
 * All events are frozen on construction. Safe to pass across async
 * boundaries without defensive copying.
 */

import type { Timestamp, CallSid, SessionId } from '../types/index.js';

// ─── Protocol / Connection Types ──────────────────────────────────────────────

/** Wire protocol used by this transport connection. */
export type TransportProtocol = 'websocket' | 'webhook';

/** Lifecycle state of a transport connection. */
export type TransportConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnecting'
  | 'disconnected'
  | 'failed';

// ─── Base ─────────────────────────────────────────────────────────────────────

/** Fields common to every transport event. */
interface BaseTransportEvent {
  /** Monotonic millisecond timestamp at the moment the event was created. */
  readonly timestamp: Timestamp;
  /** Unique session identifier for the call. */
  readonly sessionId: SessionId;
  /** Telephony call identifier. */
  readonly callSid: CallSid;
}

// ─── Connection Events ────────────────────────────────────────────────────────

/**
 * Emitted when the transport connection is fully established and ready
 * to exchange messages.
 */
export interface TransportConnectedEvent extends BaseTransportEvent {
  readonly type: 'transport.connected';
  /** Protocol used by this connection. */
  readonly protocol: TransportProtocol;
  /** Provider-agnostic stream identifier (e.g. Exotel streamSid). */
  readonly streamId: string;
  /** Human-readable description of the remote endpoint. */
  readonly remoteAddress: string;
}

/**
 * Emitted when the connection is closed — either gracefully or due to
 * a network error.
 */
export interface TransportDisconnectedEvent extends BaseTransportEvent {
  readonly type: 'transport.disconnected';
  /** WebSocket close code if applicable, otherwise 0. */
  readonly code: number;
  /** Human-readable reason for the disconnection. */
  readonly reason: string;
  /** Whether the disconnection was initiated locally (graceful). */
  readonly clean: boolean;
}

/**
 * Emitted when the transport is attempting to re-establish a dropped
 * connection.
 */
export interface TransportReconnectingEvent extends BaseTransportEvent {
  readonly type: 'transport.reconnecting';
  /** Zero-based attempt index. */
  readonly attempt: number;
  /** Milliseconds to wait before this attempt. */
  readonly backoffMs: number;
}

// ─── Audio Events ─────────────────────────────────────────────────────────────

/**
 * Emitted when an inbound audio payload arrives from the caller.
 *
 * The payload is always base64-encoded to avoid extra allocations in the
 * common WebSocket/JSON transport path.
 */
export interface TransportAudioReceivedEvent extends BaseTransportEvent {
  readonly type: 'transport.audio_received';
  /** Base64-encoded audio payload. */
  readonly base64Payload: string;
  /** Audio encoding (e.g. 'mulaw', 'pcm'). */
  readonly encoding: string;
  /** Sample rate in Hz. */
  readonly sampleRate: number;
  /** Monotonically increasing sequence number within this stream. */
  readonly sequence: number;
  /** Provider-agnostic track identifier. */
  readonly trackId: string;
}

// ─── DTMF Events ──────────────────────────────────────────────────────────────

/**
 * Emitted when a DTMF digit is received from the caller.
 */
export interface TransportDtmfReceivedEvent extends BaseTransportEvent {
  readonly type: 'transport.dtmf_received';
  /** The DTMF digit character (0–9, *, #, A–D). */
  readonly digit: string;
  /** Duration in milliseconds. */
  readonly durationMs: number;
}

// ─── Mark Events ──────────────────────────────────────────────────────────────

/**
 * Emitted when the provider acknowledges a previously sent mark.
 * Used to track playback progress and detect interruption points.
 */
export interface TransportMarkAcknowledgedEvent extends BaseTransportEvent {
  readonly type: 'transport.mark_acknowledged';
  /** The mark name that was acknowledged. */
  readonly name: string;
}

// ─── Heartbeat Events ─────────────────────────────────────────────────────────

/**
 * Emitted on each received heartbeat/ping from the remote end.
 */
export interface TransportHeartbeatEvent extends BaseTransportEvent {
  readonly type: 'transport.heartbeat';
  /** Round-trip latency in milliseconds if measurable, otherwise null. */
  readonly rttMs: number | null;
}

// ─── Error Events ─────────────────────────────────────────────────────────────

/**
 * Emitted when an unrecoverable transport error occurs.
 */
export interface TransportErrorEvent extends BaseTransportEvent {
  readonly type: 'transport.error';
  /** Machine-readable error code. */
  readonly errorCode: string;
  /** Human-readable error description. */
  readonly errorMessage: string;
  /** Whether the error is retryable. */
  readonly retryable: boolean;
}

// ─── Call Lifecycle Events ────────────────────────────────────────────────────

/**
 * Emitted when the provider signals that the call has ended (e.g. Exotel stop).
 */
export interface TransportCallEndedEvent extends BaseTransportEvent {
  readonly type: 'transport.call_ended';
  /** Human-readable reason (e.g. 'caller_hung_up', 'provider_stop'). */
  readonly reason: string;
}

// ─── Union & Helpers ──────────────────────────────────────────────────────────

/** Discriminated union of all transport events. */
export type TransportEvent =
  | TransportConnectedEvent
  | TransportDisconnectedEvent
  | TransportReconnectingEvent
  | TransportAudioReceivedEvent
  | TransportDtmfReceivedEvent
  | TransportMarkAcknowledgedEvent
  | TransportHeartbeatEvent
  | TransportErrorEvent
  | TransportCallEndedEvent;

/** Maps each event type literal to its concrete event interface. */
export type TransportEventMap = {
  [E in TransportEvent as E['type']]: E;
};

/** Union of all event type string literals. */
export type TransportEventType = TransportEvent['type'];

/** Handler signature for transport events. */
export type TransportEventHandler<T extends TransportEvent = TransportEvent> = (
  event: T
) => void;
