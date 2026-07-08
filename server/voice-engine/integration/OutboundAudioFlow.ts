/**
 * @module OutboundAudioFlow
 *
 * Drives the outbound audio pipeline with real-time pacing:
 * ```
 * RealtimeBridge → AudioEngine → PacingQueue → Transport
 * ```
 *
 * ## Responsibilities
 * - Subscribes to `bridge.audio_ready` events from `IRealtimeBridge`.
 * - Ingests each provider audio delta into `IAudioEngine.ingestOutbound()`.
 * - Ticks the outbound pipeline via `IAudioEngine.tickOutbound()` to produce
 *   scheduled chunks.
 * - Enqueues each scheduled chunk into the internal FIFO pacing queue.
 * - Delivers chunks to `ITransportGateway.sendAudio()` at real-time pace:
 *   the first chunk in any burst is sent immediately; every subsequent chunk
 *   is sent after the previous chunk's `durationMs` has elapsed, so Exotel
 *   receives audio no faster than it can play it.
 * - On `bridge.speech_detected` (barge-in): cancels the pacing timer, drains
 *   the queue, flushes the engine buffer, and sends a clear command to the
 *   transport to silence buffered audio at the provider end.
 *
 * ## Pacing Queue Invariants
 * 1. At most ONE `setTimeout` handle is live at any point in time.
 * 2. `_pacingTimer === null` if and only if the queue is idle (no scheduled send).
 * 3. Chunks are always dequeued in the order they were enqueued (FIFO).
 * 4. `_resetPacer()` is the single teardown path for both normal stop and
 *    interruption; it always leaves the queue empty and the timer cancelled.
 *
 * ## Rules
 * - No OpenAI SDK imports.
 * - No Exotel protocol imports.
 * - No business logic, no CRM, no MongoDB.
 * - Dependency Injection only.
 *
 * ## Performance
 * The hot path (ingest + enqueue) is synchronous and < 1 ms.
 * The send path runs on the event loop via setTimeout — no blocking I/O.
 */

import type { ILogger } from '../logger/index.js';
import type { IAudioEngine } from '../audio-engine/AudioEngine.js';
import type { ITransportGateway } from '../transport/TransportGateway.js';
import type { AudioChunk } from '../audio-engine/AudioChunk.js';
import type { SessionId } from '../types/index.js';
import type {
  IRealtimeBridge,
  BridgeAudioReadyEvent,
  BridgeSpeechDetectedEvent,
} from './RealtimeBridge.js';
import { createAudioChunk } from '../audio-engine/AudioChunk.js';
import { recordTrace } from '../diagnostics/CallTraceWriter.js';

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Audio format configuration for chunks arriving from the AI provider.
 * These values must match the session configuration negotiated with the provider.
 */
export interface OutboundAudioFormat {
  /** Sample rate of the provider's output audio in Hz (e.g. 8000, 24000). */
  readonly sampleRate: number;
  /** Encoding of the provider's output audio. */
  readonly encoding: 'pcm' | 'pcm16' | 'linear16' | 'mulaw' | 'alaw' | 'opus';
}

/**
 * Tuning configuration for `OutboundAudioFlow`.
 */
export interface OutboundAudioFlowConfig {
  /** Audio format of the provider's output stream. Defaults to µ-law at 8 kHz. */
  readonly audioFormat: OutboundAudioFormat;
  /**
   * Whether to tick the outbound pipeline after each ingest.
   * Defaults to `true`. Set `false` to drive ticks externally.
   */
  readonly tickOnIngest: boolean;
}

const DEFAULT_OUTBOUND_CONFIG: Readonly<OutboundAudioFlowConfig> = Object.freeze({
  audioFormat: Object.freeze({ sampleRate: 8000, encoding: 'mulaw' as const }),
  tickOnIngest: true,
});

// ─── Dependencies ─────────────────────────────────────────────────────────────

/** Injected dependencies for `OutboundAudioFlow`. */
export interface OutboundAudioFlowDependencies {
  /** Realtime bridge to receive outbound audio from the AI provider. */
  readonly bridge: IRealtimeBridge;
  /** Audio engine for outbound pipeline processing. */
  readonly audioEngine: IAudioEngine;
  /** Transport gateway to deliver processed audio to the caller. */
  readonly transport: ITransportGateway;
  /** Session identifier used to address the correct transport connection. */
  readonly sessionId: SessionId;
  /** Structured logger. */
  readonly logger: ILogger;
  /** Optional config overrides. */
  readonly config?: Partial<OutboundAudioFlowConfig>;
}

// ─── Public Interface ─────────────────────────────────────────────────────────

