/**
 * @module AudioPipeline
 *
 * Executable coordinator that drives one direction of audio processing.
 *
 * ## Purpose
 * `AudioPipeline` is the per-direction workhorse of the `AudioEngine`. It
 * receives `AudioChunk` objects, appends them to the `AudioBuffer`, consults
 * the `AudioScheduler` for the next action, and produces `PipelineResult`
 * objects that tell the engine what to deliver downstream.
 *
 * It contains NO provider logic, NO transport logic, and NO codec
 * implementations. Audio payloads pass through opaquely.
 *
 * ## Ownership
 * `AudioEngine` creates two pipelines — one for inbound, one for outbound.
 * The engine drives each pipeline by calling `ingest()` and `tick()`.
 *
 * ## Thread Safety
 * All methods are synchronous. Must be called from the engine's
 * single-threaded async loop.
 */

import type { Nullable } from '../types/index.js';
import type { AudioChunk, AudioDirection } from './AudioChunk.js';
import type { IAudioClock } from './AudioClock.js';
import type { AudioSchedulerConfig } from './AudioScheduler.js';
import { AudioBuffer } from './AudioBuffer.js';
import { AudioScheduler } from './AudioScheduler.js';
import { AudioLatency } from './AudioLatency.js';
import { AudioStatistics } from './AudioStatistics.js';

/**
 * The result of one pipeline tick.
 */
export interface PipelineResult {
  /**
   * Chunks that the engine should deliver to the downstream consumer.
   * Empty when the scheduler decides to hold, drop, or merge.
   */
  readonly chunksToSend: readonly AudioChunk[];
  /** The scheduling action that produced this result. */
  readonly action: 'send_now' | 'hold' | 'drop' | 'merge' | 'flush';
  /** Human-readable reason from the scheduler. */
  readonly reason: string;
  /** Current buffer depth (chunk count) after this tick. */
  readonly bufferDepth: number;
  /** Cumulative buffer duration in ms after this tick. */
  readonly bufferDurationMs: number;
}

/**
 * Configuration for one `AudioPipeline` instance.
 */
export interface AudioPipelineConfig {
  /** Audio direction this pipeline processes. */
  readonly direction: AudioDirection;
  /** Scheduler tuning overrides. Falls back to defaults if omitted. */
  readonly schedulerConfig?: Partial<AudioSchedulerConfig>;
}

/**
 * Drives one direction of audio through the buffer → schedule → deliver pipeline.
 */
export class AudioPipeline {
  readonly direction: AudioDirection;

  private readonly _buffer: AudioBuffer;
  private readonly _scheduler: AudioScheduler;
  private readonly _clock: IAudioClock;
  private readonly _latency: AudioLatency;
  private readonly _statistics: AudioStatistics;

  private _endOfStream = false;
  private _flushRequested = false;
  private _chunksIngested = 0;

  constructor(
    config: AudioPipelineConfig,
    clock: IAudioClock,
    latency: AudioLatency,
    statistics: AudioStatistics
  ) {
    this.direction = config.direction;
    this._clock = clock;
    this._latency = latency;
    this._statistics = statistics;
    this._buffer = new AudioBuffer();
    this._scheduler = new AudioScheduler(config.schedulerConfig ?? {});
  }

  // ─── Write Path ──────────────────────────────────────────────────────────

  /**
   * Ingests a new audio chunk into the pipeline buffer.
   *
   * Records latency and statistics, then appends to the buffer.
   * Call `tick()` after one or more `ingest()` calls to produce a result.
   *
   * @param chunk - The audio chunk to buffer.
   */
  ingest(chunk: AudioChunk): void {
    const now = this._clock.now();
    this._latency.recordReceive(chunk.timestamp, now);
    this._statistics.recordChunk(this.direction, chunk.sequence, chunk.durationMs, now);
    this._buffer.append(chunk);
    this._statistics.setBufferDepth(this.direction, this._buffer.size());
    this._chunksIngested += 1;
  }

  // ─── Scheduling Tick ─────────────────────────────────────────────────────

  /**
   * Evaluates the current buffer state and returns a scheduling result.
   *
   * The caller (AudioEngine) acts on `result.chunksToSend` to deliver audio
   * to the downstream consumer.
   *
   * @param playbackDebtMs - Estimated playback debt; pass null if unknown.
   */
  tick(playbackDebtMs: Nullable<number> = null): PipelineResult {
    const enteredAt = this._clock.now();
    const snapshot = this._buffer.snapshot();

    const decision = this._scheduler.decide({
      buffer: snapshot,
      direction: this.direction,
      endOfStream: this._endOfStream,
      flushRequested: this._flushRequested,
      playbackDebtMs,
    });

    let chunksToSend: readonly AudioChunk[];

    switch (decision.action) {
      case 'flush':
        chunksToSend = this._buffer.drain();
        this._flushRequested = false;
        break;

      case 'send_now':
        chunksToSend = decision.sendBatchSize
          ? this._buffer.drainUpTo(decision.sendBatchSize)
          : this._buffer.drain();
        break;

      case 'merge':
        chunksToSend = decision.mergeTargetMs
          ? this._buffer.drainDuration(decision.mergeTargetMs)
          : this._buffer.drainUpTo(1);
        break;

      case 'drop':
        this._buffer.clear();
        chunksToSend = [];
        break;

      case 'hold':
      default:
        chunksToSend = [];
        break;
    }

    this._statistics.setBufferDepth(this.direction, this._buffer.size());

    if (chunksToSend.length > 0) {
      const exitedAt = this._clock.now();
      this._latency.recordProcessing(enteredAt, exitedAt);
    }

    return {
      chunksToSend,
      action: decision.action,
      reason: decision.reason,
      bufferDepth: this._buffer.size(),
      bufferDurationMs: this._buffer.totalDurationMs(),
    };
  }

  // ─── Control ─────────────────────────────────────────────────────────────

  /**
   * Signals end-of-stream for this direction. The next `tick()` will flush
   * any remaining buffered chunks regardless of fill level.
   */
  signalEndOfStream(): void {
    this._endOfStream = true;
  }

  /**
   * Requests an immediate flush on the next `tick()`.
   * Used by the orchestrator when a barge-in cancels the outbound stream.
   */
  requestFlush(): void {
    this._flushRequested = true;
  }

  /**
   * Clears the buffer and resets flush/EOS flags without resetting statistics.
   */
  reset(): void {
    this._buffer.clear();
    this._endOfStream = false;
    this._flushRequested = false;
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  /** Current number of chunks in the buffer. */
  get bufferDepth(): number {
    return this._buffer.size();
  }

  /** Current total buffered audio duration in milliseconds. */
  get bufferDurationMs(): number {
    return this._buffer.totalDurationMs();
  }

  /** Total chunks ingested since construction. */
  get chunksIngested(): number {
    return this._chunksIngested;
  }

  /** Whether end-of-stream has been signalled. */
  get isEndOfStream(): boolean {
    return this._endOfStream;
  }
}
