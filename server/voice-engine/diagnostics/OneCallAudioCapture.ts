/**
 * @module OneCallAudioCapture
 *
 * ONE-SHOT diagnostic: passively captures raw G.711 μ-law audio bytes from
 * the FIRST AI response and the corresponding bytes enqueued for Exotel,
 * then writes three files:
 *
 *   logs/openai-audio.raw   — decoded bytes from every response.output_audio.delta
 *   logs/openai-audio.wav   — same bytes wrapped in a G.711 μ-law 8 kHz WAV header
 *   logs/exotel-audio.raw   — decoded bytes from every chunk passed to sendAudio()
 *
 * ## Invariants
 * - No audio bytes are modified.
 * - No resampling, no re-encoding, no optimisation.
 * - OpenAI side:  read-only observer via providerSession.on()
 * - Exotel side:  wraps sendAudio on the TransportGateway INSTANCE only
 *                 (not the class/module). Every call is forwarded unchanged.
 * - Files are written once — when the second response starts (first is done)
 *   or when the transport disconnects (fallback for single-response calls).
 * - Module is self-contained: no imports from runtime or transport modules.
 */

import fs   from 'fs';
import path from 'path';

import type { IOpenAIRealtimeSession }   from '../providers/openai/OpenAIRealtimeSession.js';
import type { RealtimeAudioReceivedEvent } from '../providers/openai/OpenAIRealtimeEvents.js';
import type { ITransportGateway }         from '../transport/TransportGateway.js';
import type { TransportDisconnectedEvent } from '../transport/TransportEvents.js';
import type { AudioChunk }                from '../audio-engine/AudioChunk.js';
import type { SessionId }                 from '../types/index.js';

// ─── WAV Header ───────────────────────────────────────────────────────────────

/**
 * Builds a minimal RIFF/WAVE header for G.711 μ-law, 8 kHz, mono audio.
 *
 * Layout (46 bytes total):
 *   RIFF descriptor  :  12 bytes  (ChunkID + ChunkSize + Format)
 *   fmt  sub-chunk   :  26 bytes  (Subchunk1ID + Subchunk1Size[=18] + fields)
 *   data sub-chunk   :   8 bytes  (Subchunk2ID + Subchunk2Size)
 *
 * AudioFormat = 7 (WAVE_FORMAT_MULAW).  Subchunk1Size = 18 because MULAW
 * requires the two-byte cbSize extension field (set to 0) for conformance.
 */
