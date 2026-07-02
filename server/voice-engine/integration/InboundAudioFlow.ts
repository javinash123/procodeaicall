/**
 * @module InboundAudioFlow
 *
 * Drives the inbound audio pipeline:
 * ```
 * Transport → MediaSession → AudioEngine → RealtimeBridge
 * ```
 *
 * ## Responsibilities
 * - Subscribes to `transport.audio_received` events from `ITransportGateway`.
 * - Guards on `IMediaSession.state` — only forwards audio when the session
 *   is in an audio-accepting state (ACTIVE).
 * - Ingests each inbound chunk into `IAudioEngine.ingestInbound()`.
 * - Ticks the inbound pipeline via `IAudioEngine.tickInbound()` to produce
 *   the scheduled chunks.
 * - Forwards scheduled chunks to `IRealtimeBridge.forwardAudio()` for
 *   transmission to the AI provider.
 *
 * ## Rules
 * - No transport protocol (no Exotel, no WebSocket protocol specifics).
 * - No OpenAI SDK imports.
 * - No business logic, no CRM, no MongoDB.
 * - Dependency Injection only.
 *
 * ## Performance
 * All processing is synchronous within each event callback to avoid
 * additional scheduling overhead. Target: <10 ms per chunk in the hot path.
 */

import type { ILogger } from '../logger/index.js';
import type { IMediaSession } from '../media/MediaSession.js';
import type { IAudioEngine } from '../audio-engine/AudioEngine.js';
import type { ITransportGateway } from '../transport/TransportGateway.js';
import type { TransportAudioReceivedEvent } from '../transport/TransportEvents.js';
import type { IRealtimeBridge } from './RealtimeBridge.js';
import { MediaSessionState } from '../media/MediaSessionState.js';
import { createAudioChunk } from '../audio-engine/AudioChunk.js';

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Tuning configuration for `InboundAudioFlow`.
 */
export interface InboundAudioFlowConfig {
  /**
   * Whether to tick the inbound pipeline after each ingest.
   * Defaults to `true`. Set `false` to drive ticks externally.
   */
  readonly tickOnIngest: boolean;
}

const DEFAULT_INBOUND_CONFIG: Readonly<InboundAudioFlowConfig> = Object.freeze({
  tickOnIngest: true,
});

// ─── Dependencies ─────────────────────────────────────────────────────────────

/** Injected dependencies for `InboundAudioFlow`. */
export interface InboundAudioFlowDependencies {
  /** Transport gateway to subscribe to inbound audio events. */
  readonly transport: ITransportGateway;
  /** Media session used to gate audio forwarding by lifecycle state. */
  readonly mediaSession: IMediaSession;
  /** Audio engine for inbound pipeline processing. */
  readonly audioEngine: IAudioEngine;
  /** Realtime bridge to forward processed chunks to the AI provider. */
  readonly bridge: IRealtimeBridge;
  /** Structured logger. */
  readonly logger: ILogger;
  /** Session identifier for log correlation. */
  readonly sessionId: string;
  /** Optional config overrides. */
  readonly config?: Partial<InboundAudioFlowConfig>;
}

// ─── Public Interface ─────────────────────────────────────────────────────────

/**
 * Public contract for the inbound audio flow pipeline.
 */
export interface IInboundAudioFlow {
  /**
   * Attaches all transport event listeners and begins forwarding
   * inbound audio to the AI provider.
   *
   * Must be called after the transport session is established and
   * the realtime bridge is connected.
   */
  start(): void;

  /**
   * Detaches all transport event listeners and stops forwarding audio.
   * Safe to call multiple times; subsequent calls are no-ops.
   */
  stop(): void;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Production implementation of `IInboundAudioFlow`.
 */
export class InboundAudioFlow implements IInboundAudioFlow {
  private readonly _transport: ITransportGateway;
  private readonly _mediaSession: IMediaSession;
  private readonly _audioEngine: IAudioEngine;
  private readonly _bridge: IRealtimeBridge;
  private readonly _logger: ILogger;
  private readonly _sessionId: string;
  private readonly _config: Readonly<InboundAudioFlowConfig>;

  private _active = false;
  private _chunkSequence = 0;

  /** [V2 TRACE] first-only guard */
  private _traceFirstAudio = true;

  /**
   * Bound handler reference retained so it can be passed to `off()` exactly.
   */
  private readonly _onAudioReceived: (event: TransportAudioReceivedEvent) => void;

