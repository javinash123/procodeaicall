/**
 * @module TransportSession
 *
 * Represents ONE live phone call at the transport layer.
 *
 * ## Purpose
 * `TransportSession` is a pure data container. It tracks all transport-level
 * state for a single call: connection state, sequence numbers, heartbeat
 * timing, stream identity, and transport metadata.
 *
 * It contains NO business logic, NO provider logic, NO media processing,
 * and NO references to the AI or audio pipeline. It is intentionally minimal
 * so that the `TransportGateway` can manage thousands of concurrent sessions
 * with negligible per-session overhead.
 *
 * ## Ownership
 * One `TransportSession` is created by `TransportGateway` when a new WebSocket
 * connection arrives. It is destroyed when the connection closes.
 *
 * ## Thread Safety
 * `TransportSession` is mutated only by `TransportGateway` and `TransportConnection`.
 * Both operate on a single Node.js event-loop thread, so no locking is needed.
 */

import type { CallSid, SessionId, Timestamp, Nullable } from '../types/index.js';
import type { TransportConnectionState, TransportProtocol } from './TransportEvents.js';

/**
 * Transport-layer metadata describing the remote endpoint for this call.
 */
export interface TransportSessionMetadata {
  /** IP address or hostname of the remote telephony endpoint. */
  readonly remoteAddress: string;
  /** Protocol used for this connection. */
  readonly protocol: TransportProtocol;
  /** Provider-specific stream identifier (e.g. Exotel streamSid). */
  readonly streamId: string;
  /** Wall-clock timestamp when the connection was first accepted. */
  readonly connectedAt: Timestamp;
  /** Name of the adapter that handles this session's protocol. */
  readonly adapterName: string;
}

/**
 * Mutable heartbeat tracking state for a `TransportSession`.
 */
export interface HeartbeatState {
  /** Timestamp of the last ping sent. */
  lastPingSentAt: Nullable<Timestamp>;
  /** Timestamp of the last pong received. */
  lastPongReceivedAt: Nullable<Timestamp>;
  /** Number of consecutive unanswered pings. */
  missedPings: number;
  /** Most recently measured round-trip latency in milliseconds. */
  latestRttMs: Nullable<number>;
}

/**
 * Immutable identity fields for a `TransportSession`.
 */
export interface TransportSessionId {
  /** Unique session identifier shared with the media layer. */
  readonly sessionId: SessionId;
  /** Telephony call identifier from the provider. */
  readonly callSid: CallSid;
}

/**
 * The complete state of one live transport session.
 *
 * Fields that change during the call (state, sequence, heartbeat) are
 * mutable. Identity and metadata fields are frozen at construction.
 */
export class TransportSession {
  /** Immutable identity. */
  readonly id: Readonly<TransportSessionId>;

  /** Immutable transport metadata. */
  readonly metadata: Readonly<TransportSessionMetadata>;

  /** Current connection lifecycle state. */
  connectionState: TransportConnectionState;

  /**
   * Monotonically increasing counter for inbound messages.
   * Incremented on each received media frame for gap detection.
   */
  inboundSequence: number;

  /**
   * Monotonically increasing counter for outbound messages.
   * Incremented on each sent media frame.
   */
  outboundSequence: number;

  /** Mutable heartbeat tracking. */
  readonly heartbeat: HeartbeatState;

  /** Timestamp of the last inbound message (any type). */
  lastActivityAt: Timestamp;

  /** Whether this session has been torn down. */
  destroyed: boolean;

  constructor(
    id: TransportSessionId,
    metadata: TransportSessionMetadata,
    now: Timestamp
  ) {
    this.id = Object.freeze({ ...id });
    this.metadata = Object.freeze({ ...metadata });
    this.connectionState = 'connecting';
    this.inboundSequence = 0;
    this.outboundSequence = 0;
    this.heartbeat = {
      lastPingSentAt: null,
      lastPongReceivedAt: null,
      missedPings: 0,
      latestRttMs: null,
    };
    this.lastActivityAt = now;
    this.destroyed = false;
  }

  /**
   * Returns `true` if the session is in a state that can accept inbound
   * messages and process outbound sends.
   */
  get isActive(): boolean {
    return (
      !this.destroyed &&
      (this.connectionState === 'connected' ||
        this.connectionState === 'reconnecting')
    );
  }

  /**
   * Records a ping being sent. Updates heartbeat state.
   *
   * @param now - Current monotonic timestamp.
   */
  recordPingSent(now: Timestamp): void {
    this.heartbeat.lastPingSentAt = now;
    this.heartbeat.missedPings += 1;
  }

  /**
   * Records a pong being received. Resets missed-ping counter and
   * computes RTT if a matching ping timestamp is available.
   *
   * @param now - Current monotonic timestamp.
   */
  recordPongReceived(now: Timestamp): void {
    this.heartbeat.lastPongReceivedAt = now;
    if (this.heartbeat.lastPingSentAt !== null) {
      this.heartbeat.latestRttMs = now - this.heartbeat.lastPingSentAt;
    }
    this.heartbeat.missedPings = 0;
    this.lastActivityAt = now;
  }

  /**
   * Advances the inbound sequence counter and updates `lastActivityAt`.
   *
   * @param now - Current monotonic timestamp.
   * @returns The new inbound sequence number.
   */
  nextInboundSequence(now: Timestamp): number {
    this.lastActivityAt = now;
    return ++this.inboundSequence;
  }

  /**
   * Advances the outbound sequence counter.
   *
   * @returns The new outbound sequence number.
   */
  nextOutboundSequence(): number {
    return ++this.outboundSequence;
  }

  /**
   * Marks the session as destroyed. Idempotent.
   */
  markDestroyed(): void {
    this.destroyed = true;
    this.connectionState = 'disconnected';
  }
}

/**
 * Factory function for `TransportSession`.
 *
 * @param id       - Identity fields (sessionId, callSid).
 * @param metadata - Transport metadata (remoteAddress, protocol, etc.).
 * @param now      - Wall-clock millisecond timestamp.
 */
export function createTransportSession(
  id: TransportSessionId,
  metadata: TransportSessionMetadata,
  now: Timestamp
): TransportSession {
  return new TransportSession(id, metadata, now);
}
