/**
 * @module AudioEngine
 *
 * The top-level coordinator for all audio processing in Voice Engine V2.
 *
 * ## Purpose
 * `AudioEngine` is the single entry point for all audio I/O within a live
 * call. It owns the inbound and outbound pipelines, the shared clock, and
 * all quality metrics. Downstream consumers (the orchestrator) deliver chunks
 * via `ingestInbound()` and pull processed outbound chunks via
 * `tickOutbound()`.
 *
 * It contains NO WebSocket, NO HTTP, NO transport, NO provider, and NO
 * codec implementation. All codec concerns are limited to descriptors in
 * `AudioCodec.ts`; all timing is routed through `IAudioClock`.
 *
 * ## Ownership
 * Created by `AudioEngineFactory` once per live call. Destroyed by calling
 * `destroy()` when the call ends.
 *
 * ## Thread Safety
 * All methods are synchronous or return simple values. Must be driven
 * sequentially from the orchestrator's async pipeline.
 *
 * ## Lifecycle
 * ```
 * createAudioEngine()
 *   └─► start()           — resets clock epoch, marks engine active
 *         ├─► ingestInbound(chunk)   — deliver caller audio into inbound pipeline
 *         ├─► tickInbound()          — retrieve scheduling result for inbound audio
 *         ├─► ingestOutbound(chunk)  — deliver response audio into outbound pipeline
 *         ├─► tickOutbound()         — retrieve scheduling result for outbound audio
 *         ├─► flushOutbound()        — immediate drain (barge-in)
 *         └─► getSnapshot()          — read combined statistics
 *   └─► stop()            — signals EOS on both pipelines
 *   └─► destroy()         — clears all state; engine becomes unusable
 * ```
 */

import type { Nullable } from '../types/index.js';
import type { AudioChunk, AudioDirection } from './AudioChunk.js';
import type { IAudioClock } from './AudioClock.js';
import type { AudioSchedulerConfig } from './AudioScheduler.js';
import type { AudioStatisticsSnapshot } from './AudioStatistics.js';
import type { AudioLatencySnapshot } from './AudioLatency.js';
import type { PipelineResult } from './AudioPipeline.js';
import { AudioPipeline } from './AudioPipeline.js';
import { AudioLatency } from './AudioLatency.js';
import { AudioStatistics } from './AudioStatistics.js';
import { VoiceEngineError, ErrorCode } from '../errors/index.js';

/**
 * Configuration for the `AudioEngine`.
 */
export interface AudioEngineConfig {
  /**
   * Scheduler configuration overrides for the inbound pipeline.
   * Defaults to `DEFAULT_SCHEDULER_CONFIG`.
   */
  readonly inboundScheduler?: Partial<AudioSchedulerConfig>;

  /**
   * Scheduler configuration overrides for the outbound pipeline.
   * Defaults to `DEFAULT_SCHEDULER_CONFIG`.
   */
  readonly outboundScheduler?: Partial<AudioSchedulerConfig>;

  /**
   * Rolling window size (in samples) for latency and jitter averaging.
   * Defaults to 50.
   */
  readonly rollingWindowSize?: number;
}

/**
 * A combined snapshot of the engine's runtime state.
 */
export interface AudioEngineSnapshot {
  readonly isRunning: boolean;
  readonly uptimeMs: number;
  readonly statistics: AudioStatisticsSnapshot;
  readonly latency: AudioLatencySnapshot;
  readonly inboundBufferDepth: number;
  readonly outboundBufferDepth: number;
  readonly inboundBufferDurationMs: number;
  readonly outboundBufferDurationMs: number;
}

/**
 * Public interface for the audio engine.
 */
export interface IAudioEngine {
  /** Whether the engine is currently running. */
  readonly isRunning: boolean;

  /** Starts the engine. Must be called before ingesting any chunks. */
  start(): void;

  /**
   * Ingests a caller audio chunk into the inbound pipeline.
   * Only valid while the engine is running.
   */
  ingestInbound(chunk: AudioChunk): void;

  /**
   * Produces a scheduling result for inbound audio.
   * Call after one or more `ingestInbound()` calls.
   */
  tickInbound(playbackDebtMs?: Nullable<number>): PipelineResult;

  /**
   * Ingests a response audio chunk into the outbound pipeline.
   * Only valid while the engine is running.
   */
  ingestOutbound(chunk: AudioChunk): void;

  /**
   * Produces a scheduling result for outbound audio.
   * Call on each orchestrator tick to determine what to play to the caller.
   */
  tickOutbound(playbackDebtMs?: Nullable<number>): PipelineResult;

  /**
   * Records that the first outbound audio chunk has been played.
   * Used to compute response and end-to-end latency.
   *
   * @param utteranceCommittedAt - When the caller's utterance was committed.
   * @param firstChunkPlayedAt   - When the first outbound chunk was played.
   */
  recordResponseLatency(utteranceCommittedAt: number, firstChunkPlayedAt: number): void;

  /**
   * Requests an immediate flush of the outbound pipeline (e.g. barge-in).
   */
  flushOutbound(): PipelineResult;