  constructor(deps: Readonly<InboundAudioFlowDependencies>) {
    this._transport = deps.transport;
    this._mediaSession = deps.mediaSession;
    this._audioEngine = deps.audioEngine;
    this._bridge = deps.bridge;
    this._logger = deps.logger.child({ component: 'InboundAudioFlow', sessionId: deps.sessionId });
    this._sessionId = deps.sessionId;
    this._config = Object.freeze({ ...DEFAULT_INBOUND_CONFIG, ...deps.config });

    // Pre-bind to allow clean `off()` reference equality.
    this._onAudioReceived = this._handleAudioReceived.bind(this);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  /**
   * Attaches the inbound audio listener to the transport gateway.
   */
  start(): void {
    if (this._active) return;
    this._active = true;
    this._transport.on('transport.audio_received', this._onAudioReceived);
    this._logger.info('InboundAudioFlow started');
  }

  /**
   * Detaches the inbound audio listener from the transport gateway.
   */
  stop(): void {
    if (!this._active) return;
    this._active = false;
    this._transport.off('transport.audio_received', this._onAudioReceived);
    this._logger.info('InboundAudioFlow stopped');
  }

  // ─── Private: Hot Path ───────────────────────────────────────────────────────

  /**
   * Called for every inbound audio frame received by the transport gateway.
   *
   * Guards:
   * 1. MediaSession must be in the ACTIVE state.
   * 2. AudioEngine must be running.
   * 3. Bridge must be connected.
   *
   * @param event - Decoded transport audio event.
   */
  private _handleAudioReceived(event: TransportAudioReceivedEvent): void {
    if (this._traceFirstAudio) {
      this._traceFirstAudio = false;
      console.log(`[V2 TRACE] 11. First inbound audio  sessionId=${this._sessionId}  bytes=${event.base64Payload.length}`);
    }

    // Guard 1 — session state
    if (this._mediaSession.state !== MediaSessionState.ACTIVE) return;

    // Guard 2 — audio engine
    if (!this._audioEngine.isRunning) return;

    // Guard 3 — bridge
    if (!this._bridge.isConnected) return;

    // Build an immutable AudioChunk from the transport event
    const chunk = createAudioChunk({
      sequence: this._chunkSequence++,
      timestamp: event.timestamp,
      sampleRate: event.sampleRate,
      encoding: this._resolveEncoding(event.encoding),
      durationMs: this._estimateDurationMs(event.base64Payload, event.sampleRate),
      payload: event.base64Payload,
      payloadFormat: 'base64',
      direction: 'inbound',
      trackId: event.trackId,
    });

    // Ingest into the audio engine inbound pipeline
    try {
      this._audioEngine.ingestInbound(chunk);
    } catch (err) {
      this._logger.warn('InboundAudioFlow: audioEngine.ingestInbound failed', {
        error: String(err),
        sequence: chunk.sequence,
      });
      return;
    }

    // Tick the pipeline to obtain scheduled chunks
    if (!this._config.tickOnIngest) return;

    const result = this._audioEngine.tickInbound(null);

    // Forward each scheduled chunk to the AI provider
    for (const scheduled of result.chunksToSend) {
      const base64 = this._toBase64(scheduled.payload);
      if (base64.length > 0) {
        this._bridge.forwardAudio(base64);
      }
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Converts a payload to a base64 string.
   * When the payload is already a base64 string, returns it directly.
   * When the payload is a `Uint8Array`, converts via Buffer.
   */
  private _toBase64(payload: Uint8Array | string): string {
    if (typeof payload === 'string') return payload;
    return Buffer.from(payload).toString('base64');
  }

  /**
   * Resolves the raw encoding string from the transport event to a typed
   * `AudioEncoding`. Falls back to `'mulaw'` for unrecognised encodings.
   */
  private _resolveEncoding(raw: string): 'pcm' | 'pcm16' | 'linear16' | 'mulaw' | 'alaw' | 'opus' {
    const known = new Set(['pcm', 'pcm16', 'linear16', 'mulaw', 'alaw', 'opus']);
    return known.has(raw)
      ? (raw as 'pcm' | 'pcm16' | 'linear16' | 'mulaw' | 'alaw' | 'opus')
      : 'mulaw';
  }

  /**
   * Estimates the audio duration of a base64-encoded μ-law payload.
   * μ-law: 1 byte per sample at the declared sample rate.
   */
  private _estimateDurationMs(base64Payload: string, sampleRate: number): number {
    if (sampleRate <= 0 || base64Payload.length === 0) return 0;
    const byteLength = Math.floor(base64Payload.length * 0.75);
    return Math.round((byteLength / sampleRate) * 1000);
  }
}
