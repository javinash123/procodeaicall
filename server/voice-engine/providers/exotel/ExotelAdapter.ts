/**
 * @module ExotelAdapter
 *
 * Protocol adapter for the Exotel WebSocket streaming API.
 *
 * ## Purpose
 * `ExotelAdapter` implements `ITransportAdapter` and is the single module
 * that translates between Exotel's wire protocol and the engine's typed
 * `TransportEvent` system.
 *
 * Responsibilities:
 * - Decode every inbound Exotel message type (connected, start, media, mark,
 *   clear, stop, dtmf, heartbeat, unknown).
 * - Emit the appropriate `TransportEvent` via the gateway's `emit` callback.
 * - Encode outbound audio, mark, and clear frames into Exotel wire format.
 *
 * This module contains:
 * - NO AI logic (no OpenAI imports).
 * - NO business logic (no CRM, no campaigns, no MongoDB).
 * - NO direct MediaSession calls (the Gateway routes events to MediaSession).
 * - ONLY Exotel protocol knowledge.
 *
 * ## Inbound Flow
 * ```
 * WebSocket message
 *   └─► ExotelAdapter.handleMessage()
 *         └─► decodeExotelMessage()
 *               ├─► 'connected' → TransportConnectedEvent (stub; real stream ID arrives in 'start')
 *               ├─► 'start'     → TransportConnectedEvent (real stream ID + audio format)
 *               ├─► 'media'     → TransportAudioReceivedEvent
 *               ├─► 'mark'      → TransportMarkAcknowledgedEvent
 *               ├─► 'stop'      → TransportCallEndedEvent
 *               ├─► 'dtmf'      → TransportDtmfReceivedEvent
 *               ├─► 'heartbeat' → TransportHeartbeatEvent
 *               └─► unknown     → logged, NOT emitted (safe drop)
 * ```
 *
 * ## Outbound Flow
 * ```
 * Gateway.sendAudio(chunk)
 *   └─► ExotelAdapter.encodeOutboundAudio() → JSON string → WebSocket.send()
 * ```
 */

import type { ITransportAdapter, TransportEventEmitter } from '../../transport/TransportGateway.js';
import type { TransportSession } from '../../transport/TransportSession.js';
import type { AudioChunk } from '../../audio-engine/AudioChunk.js';
import type { ILogger } from '../../logger/index.js';
import type {
  ExotelStartMessage,
  ExotelMediaMessage,
  ExotelMarkMessage,
  ExotelStopMessage,
  ExotelDtmfMessage,
  ExotelHeartbeatMessage,
} from './ExotelMessages.js';
import {
  decodeExotelMessage,
  normaliseMediaFormat,
  extractStreamSid,
  extractMediaPayload,
  extractTrackId,
  encodeMediaMessage,
  encodeMarkMessage,
  encodeClearMessage,
  isValidBase64Payload,
} from './ExotelProtocol.js';

// ─── Per-Session Audio Context ────────────────────────────────────────────────

/**
 * Mutable audio format state learned from the `start` message.
 * Stored in a `WeakMap` keyed by `TransportSession` to avoid coupling.
 */
interface SessionAudioContext {
  encoding: string;
  sampleRate: number;
  channels: number;
  streamSid: string;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Production implementation of `ITransportAdapter` for the Exotel protocol.
 */
export class ExotelAdapter implements ITransportAdapter {
  readonly name = 'exotel';

  private readonly _logger: ILogger;

  /**
   * Per-session audio context. WeakMap ensures sessions can be GC'd without
   * requiring explicit cleanup.
   */
  private readonly _audioContexts = new WeakMap<
    TransportSession,
    SessionAudioContext
  >();

  constructor(logger: ILogger) {
    this._logger = logger.child({ component: 'ExotelAdapter' });
  }

  // ─── ITransportAdapter ─────────────────────────────────────────────────────