  /**
   * Returns a combined snapshot of engine state and quality metrics.
   */
  getSnapshot(): Readonly<AudioEngineSnapshot>;

  /**
   * Signals end-of-stream on both pipelines.
   * Pending chunks will be flushed on the next tick.
   */
  stop(): void;

  /**
   * Destroys the engine, releasing all state.
   * Safe to call multiple times; subsequent calls are no-ops.
   */
  destroy(): void;
}

/**
 * Production implementation of `IAudioEngine`.
 */
export class AudioEngine implements IAudioEngine {
  private readonly _clock: IAudioClock;
  private readonly _inbound: AudioPipeline;
  private readonly _outbound: AudioPipeline;
  private readonly _latency: AudioLatency;
  private readonly _statistics: AudioStatistics;

  private _running = false;
  private _startedAt: Nullable<number> = null;
  private _destroyed = false;

  constructor(
    clock: IAudioClock,
    config: AudioEngineConfig = {}
  ) {
    this._clock = clock;
    this._latency = new AudioLatency(config.rollingWindowSize ?? 50);
    this._statistics = new AudioStatistics();

    this._inbound = new AudioPipeline(
      { direction: 'inbound', schedulerConfig: config.inboundScheduler },
      this._clock,
      this._latency,
      this._statistics
    );

    this._outbound = new AudioPipeline(
      { direction: 'outbound', schedulerConfig: config.outboundScheduler },
      this._clock,
      this._latency,
      this._statistics
    );
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  get isRunning(): boolean {
    return this._running;
  }

  start(): void {
    this._assertNotDestroyed('start');
    if (this._running) return;
    this._clock.reset();
    this._startedAt = this._clock.now();
    this._running = true;
  }

  stop(): void {
    if (!this._running || this._destroyed) return;
    this._inbound.signalEndOfStream();
    this._outbound.signalEndOfStream();
    this._running = false;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._running = false;
    this._inbound.reset();
    this._outbound.reset();
    this._statistics.reset();
    this._latency.reset();
    this._destroyed = true;
  }

  // ─── Inbound Pipeline ────────────────────────────────────────────────────

  ingestInbound(chunk: AudioChunk): void {
    this._assertRunning('ingestInbound');
    this._validateDirection(chunk.direction, 'inbound', 'ingestInbound');
    this._inbound.ingest(chunk);
  }

  tickInbound(playbackDebtMs: Nullable<number> = null): PipelineResult {
    this._assertNotDestroyed('tickInbound');
    return this._inbound.tick(playbackDebtMs);
  }

  // ─── Outbound Pipeline ───────────────────────────────────────────────────

  ingestOutbound(chunk: AudioChunk): void {
    this._assertRunning('ingestOutbound');
    this._validateDirection(chunk.direction, 'outbound', 'ingestOutbound');
    this._outbound.ingest(chunk);
  }

  tickOutbound(playbackDebtMs: Nullable<number> = null): PipelineResult {
    this._assertNotDestroyed('tickOutbound');
    return this._outbound.tick(playbackDebtMs);
  }

  flushOutbound(): PipelineResult {
    this._assertNotDestroyed('flushOutbound');
    this._outbound.requestFlush();
    return this._outbound.tick(null);
  }

  // ─── Latency Recording ───────────────────────────────────────────────────

  recordResponseLatency(utteranceCommittedAt: number, firstChunkPlayedAt: number): void {
    this._latency.recordResponse(utteranceCommittedAt, firstChunkPlayedAt);
  }

  // ─── Snapshot ─────────────────────────────────────────────────────────────

  getSnapshot(): Readonly<AudioEngineSnapshot> {
    return Object.freeze<AudioEngineSnapshot>({
      isRunning: this._running,
      uptimeMs: this._startedAt !== null ? this._clock.elapsed(this._startedAt) : 0,
      statistics: this._statistics.snapshot(),
      latency: this._latency.snapshot(),
      inboundBufferDepth: this._inbound.bufferDepth,
      outboundBufferDepth: this._outbound.bufferDepth,
      inboundBufferDurationMs: this._inbound.bufferDurationMs,
      outboundBufferDurationMs: this._outbound.bufferDurationMs,
    });
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private _assertRunning(method: string): void {
    this._assertNotDestroyed(method);
    if (!this._running) {
      throw new VoiceEngineError(
        `AudioEngine.${method}() called while engine is not running`,
        ErrorCode.PIPELINE_ABORTED,
        false
      );
    }
  }

  private _assertNotDestroyed(method: string): void {
    if (this._destroyed) {
      throw new VoiceEngineError(
        `AudioEngine.${method}() called after destroy()`,
        ErrorCode.PIPELINE_ABORTED,
        false
      );
    }
  }

  private _validateDirection(
    actual: AudioDirection,
    expected: AudioDirection,
    method: string
  ): void {
    if (actual !== expected) {
      throw new VoiceEngineError(
        `AudioEngine.${method}() received a '${actual}' chunk; expected '${expected}'`,
        ErrorCode.AUDIO_DECODE_FAILED,
        false,
        { actual, expected }
      );
    }
  }
}
