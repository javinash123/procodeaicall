/**
 * @module AudioScheduler
 *
 * Pure scheduling decision engine for audio chunks in the pipeline.
 *
 * ## Purpose
 * `AudioScheduler` evaluates the current buffer state and pipeline conditions
 * and returns a `SchedulingDecision` telling the pipeline what to do with the
 * next chunk(s). It contains no timers, no I/O, and no side effects — only
 * decisions based on the inputs it receives.
 *
 * ## Decision Actions
 * - `send_now` — deliver the buffered chunks immediately to the consumer.
 * - `hold`     — wait for more chunks before sending (under-run prevention).
 * - `drop`     — discard the current chunk (overdue, duplicate, or over-limit).
 * - `merge`    — coalesce multiple small chunks before sending.
 * - `flush`    — drain the entire buffer regardless of fill level (end of stream).
 *
 * ## Ownership
 * Owned by `AudioPipeline`. One scheduler per direction.
 *
 * ## Thread Safety
 * All methods are synchronous and pure with respect to the input parameters.
 * No shared mutable state beyond configuration.
 */

import type { Nullable } from '../types/index.js';
import type { AudioDirection } from './AudioChunk.js';
import type { AudioBufferSnapshot } from './AudioBuffer.js';

/**
 * The action the pipeline should take for the current buffer state.
 */
export type SchedulingAction = 'send_now' | 'hold' | 'drop' | 'merge' | 'flush';

/**
 * A scheduling decision produced by `AudioScheduler.decide()`.
 */
export interface AudioSchedulingDecision {
  /** Recommended action for the pipeline to take. */
  readonly action: SchedulingAction;
  /** Human-readable rationale (for logging only). */
  readonly reason: string;
  /**
   * For `merge` — the recommended target duration in ms to merge toward.
   * Undefined for all other actions.
   */
  readonly mergeTargetMs?: number;
  /**
   * For `send_now` — maximum number of chunks to send in this batch.
   * Undefined means send all available.
   */
  readonly sendBatchSize?: number;
}

/**
 * Configuration for one direction's scheduler.
 */
export interface AudioSchedulerConfig {
  /**
   * Minimum buffer fill (ms) before the scheduler allows a send.
   * Prevents under-run by ensuring a minimum lookahead.
   */
  readonly minBufferMs: number;

  /**
   * Maximum buffer fill (ms). Above this threshold the scheduler emits `drop`
   * to shed excess latency.
   */
  readonly maxBufferMs: number;

  /**
   * Target chunk duration (ms) for `merge` decisions.
   * Chunks smaller than this threshold are eligible for merging.
   */
  readonly targetChunkMs: number;

  /**
   * Maximum number of chunks to emit in a single `send_now` batch.
   */
  readonly maxBatchSize: number;

  /**
   * When `true`, prefer `merge` over `send_now` for undersized chunks.
   */
  readonly preferMerge: boolean;
}

/**
 * Input snapshot passed to `AudioScheduler.decide()` on each pipeline tick.
 */
export interface AudioSchedulingInput {
  /** Current buffer state from `AudioBuffer.snapshot()`. */
  readonly buffer: AudioBufferSnapshot;
  /** Direction being evaluated. */
  readonly direction: AudioDirection;
  /** Whether the consumer has signalled end-of-stream. */
  readonly endOfStream: boolean;
  /** Whether the orchestrator has requested an immediate flush (e.g. barge-in). */
  readonly flushRequested: boolean;
  /**
   * Estimated playback debt in ms — how much audio the consumer has consumed
   * beyond what the buffer can currently supply. Null if unknown.
   */
  readonly playbackDebtMs: Nullable<number>;
}

/**
 * Default scheduler configuration suitable for telephony-grade audio (8kHz μ-law).
 */
export const DEFAULT_SCHEDULER_CONFIG: Readonly<AudioSchedulerConfig> = Object.freeze<AudioSchedulerConfig>({
  minBufferMs: 20,
  maxBufferMs: 2_000,
  targetChunkMs: 20,
  maxBatchSize: 10,
  preferMerge: false,
});

/**
 * Pure scheduling decision engine — no timers, no I/O, no side effects.
 */
export class AudioScheduler {
  private readonly _config: Readonly<AudioSchedulerConfig>;

  constructor(config: Partial<AudioSchedulerConfig> = {}) {
    this._config = Object.freeze<AudioSchedulerConfig>({
      ...DEFAULT_SCHEDULER_CONFIG,
      ...config,
    });
  }

  /**
   * Evaluates buffer state and pipeline conditions and returns the recommended
   * next action.
   *
   * @param input - Current pipeline snapshot.
   * @returns An `AudioSchedulingDecision` the pipeline should act upon.
   */
  decide(input: AudioSchedulingInput): AudioSchedulingDecision {
    const { buffer, endOfStream, flushRequested } = input;

    if (flushRequested) {
      return { action: 'flush', reason: 'Flush explicitly requested (e.g. barge-in)' };
    }

    if (endOfStream && buffer.chunkCount > 0) {
      return { action: 'flush', reason: 'End-of-stream — draining remaining buffer' };
    }

    if (buffer.chunkCount === 0) {
      return { action: 'hold', reason: 'Buffer empty — nothing to send' };
    }

    if (buffer.totalDurationMs > this._config.maxBufferMs) {
      return {
        action: 'drop',
        reason: `Buffer overflow: ${buffer.totalDurationMs}ms > max ${this._config.maxBufferMs}ms`,
      };
    }

    if (
      this._config.preferMerge &&
      buffer.chunkCount > 1 &&
      buffer.totalDurationMs < this._config.targetChunkMs
    ) {
      return {
        action: 'merge',
        reason: `Chunks too small (${buffer.totalDurationMs}ms) — merge toward ${this._config.targetChunkMs}ms`,
        mergeTargetMs: this._config.targetChunkMs,
      };
    }

    if (buffer.totalDurationMs < this._config.minBufferMs) {
      return {
        action: 'hold',
        reason: `Under minimum buffer (${buffer.totalDurationMs}ms < ${this._config.minBufferMs}ms)`,
      };
    }

    return {
      action: 'send_now',
      reason: `Buffer ready: ${buffer.totalDurationMs}ms (${buffer.chunkCount} chunks)`,
      sendBatchSize: this._config.maxBatchSize,
    };
  }

  /**
   * Returns the active scheduler configuration.
   */
  get config(): Readonly<AudioSchedulerConfig> {
    return this._config;
  }
}