/**
 * Public contract for the outbound audio flow pipeline.
 */
export interface IOutboundAudioFlow {
  /**
   * Attaches all bridge event listeners and begins forwarding
   * AI provider audio to the caller.
   *
   * Must be called after the realtime bridge is connected and the
   * transport session is established.
   */
  start(): void;

  /**
   * Detaches all bridge event listeners, cancels the pacing timer,
   * and discards any queued audio.
   * Safe to call multiple times; subsequent calls are no-ops.
   */
  stop(): void;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Production implementation of `IOutboundAudioFlow`.
 */
export class OutboundAudioFlow implements IOutboundAudioFlow {
  private readonly _bridge: IRealtimeBridge;
  private readonly _audioEngine: IAudioEngine;
  private readonly _transport: ITransportGateway;
  private readonly _sessionId: SessionId;
  private readonly _logger: ILogger;
  private readonly _config: Readonly<OutboundAudioFlowConfig>;

  private _active = false;
  private _chunkSequence = 0;

  /** [V2 TRACE] first-only guard */
  private _traceFirstAudio = true;

  // ─── Pacing Queue ────────────────────────────────────────────────────────────

  /**
   * FIFO queue of chunks awaiting real-time paced delivery.
   *
   * Writes: `_enqueue()` — called from the bridge event handler (hot path).
   * Reads:  `_sendNext()` — called either synchronously from `_enqueue()` when
   *          the pacer is idle, or from the timer callback.
   *
   * Node.js is single-threaded. No concurrent access is possible.
   * Ordering is therefore guaranteed by insertion order.
   */
  private readonly _pacingQueue: AudioChunk[] = [];

  /**
   * Handle of the single active pacing `setTimeout`.
   *
   * Invariant: `_pacingTimer === null` ↔ pacer is idle (queue may be non-empty
   * only during the synchronous window inside `_sendNext` before a new timer
   * is scheduled, which is not observable from outside).
   *
   * The timer is set to `null` at the TOP of `_sendNext` before the send so
   * that `_enqueue` can distinguish idle from running at any point.
   */
  private _pacingTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Pre-bound handler references retained for clean `off()` equality.
   */
  private readonly _onAudioReady: (event: BridgeAudioReadyEvent) => void;
  private readonly _onSpeechDetected: (event: BridgeSpeechDetectedEvent) => void;

