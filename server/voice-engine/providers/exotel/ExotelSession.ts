/**
 * @module ExotelSession
 *
 * Represents one live Exotel WebSocket call session at the provider layer.
 *
 * ## Purpose
 * `ExotelSession` groups together the `TransportSession` (transport-layer
 * state) and the `ExotelAdapter` (protocol knowledge) for a single Exotel
 * call. It is the object handed to higher-level code that needs to interact
 * with an ongoing Exotel call.
 *
 * ## Responsibilities
 * - Hold a reference to the transport session for this call.
 * - Expose convenience methods for sending outbound audio, marks, and clears
 *   through the gateway without the caller needing to know the gateway's API.
 * - Track the Exotel-specific stream SID.
 *
 * ## Rules
 * - No AI logic.
 * - No OpenAI imports.
 * - No MediaSession imports.
 * - No business logic.
 *
 * ## Lifecycle
 * Created by `ExotelFactory`. Destroyed when the WebSocket closes.
 */

import type { TransportSession } from '../../transport/TransportSession.js';
import type { ITransportGateway } from '../../transport/TransportGateway.js';
import type { AudioChunk } from '../../audio-engine/AudioChunk.js';
import type { SessionId, Timestamp } from '../../types/index.js';

/**
 * Snapshot of the current Exotel session state, suitable for monitoring
 * and logging.
 */
export interface ExotelSessionSnapshot {
  readonly sessionId: SessionId;
  readonly callSid: string;
  readonly streamSid: string;
  readonly remoteAddress: string;
  readonly connectionState: string;
  readonly inboundSequence: number;
  readonly outboundSequence: number;
  readonly lastActivityAt: Timestamp;
  readonly heartbeat: {
    readonly missedPings: number;
    readonly latestRttMs: number | null;
  };
}

/**
 * Public contract for a live Exotel session.
 */
export interface IExotelSession {
  /** Unique session identifier shared with the media layer. */
  readonly sessionId: SessionId;

  /** Telephony call SID. */
  readonly callSid: string;

  /** Exotel stream SID (populated after the 'start' message arrives). */
  readonly streamSid: string;

  /** Whether the underlying transport connection is open and writable. */
  readonly isConnected: boolean;

  /**
   * Sends an outbound audio chunk to the caller via Exotel.
   *
   * @param chunk    - Audio chunk to transmit.
   * @param markName - Optional mark name appended after the audio frame.
   */
  sendAudio(chunk: AudioChunk, markName?: string): void;

  /**
   * Sends a `clear` message to flush Exotel's outbound audio buffer.
   * Called on barge-in before queuing new audio.
   */
  sendClear(): void;

  /**
   * Returns a point-in-time snapshot of this session's state.
   */
  getSnapshot(): Readonly<ExotelSessionSnapshot>;

  /**
   * Gracefully closes the underlying WebSocket connection.
   *
   * @param reason - Human-readable close reason.
   */
  close(reason?: string): Promise<void>;

  /**
   * Immediately destroys the session without a graceful handshake.
   */
  destroy(): void;
}

/**
 * Production implementation of `IExotelSession`.
 */
export class ExotelSession implements IExotelSession {
  private readonly _transportSession: TransportSession;
  private readonly _gateway: ITransportGateway;
  private _destroyed = false;

  constructor(
    transportSession: TransportSession,
    gateway: ITransportGateway
  ) {
    this._transportSession = transportSession;
    this._gateway = gateway;
  }

  // ─── Accessors ──────────────────────────────────────────────────────────────

  get sessionId(): SessionId {
    return this._transportSession.id.sessionId;
  }

  get callSid(): string {
    return this._transportSession.id.callSid;
  }

  get streamSid(): string {
    return this._transportSession.metadata.streamId;
  }

  get isConnected(): boolean {
    return !this._destroyed && this._transportSession.isActive;
  }

  // ─── Outbound ──────────────────────────────────────────────────────────────

  sendAudio(chunk: AudioChunk, markName?: string): void {
    if (this._destroyed) return;
    this._gateway.sendAudio(this.sessionId, chunk, markName);
  }

  sendClear(): void {
    if (this._destroyed) return;
    this._gateway.sendClear(this.sessionId);
  }

  // ─── Snapshot ──────────────────────────────────────────────────────────────

  getSnapshot(): Readonly<ExotelSessionSnapshot> {
    const s = this._transportSession;
    return Object.freeze<ExotelSessionSnapshot>({
      sessionId: s.id.sessionId,
      callSid: s.id.callSid,
      streamSid: s.metadata.streamId,
      remoteAddress: s.metadata.remoteAddress,
      connectionState: s.connectionState,
      inboundSequence: s.inboundSequence,
      outboundSequence: s.outboundSequence,
      lastActivityAt: s.lastActivityAt,
      heartbeat: {
        missedPings: s.heartbeat.missedPings,
        latestRttMs: s.heartbeat.latestRttMs,
      },
    });
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async close(reason = 'requested'): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;
    await this._gateway.close(this.sessionId, reason);
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._gateway.disconnect(this.sessionId);
  }
}