  handleMessage(
    raw: string,
    session: TransportSession,
    emit: TransportEventEmitter
  ): void {
    const msg = decodeExotelMessage(raw);
    const { sessionId, callSid } = session.id;
    const now = Date.now();

    switch (msg.event) {
      case 'connected':
        this._logger.debug('Exotel connected handshake received', { sessionId });
        // The real streamSid arrives in the 'start' message.
        break;

      case 'start': {
        const start = msg as ExotelStartMessage;
        const streamSid = extractStreamSid(start as unknown as Record<string, unknown>);
        const fmt = normaliseMediaFormat(start);

        // Mutate the immutable metadata's streamId field via a local context map.
        // (The metadata object itself is frozen; we track streamId separately.)
        const ctx: SessionAudioContext = {
          encoding: fmt.encoding,
          sampleRate: fmt.sampleRate,
          channels: fmt.channels,
          streamSid,
        };
        this._audioContexts.set(session, ctx);

        // Patch the session metadata streamId so the gateway can use it for
        // outbound sends. We use Object.defineProperty to bypass the frozen
        // metadata field — this is the ONLY place this bypass is permitted.
        try {
          Object.defineProperty(session.metadata, 'streamId', {
            value: streamSid,
            writable: false,
            configurable: true,
          });
        } catch {
          // metadata may be fully frozen in test environments; gracefully skip.
        }

        this._logger.info('Exotel stream started', {
          sessionId,
          callSid,
          streamSid,
          encoding: fmt.encoding,
          sampleRate: fmt.sampleRate,
        });

        emit({
          type: 'transport.connected',
          timestamp: now,
          sessionId,
          callSid,
          protocol: 'websocket',
          streamId: streamSid,
          remoteAddress: session.metadata.remoteAddress,
        });
        break;
      }

      case 'media': {
        const media = msg as ExotelMediaMessage;
        const payload = extractMediaPayload(media);

        if (!payload || !isValidBase64Payload(payload)) {
          this._logger.debug('Exotel media message with empty payload — skipped', {
            sessionId,
          });
          break;
        }

        const ctx = this._resolveAudioContext(session);
        const seq = session.nextInboundSequence(now);

        emit({
          type: 'transport.audio_received',
          timestamp: now,
          sessionId,
          callSid,
          base64Payload: payload,
          encoding: ctx.encoding,
          sampleRate: ctx.sampleRate,
          sequence: seq,
          trackId: extractTrackId(media),
        });
        break;
      }

      case 'mark': {
        const mark = msg as ExotelMarkMessage;
        emit({
          type: 'transport.mark_acknowledged',
          timestamp: now,
          sessionId,
          callSid,
          name: mark.mark?.name ?? '',
        });
        break;
      }

      case 'stop': {
        const stop = msg as ExotelStopMessage;
        this._logger.info('Exotel stop received — call ended', {
          sessionId,
          callSid,
          streamSid: stop.streamSid,
        });
        emit({
          type: 'transport.call_ended',
          timestamp: now,
          sessionId,
          callSid,
          reason: 'caller_hung_up',
        });
        break;
      }

      case 'dtmf': {
        const dtmf = msg as ExotelDtmfMessage;
        emit({
          type: 'transport.dtmf_received',
          timestamp: now,
          sessionId,
          callSid,
          digit: dtmf.dtmf?.digit ?? '',
          durationMs: Number(dtmf.dtmf?.duration ?? 0),
        });
        break;
      }

      case 'heartbeat':
      case 'ping': {
        const hb = msg as ExotelHeartbeatMessage;
        this._logger.debug('Exotel heartbeat received', {
          sessionId,
          seq: hb.sequenceNumber,
        });
        emit({
          type: 'transport.heartbeat',
          timestamp: now,
          sessionId,
          callSid,
          rttMs: null,
        });
        break;
      }

      default:
        // Unknown messages must never crash the session.
        this._logger.debug('Exotel unknown message type — ignored', {
          sessionId,
          event: msg.event,
        });
        break;
    }
  }

  encodeOutboundAudio(chunk: AudioChunk, streamId: string): string {
    const payload =
      typeof chunk.payload === 'string'
        ? chunk.payload
        : Buffer.from(chunk.payload).toString('base64');

    return encodeMediaMessage(streamId, payload);
  }

  encodeMark(streamId: string, name: string): string {
    return encodeMarkMessage(streamId, name);
  }

  encodeClear(streamId: string): string {
    return encodeClearMessage(streamId);
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Returns the audio context for a session, falling back to μ-law 8 kHz if
   * no `start` message has been received yet (should not happen in practice).
   */
  private _resolveAudioContext(session: TransportSession): SessionAudioContext {
    return (
      this._audioContexts.get(session) ?? {
        encoding: 'mulaw',
        sampleRate: 8000,
        channels: 1,
        streamSid: session.metadata.streamId,
      }
    );
  }
}
