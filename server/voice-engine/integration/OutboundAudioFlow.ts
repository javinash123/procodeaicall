/**
 * @module OutboundAudioFlow
 *
 * Drives the outbound audio pipeline:
 * ```
 * RealtimeBridge → AudioEngine → MediaSession → Transport
 * ```
 *
 * ## Responsibilities
 * - Subscribes to `bridge.audio_ready` events from `IRealtimeBridge`.
 * - Ingests each provider audio delta into `IAudioEngine.ingestOutbound()`.
 * - Ticks the outbound pipeline via `IAudioEngine.tickOutbound()` to produce
 *   scheduled chunks.
 * - Delivers each scheduled chunk to the caller via
 *   `ITransportGateway.sendAudio()`.
 * - On `bridge.speech_detected` (barge-in): flushes the outbound pipeline and
 *   sends a clear command to the transport to silence buffered audio at the
 *   provider end.
 *
 * ## Rules
 * - No OpenAI SDK imports.
 * - No Exotel protocol imports.
 * - No business logic, no CRM, no MongoDB.
 * - Dependency Injection only.
 *
 * ## Performance
 * All processing is synchronous within each event callback.
 * Target: <10 ms per chunk in the hot path.
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
  /** Audio format of the provider's output stream. Defaults to PCM16 at 24 kHz. */
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
   * Detaches all bridge event listeners and stops forwarding audio.
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
   * Detaches bridge event listeners and stops outbound audio forwarding.
   */
  stop(): void {
    if (!this._active) return;
    this._active = false;
    this._bridge.off('bridge.audio_ready', this._onAudioReady);
    this._bridge.off('bridge.speech_detected', this._onSpeechDetected);
    this._logger.info('OutboundAudioFlow stopped');
  }

  // ─── Private: Hot Paths ───────────────────────────────────────────────────────

  /**
   * Called for every audio delta received from the AI provider.
   * Ingests into the outbound pipeline and delivers scheduled chunks to transport.
   *
   * @param event - Provider audio ready event from the bridge.
   */
  private _handleAudioReady(event: BridgeAudioReadyEvent): void {
    if (!this._audioEngine.isRunning) return;

    if (this._traceFirstAudio) {
      this._traceFirstAudio = false;
      console.log(`[V2 TRACE] 14. First outbound audio sent  sessionId=${this._sessionId}  responseId=${event.responseId}`);
    }

    const chunk = this._buildChunk(event.base64Delta, event.timestamp);

    try {
      this._audioEngine.ingestOutbound(chunk);
    } catch (err) {
      this._logger.warn('OutboundAudioFlow: audioEngine.ingestOutbound failed', {
        error: String(err),
        sequence: chunk.sequence,
      });
      return;
    }

    if (!this._config.tickOnIngest) return;

    const result = this._audioEngine.tickOutbound(null);

    for (const scheduled of result.chunksToSend) {
      this._transport.sendAudio(this._sessionId, scheduled as AudioChunk);
    }
  }

  /**
   * Called when the provider VAD signals that the caller began speaking
   * (barge-in). Flushes the outbound pipeline and clears the transport buffer
   * to stop audio playback immediately.
   */
  private _handleSpeechDetected(_event: BridgeSpeechDetectedEvent): void {
    if (!this._audioEngine.isRunning) return;

    this._logger.debug('OutboundAudioFlow: barge-in detected, flushing outbound pipeline');

    // Flush the engine pipeline (drain any buffered frames)
    const flushResult = this._audioEngine.flushOutbound();

    // Deliver any remaining frames before clearing
    for (const scheduled of flushResult.chunksToSend) {
      this._transport.sendAudio(this._sessionId, scheduled as AudioChunk);
    }

    // Clear transport buffer — stops audio playback at the telephony provider
    this._transport.sendClear(this._sessionId);

    this._logger.debug('OutboundAudioFlow: outbound flushed and transport cleared', {
      flushedChunks: flushResult.chunksToSend.length,
    });
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Builds an immutable outbound `AudioChunk` from a provider audio delta.
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
