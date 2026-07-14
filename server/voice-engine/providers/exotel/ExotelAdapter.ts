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
import { pcm16ToMulaw, resamplePCM16 } from './PcmMulawCodec.js';

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

  /**
   * Exotel requires outbound PCM16 LE chunks to be exact multiples of 320 bytes
   * (= 20 ms @ 8 kHz, one standard telephony frame).  OpenAI's audio deltas
   * are variable-length, so after the 24kHz→8kHz downsample we often land on
   * non-aligned byte counts (e.g. 2400 or 4000 bytes, neither divisible by 320).
   *
   * This map accumulates leftover bytes from each delta and prepends them to
   * the next one, ensuring every frame we put on the wire is ≥ 320 bytes and
   * always an exact multiple of 320.
   *
   * Keyed by Exotel streamId (a stable per-call UUID).  Entries are deleted on
   * session clear (barge-in / call end) so stale audio never leaks across turns.
   */
  private readonly _accumulators = new Map<string, Buffer>();
  private static readonly ALIGN_BYTES = 320; // 20 ms @ 8 kHz PCM16 LE

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

  encodeOutboundAudio(chunk: AudioChunk, streamId: string): string[] {
    // Decode the incoming base64 string to raw bytes once, then re-encode the
    // entire buffer as a single base64 string.  One OpenAI delta → one Exotel
    // media WebSocket message.  No splitting, no pacing, no framing.
    // This matches the official Pipecat ExotelFrameSerializer reference behaviour.
    const raw: Buffer =
      typeof chunk.payload === 'string'
        ? Buffer.from(chunk.payload, 'base64')
        : Buffer.from(chunk.payload as Uint8Array);

    // ── Output format switch (controlled ONLY by VOICE_OUTPUT_FORMAT) ─────────
    // MODE 1 (pcmu, default): OpenAI already emits G.711 μ-law — pass the
    //   decoded bytes straight through, exactly as before this switch existed.
    // MODE 2 (pcm): OpenAI emits PCM16 at 24kHz (gpt-realtime minimum rate).
    //   Exotel expects Linear PCM16 LE @ 8kHz (confirmed in exotelStreamHandler.ts
    //   line 268: "Exotel expects Linear PCM16 LE @ 8 kHz").
    //   Step 1 — downsample 24kHz → 8kHz (3:1 linear interpolation).
    //   Step 2 — align to multiples of 320 bytes (20 ms telephony frames).
    //   DO NOT apply μ-law encoding — Exotel wants raw PCM16 LE, not G.711.
    //   Sending μ-law when Exotel expects PCM16 causes 2× fast-forward because
    //   Exotel reads every 2 μ-law bytes as one PCM16 sample (half the samples
    //   → double the playback speed).
    const outputFormat = (process.env['VOICE_OUTPUT_FORMAT'] || 'pcmu').toLowerCase();

    if (outputFormat === 'pcm') {
      // 1. Downsample 24kHz PCM16 → 8kHz PCM16 LE.
      const pcm8k = resamplePCM16(raw, 24000, 8000);

      // 2. Accumulate with any leftover bytes from the previous delta.
      const prev     = this._accumulators.get(streamId) ?? Buffer.alloc(0);
      const combined = prev.length > 0 ? Buffer.concat([prev, pcm8k]) : pcm8k;

      // 3. Keep only complete 320-byte frames; carry the rest forward.
      const align      = ExotelAdapter.ALIGN_BYTES;
      const sendable   = Math.floor(combined.length / align) * align;
      const remainder  = combined.subarray(sendable);

      if (remainder.length > 0) {
        this._accumulators.set(streamId, Buffer.from(remainder));
      } else {
        this._accumulators.delete(streamId);
      }

      if (sendable === 0) {
        // Not enough data yet — wait for the next delta.
        if (process.env['NIJVOX_DEBUG_AUDIO'] === '1') {
          console.log(
            `[ExotelOutbound] seq=${chunk.sequence}` +
            `  outputFormat=${outputFormat}` +
            `  inputBytes=${raw.byteLength}` +
            `  wireBytes=0  buffering=${combined.length}/${align}`,
          );
        }
        return [];
      }

      // 4. Encode the aligned block as a single Exotel media frame.
      const wireBytes = combined.subarray(0, sendable);
      const outB64    = wireBytes.toString('base64');
      const frame     = encodeMediaMessage(streamId, outB64);

      if (process.env['NIJVOX_DEBUG_AUDIO'] === '1') {
        console.log(
          `[ExotelOutbound] seq=${chunk.sequence}` +
          `  outputFormat=${outputFormat}` +
          `  inputBytes=${raw.byteLength}` +
          `  wireBytes=${wireBytes.length}` +
          `  remainder=${remainder.length}` +
          `  websocketMessagesPerDelta=1`,
        );
      }

      return [frame];
    }

    // MODE 1: pcmu — passthrough.
    const outB64 = raw.toString('base64');
    const frame  = encodeMediaMessage(streamId, outB64);

    if (process.env['NIJVOX_DEBUG_AUDIO'] === '1') {
      console.log(
        `[ExotelOutbound] seq=${chunk.sequence}` +
        `  outputFormat=${outputFormat}` +
        `  inputBytes=${raw.byteLength}` +
        `  wireBytes=${raw.byteLength}` +
        `  websocketMessagesPerDelta=1`,
      );
    }

    return [frame];
  }

  encodeMark(streamId: string, name: string): string {
    return encodeMarkMessage(streamId, name);
  }

  encodeClear(streamId: string): string {
    // Discard any partial PCM frame buffered for this stream so stale bytes
    // from the interrupted response never prepend to the next one.
    this._accumulators.delete(streamId);
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