function buildMulawWavHeader(dataByteLength: number): Buffer {
  const SUBCHUNK1_SIZE = 18;          // fmt  body length for MULAW
  const HEADER_BYTES   = 12           // RIFF descriptor
                       + 4 + 4 + SUBCHUNK1_SIZE   // fmt  chunk
                       + 4 + 4;       // data chunk header
  // = 46

  const buf = Buffer.alloc(HEADER_BYTES);
  let  off  = 0;

  // ── RIFF descriptor ────────────────────────────────────────────────────────
  buf.write('RIFF', off, 'ascii');                      off += 4;
  buf.writeUInt32LE(HEADER_BYTES - 8 + dataByteLength, off); off += 4; // ChunkSize = 38 + dataLen
  buf.write('WAVE', off, 'ascii');                      off += 4;

  // ── fmt  sub-chunk ─────────────────────────────────────────────────────────
  buf.write('fmt ', off, 'ascii');          off += 4;
  buf.writeUInt32LE(SUBCHUNK1_SIZE, off);   off += 4;  // Subchunk1Size = 18
  buf.writeUInt16LE(7,              off);   off += 2;  // AudioFormat = MULAW
  buf.writeUInt16LE(1,              off);   off += 2;  // NumChannels = 1
  buf.writeUInt32LE(8000,           off);   off += 4;  // SampleRate
  buf.writeUInt32LE(8000,           off);   off += 4;  // ByteRate (8000 × 1 × 1)
  buf.writeUInt16LE(1,              off);   off += 2;  // BlockAlign
  buf.writeUInt16LE(8,              off);   off += 2;  // BitsPerSample
  buf.writeUInt16LE(0,              off);   off += 2;  // cbSize = 0

  // ── data sub-chunk header ──────────────────────────────────────────────────
  buf.write('data', off, 'ascii');              off += 4;
  buf.writeUInt32LE(dataByteLength, off);       // Subchunk2Size

  return buf;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Attaches a one-shot audio capture to a single call.
 *
 * Call once, immediately after RuntimeIntegration.start().
 *
 * @param providerSession   - The open IOpenAIRealtimeSession for this call.
 * @param transportGateway  - The ITransportGateway instance for this call.
 * @param sessionId         - The session identifier used to filter transport events.
 */
export function attachOneCallAudioCapture(
  providerSession:  IOpenAIRealtimeSession,
  transportGateway: ITransportGateway,
  sessionId:        SessionId,
): void {
  let firstResponseId: string | null = null;
  let capturingOpenAI                = false;
  let doneFlushed                    = false;

  const openAIChunks: Buffer[] = [];
  const exotelChunks: Buffer[] = [];

  // ── flush: write all three files, log report, detach ────────────────────────
  const flush = (reason: string): void => {
    if (doneFlushed) return;
    doneFlushed = true;

    // Detach all observers before any I/O so no more chunks are added
    providerSession.off('realtime.audio_received', onAudioReceived);
    transportGateway.off('transport.disconnected',  onDisconnected as any);

    const openaiRaw = Buffer.concat(openAIChunks);
    const exotelRaw = Buffer.concat(exotelChunks);

    const logsDir  = path.resolve('logs');
    const rawPath  = path.join(logsDir, 'openai-audio.raw');
    const wavPath  = path.join(logsDir, 'openai-audio.wav');
    const exoPath  = path.join(logsDir, 'exotel-audio.raw');

    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(rawPath, openaiRaw);
    fs.writeFileSync(exoPath, exotelRaw);

    const wavHeader = buildMulawWavHeader(openaiRaw.length);
    fs.writeFileSync(wavPath, Buffer.concat([wavHeader, openaiRaw]));

    const identical = openaiRaw.equals(exotelRaw);

    console.log('[AudioCapture] ══════════════════════════════════════════════');
    console.log(`[AudioCapture] Flush reason       : ${reason}`);
    console.log(`[AudioCapture] sessionId          : ${sessionId}`);
    console.log(`[AudioCapture] logs/openai-audio.raw — ${openaiRaw.length} bytes`);
    console.log(`[AudioCapture] logs/exotel-audio.raw — ${exotelRaw.length} bytes`);
    console.log(`[AudioCapture] Byte-for-byte identical: ${identical}`);
    console.log('[AudioCapture] ══════════════════════════════════════════════');
  };

  // ── OpenAI audio observer ────────────────────────────────────────────────────
  const onAudioReceived = (event: RealtimeAudioReceivedEvent): void => {
    if (doneFlushed) return;

    if (firstResponseId === null) {
      // Very first delta of the call — start accumulating
      firstResponseId = event.responseId;
      capturingOpenAI = true;
      console.log(`[AudioCapture] First response started  responseId=${firstResponseId}`);
    }

    if (capturingOpenAI) {
      if (event.responseId === firstResponseId) {
        // Still in the first response — accumulate
        openAIChunks.push(Buffer.from(event.delta, 'base64'));
      } else {
        // Second response has started — first response is done
        capturingOpenAI = false;
        console.log(`[AudioCapture] Second response started — first response audio complete`);
        flush('second_response_started');
      }
    }
  };

  // ── Transport disconnect fallback ────────────────────────────────────────────
  const onDisconnected = (event: TransportDisconnectedEvent): void => {
    if (event.sessionId !== sessionId) return;
    flush('transport_disconnected');
  };

  // ── Exotel sendAudio instance patch ─────────────────────────────────────────
  // Wraps sendAudio on THIS instance only. Every call is forwarded unchanged.
  // The instance patch is undone implicitly when the gateway is garbage-collected.
  const gw    = transportGateway as any;
  const _orig = (gw.sendAudio as Function).bind(transportGateway);

  gw.sendAudio = function patchedSendAudio(
    sid:      SessionId,
    chunk:    AudioChunk,
    markName: string | undefined,
  ): void {
    if (!doneFlushed && sid === sessionId) {
      const raw: Buffer =
        typeof chunk.payload === 'string'
          ? Buffer.from(chunk.payload as string, 'base64')
          : Buffer.from(chunk.payload as Uint8Array);
      exotelChunks.push(raw);

      // [DEBUG] per-chunk trace at the capture boundary
      if (process.env['NIJVOX_DEBUG_AUDIO'] === '1') {
        const b64Len      = typeof chunk.payload === 'string' ? chunk.payload.length : -1;
        const runningTotal = exotelChunks.reduce((s, b) => s + b.byteLength, 0);
        console.log(
          `[AudioTrace][6-OneCallCapture.sendAudio] seq=${chunk.sequence}` +
          `  payloadType=${typeof chunk.payload}` +
          `  b64Len=${b64Len}  capturedBytes=${raw.byteLength}` +
          `  runningExotelTotal=${runningTotal}` +
          `  changed=false  concatenated=false  copied=false  merged=false`,
        );
      }
    }
    _orig(sid, chunk, markName);
  };

  // ── Attach ───────────────────────────────────────────────────────────────────
  providerSession.on('realtime.audio_received', onAudioReceived);
  transportGateway.on('transport.disconnected',  onDisconnected as any);

  console.log(`[AudioCapture] Attached to sessionId=${sessionId} — waiting for first audio delta`);
}