  constructor(deps: Readonly<OutboundAudioFlowDependencies>) {
    this._bridge = deps.bridge;
    this._audioEngine = deps.audioEngine;
    this._transport = deps.transport;
    this._sessionId = deps.sessionId;
    this._logger = deps.logger.child({ component: 'OutboundAudioFlow', sessionId: deps.sessionId });
    this._config = Object.freeze({
      ...DEFAULT_OUTBOUND_CONFIG,
      ...deps.config,
      audioFormat: Object.freeze({
        ...DEFAULT_OUTBOUND_CONFIG.audioFormat,
        ...deps.config?.audioFormat,
      }),
    });

    this._onAudioReady = this._handleAudioReady.bind(this);
    this._onSpeechDetected = this._handleSpeechDetected.bind(this);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  /**
   * Attaches bridge event listeners and begins outbound audio forwarding.
   */
  start(): void {
    if (this._active) return;
    this._active = true;
    this._bridge.on('bridge.audio_ready', this._onAudioReady);
    this._bridge.on('bridge.speech_detected', this._onSpeechDetected);
    this._logger.info('OutboundAudioFlow started');
  }

  /**
   * Detaches bridge event listeners, cancels the pacing timer, and discards
   * all queued audio. Safe to call multiple times.
   */
  stop(): void {
    if (!this._active) return;
    this._active = false;
    this._bridge.off('bridge.audio_ready', this._onAudioReady);
    this._bridge.off('bridge.speech_detected', this._onSpeechDetected);
    this._resetPacer();
    this._logger.info('OutboundAudioFlow stopped');
  }

  // ─── Private: Hot Paths ───────────────────────────────────────────────────────

  /**
   * Called for every audio delta received from the AI provider.
   *
   * Ingests the delta into the engine, ticks to obtain scheduled chunks, then
   * enqueues each chunk for real-time paced delivery instead of sending
   * immediately.
   *
   * @param event - Provider audio ready event from the bridge.
   */
  private _handleAudioReady(event: BridgeAudioReadyEvent): void {
    recordTrace(this._sessionId, {
      component: 'OutboundAudioFlow',
      event: 'OutboundAudioFlow._handleAudioReady',
      payloadSummary: {
        responseId:    event.responseId,
        engineRunning: this._audioEngine.isRunning,
      },
      success: this._audioEngine.isRunning,
      skipped: !this._audioEngine.isRunning,
      skipReason: !this._audioEngine.isRunning ? 'audioEngine.isRunning=false — engine not started or stopped' : undefined,
    });

    if (!this._audioEngine.isRunning) return;

    if (this._traceFirstAudio) {
      this._traceFirstAudio = false;
      console.log(`[V2 TRACE] 14. First outbound audio sent  sessionId=${this._sessionId}  responseId=${event.responseId}`);
    }

    const chunk = this._buildChunk(event.base64Delta, event.timestamp);

    // [DEBUG] payload trace after _buildChunk — payload is the same base64 string from bridge
    if (process.env['NIJVOX_DEBUG_AUDIO'] === '1') {
      const pl          = chunk.payload as string;   // always string here (payloadFormat='base64')
      const b64Len      = pl.length;
      const decodedBytes = Math.floor(b64Len * 0.75);
      console.log(
        `[AudioTrace][3a-OutboundFlow._buildChunk] seq=${chunk.sequence}` +
        `  responseId=${event.responseId}` +
        `  payloadType=${typeof chunk.payload}` +
        `  b64Len=${b64Len}  decodedBytes~=${decodedBytes}` +
        `  changed=false  concatenated=false  copied=false  merged=false`,
      );
    }

    try {
      this._audioEngine.ingestOutbound(chunk);
      recordTrace(this._sessionId, {
        component: 'AudioEngine',
        event: 'AudioEngine.ingestOutbound',
        payloadSummary: { sequence: chunk.sequence },
        success: true,
        skipped: false,
      });
    } catch (err) {
      this._logger.warn('OutboundAudioFlow: audioEngine.ingestOutbound failed', {
        error: String(err),
        sequence: chunk.sequence,
      });
      recordTrace(this._sessionId, {
        component: 'AudioEngine',
        event: 'AudioEngine.ingestOutbound',
        payloadSummary: { sequence: chunk.sequence, error: String(err) },
        success: false,
        skipped: false,
        skipReason: `ingestOutbound threw: ${String(err)}`,
      });
      return;
    }

    if (!this._config.tickOnIngest) return;

    const result = this._audioEngine.tickOutbound(null);

    recordTrace(this._sessionId, {
      component: 'AudioEngine',
      event: 'AudioEngine.tickOutbound',
      payloadSummary: { chunksToSend: result.chunksToSend.length },
      success: result.chunksToSend.length > 0,
      skipped: result.chunksToSend.length === 0,
      skipReason: result.chunksToSend.length === 0 ? 'tickOutbound produced 0 chunks — audio engine buffering or not ready' : undefined,
    });

    // [DEBUG] tick result — how many chunks the engine released this tick
    if (process.env['NIJVOX_DEBUG_AUDIO'] === '1') {
      console.log(
        `[AudioTrace][3b-OutboundFlow.tickOutbound] action=${result.action}` +
        `  chunksReleased=${result.chunksToSend.length}` +
        `  bufferDepth=${result.bufferDepth}  bufferDurationMs=${result.bufferDurationMs}` +
        `  note="engine may hold chunks until minBufferMs satisfied"`,
      );
    }

    // Enqueue each chunk for real-time paced delivery.
    // _enqueue() starts the pacer on the first chunk of any burst; subsequent
    // chunks in the same burst are appended to the tail of the FIFO and sent
    // after their predecessors have played.
    for (const scheduled of result.chunksToSend) {
      this._enqueue(scheduled as AudioChunk);
    }
  }

  /**
   * Called when the provider VAD signals that the caller began speaking
   * (barge-in).
   *
   * The pacing queue is reset first so no further scheduled sends reach the
   * transport. The engine buffer is then flushed (discarding its contents),
   * and a clear command is sent to Exotel so it stops playing any audio it
   * has already buffered. This ordering guarantees the clear arrives at Exotel
   * before any new audio could be queued.
   */
  private _handleSpeechDetected(_event: BridgeSpeechDetectedEvent): void {
    if (!this._audioEngine.isRunning) return;

    this._logger.debug('OutboundAudioFlow: barge-in detected, resetting pacing queue');

    // 1. Cancel the timer and discard all queued chunks — no more scheduled sends.
    this._resetPacer();

    // 2. Drain the engine's internal pipeline buffer and discard the chunks.
    //    This resets the engine's scheduler state without leaking audio into
    //    the (now-empty) pacing queue.
    this._audioEngine.flushOutbound();

    // 3. Tell Exotel to immediately discard whatever it has already buffered.
    this._transport.sendClear(this._sessionId);

    this._logger.debug('OutboundAudioFlow: pacer reset and transport cleared');
  }

  // ─── Private: Pacing Queue ────────────────────────────────────────────────────

  /**
   * Appends `chunk` to the tail of the FIFO pacing queue.
   *
   * If the pacer is idle (`_pacingTimer === null`), the chunk is the first in
   * a new burst: it is sent immediately and the single-timer chain is started.
   * Otherwise the chunk waits at the tail until its turn.
   *
   * Ordering guarantee: because Node.js is single-threaded and all calls to
   * `_enqueue` originate from the same synchronous event-handler loop, items
   * are always pushed in the order the audio engine produced them.
   */
  private _enqueue(chunk: AudioChunk): void {
    this._pacingQueue.push(chunk);

    if (this._pacingTimer === null) {
      // Pacer is idle — send the head immediately and start the timer chain.
      this._sendNext();
    }
    // Else: pacer already running — the timer will reach this chunk in order.
  }

  /**
   * Pops the head chunk from the queue, sends it, and schedules the next tick
   * after exactly `chunk.durationMs` milliseconds.
   *
   * If the queue is empty after the send, the pacer returns to idle and no
   * timer is scheduled.
   *
   * Invariant: `_pacingTimer` is always `null` when this method is entered,
   * either because the pacer was idle (called from `_enqueue`) or because the
   * timer callback cleared it before invoking this method.
   */
  private _sendNext(): void {
    // _pacingTimer is already null here (either idle or cleared by callback).
    const chunk = this._pacingQueue.shift();
    if (chunk === undefined) {
      // Queue emptied between schedule and fire — pacer idles.
      return;
    }

    // [DEBUG] payload trace in _sendNext — same chunk object from the engine
    if (process.env['NIJVOX_DEBUG_AUDIO'] === '1') {
      const pl           = chunk.payload as string;
      const b64Len       = typeof pl === 'string' ? pl.length : -1;
      const decodedBytes = b64Len >= 0 ? Math.floor(b64Len * 0.75) : (chunk.payload as Uint8Array).byteLength;
      console.log(
        `[AudioTrace][3c-OutboundFlow._sendNext→transport] seq=${chunk.sequence}` +
        `  payloadType=${typeof chunk.payload}` +
        `  b64Len=${b64Len}  decodedBytes~=${decodedBytes}` +
        `  changed=false  concatenated=false  copied=false  merged=false`,
      );
    }

    // Send this chunk to the transport now.
    this._transport.sendAudio(this._sessionId, chunk);

    if (this._pacingQueue.length === 0) {
      // Queue drained — pacer idles until next audio burst arrives.
      // _pacingTimer remains null.
      return;
    }

    // More chunks waiting — schedule the next send after this chunk plays.
    // The callback clears _pacingTimer before calling _sendNext so that
    // _enqueue can always distinguish idle from running.
    this._pacingTimer = setTimeout(() => {
      this._pacingTimer = null;
      this._sendNext();
    }, chunk.durationMs);
  }

  /**
   * Cancels the active pacing timer and discards all queued chunks.
   *
   * This is the single teardown path for both normal stop and all
   * interruption scenarios (barge-in, disconnect, error). After this call:
   * - `_pacingTimer === null`
   * - `_pacingQueue.length === 0`
   *
   * Safe to call when the pacer is already idle.
   */
  private _resetPacer(): void {
    if (this._pacingTimer !== null) {
      clearTimeout(this._pacingTimer);
      this._pacingTimer = null;
    }
    this._pacingQueue.length = 0;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Builds an immutable outbound `AudioChunk` from a provider audio delta.
   *
   * Duration formula for µ-law at 8 kHz:
   *   byteLength = base64Length × 0.75   (base64 overhead)
   *   durationMs = byteLength / sampleRate × 1000
   *             = byteLength / 8000 × 1000  (1 byte/sample at 8 kHz)
   *
   * This durationMs is used both by the engine scheduler and by the pacing
   * queue to determine the inter-send interval.
   *
   * @param base64Delta - Base64-encoded audio from the provider.
   * @param timestamp   - Wall-clock timestamp of the event.
   */
  private _buildChunk(base64Delta: string, timestamp: number): Readonly<AudioChunk> {
    const { sampleRate, encoding } = this._config.audioFormat;
    const byteLength = Math.floor(base64Delta.length * 0.75);
    const durationMs = sampleRate > 0
      ? Math.round((byteLength / sampleRate) * 1000)
      : 0;

    return createAudioChunk({
      sequence: this._chunkSequence++,
      timestamp,
      sampleRate,
      encoding,
      durationMs,
      payload: base64Delta,
      payloadFormat: 'base64',
      direction: 'outbound',
    });
  }
}
