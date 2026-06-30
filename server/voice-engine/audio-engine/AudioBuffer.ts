/**
 * @module AudioBuffer
 *
 * FIFO queue for `AudioChunk` objects flowing through the audio pipeline.
 *
 * ## Purpose
 * `AudioBuffer` is the central accumulator used by the pipeline to stage
 * inbound or outbound audio before scheduling decisions are applied.
 * It tracks metadata — total duration, byte size, and sequence gaps —
 * without performing any codec operations.
 *
 * ## Ownership
 * One buffer per direction per `AudioEngine` instance.
 * The `AudioPipeline` owns the buffer and is the sole writer.
 * The `AudioScheduler` reads from the buffer via the pipeline.
 *
 * ## Thread Safety
 * All methods are synchronous. Access must be serialised by the pipeline's
 * async event loop; concurrent reads and writes produce undefined behaviour.
 */

import type { Nullable } from '../types/index.js';
import type { AudioChunk } from './AudioChunk.js';

/**
 * Snapshot of buffer state at a point in time.
 */
export interface AudioBufferSnapshot {
  /** Number of chunks currently in the buffer. */
  readonly chunkCount: number;
  /** Sum of `durationMs` for all buffered chunks. */
  readonly totalDurationMs: number;
  /** Sum of payload byte sizes for all buffered chunks. */
  readonly totalBytes: number;
  /** Sequence number of the first chunk, or null if empty. */
  readonly headSequence: Nullable<number>;
  /** Sequence number of the last chunk, or null if empty. */
  readonly tailSequence: Nullable<number>;
}

/**
 * FIFO queue for audio chunks.
 */
export class AudioBuffer {
  private readonly _queue: AudioChunk[] = [];
  private _totalDurationMs = 0;
  private _totalBytes = 0;
  private _appendCount = 0;
  private _drainCount = 0;

  // ─── Queries ──────────────────────────────────────────────────────────────

  /**
   * Number of chunks currently in the buffer.
   */
  size(): number {
    return this._queue.length;
  }

  /**
   * `true` if the buffer holds no chunks.
   */
  isEmpty(): boolean {
    return this._queue.length === 0;
  }

  /**
   * Accumulated duration in milliseconds of all buffered chunks.
   */
  totalDurationMs(): number {
    return this._totalDurationMs;
  }

  /**
   * Total payload bytes across all buffered chunks.
   */
  totalBytes(): number {
    return this._totalBytes;
  }

  /**
   * Returns the oldest chunk without removing it, or null if the buffer is empty.
   */
  peek(): Nullable<Readonly<AudioChunk>> {
    return this._queue[0] ?? null;
  }

  /**
   * Returns a point-in-time snapshot of buffer metadata.
   */
  snapshot(): AudioBufferSnapshot {
    return Object.freeze<AudioBufferSnapshot>({
      chunkCount: this._queue.length,
      totalDurationMs: this._totalDurationMs,
      totalBytes: this._totalBytes,
      headSequence: this._queue[0]?.sequence ?? null,
      tailSequence: this._queue[this._queue.length - 1]?.sequence ?? null,
    });
  }

  /**
   * Total number of chunks ever appended (monotonically increasing).
   */
  get appendCount(): number {
    return this._appendCount;
  }

  /**
   * Total number of chunks ever drained (monotonically increasing).
   */
  get drainCount(): number {
    return this._drainCount;
  }

  // ─── Commands ─────────────────────────────────────────────────────────────

  /**
   * Appends a chunk to the tail of the buffer.
   *
   * @param chunk - The chunk to enqueue.
   */
  append(chunk: AudioChunk): void {
    this._queue.push(chunk);
    this._totalDurationMs += chunk.durationMs;
    this._totalBytes += this._byteLength(chunk.payload);
    this._appendCount += 1;
  }

  /**
   * Removes and returns all chunks from the buffer, oldest first.
   * Resets all accumulator fields.
   */
  drain(): readonly AudioChunk[] {
    if (this._queue.length === 0) return [];
    const drained = this._queue.splice(0);
    this._totalDurationMs = 0;
    this._totalBytes = 0;
    this._drainCount += drained.length;
    return drained;
  }

  /**
   * Removes and returns up to `maxChunks` from the head of the buffer.
   * Useful when the scheduler wants partial drains.
   *
   * @param maxChunks - Maximum number of chunks to remove.
   */
  drainUpTo(maxChunks: number): readonly AudioChunk[] {
    const count = Math.min(maxChunks, this._queue.length);
    if (count === 0) return [];
    const drained = this._queue.splice(0, count);
    for (const chunk of drained) {
      this._totalDurationMs -= chunk.durationMs;
      this._totalBytes -= this._byteLength(chunk.payload);
    }
    this._drainCount += drained.length;
    return drained;
  }

  /**
   * Removes and returns up to `maxDurationMs` worth of audio from the buffer.
   * Returns all chunks whose cumulative duration fits within the requested window.
   *
   * @param maxDurationMs - Maximum cumulative duration to drain.
   */
  drainDuration(maxDurationMs: number): readonly AudioChunk[] {
    const result: AudioChunk[] = [];
    let accumulated = 0;
    while (this._queue.length > 0) {
      const head = this._queue[0];
      if (accumulated + head.durationMs > maxDurationMs) break;
      this._queue.shift();
      accumulated += head.durationMs;
      this._totalDurationMs -= head.durationMs;
      this._totalBytes -= this._byteLength(head.payload);
      result.push(head);
    }
    this._drainCount += result.length;
    return result;
  }

  /**
   * Discards all buffered chunks without returning them.
   */
  clear(): void {
    this._queue.length = 0;
    this._totalDurationMs = 0;
    this._totalBytes = 0;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _byteLength(payload: Uint8Array | string): number {
    if (typeof payload === 'string') {
      return Math.floor((payload.length * 3) / 4);
    }
    return payload.byteLength;
  }
}
