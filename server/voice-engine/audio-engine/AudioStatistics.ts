/**
 * @module AudioStatistics
 *
 * Stateful calculator for audio quality and performance metrics.
 *
 * ## Purpose
 * `AudioStatistics` accumulates per-chunk observations and computes derived
 * quality metrics: jitter, packet loss rate, buffer depth, and average chunk
 * duration. It does not export metrics — it only performs calculations.
 *
 * ## Ownership
 * Owned by `AudioEngine`. One instance per call.
 *
 * ## Thread Safety
 * All methods are synchronous. Must be called from the engine's
 * single-threaded async pipeline.
 */

import type { Nullable } from '../types/index.js';
import type { AudioDirection } from './AudioChunk.js';

/**
 * Accumulated statistics for one direction of audio flow.
 */
export interface DirectionalStats {
  /** Total chunks received for this direction. */
  readonly chunksReceived: number;
  /** Chunks lost (gaps in sequence numbers). */
  readonly chunksLost: number;
  /** Packet loss rate 0–1. */
  readonly packetLossRate: number;
  /** Average duration of received chunks in milliseconds. */
  readonly avgChunkDurationMs: Nullable<number>;
  /** Average inter-arrival jitter in milliseconds (RFC 3550 definition). */
  readonly jitterMs: Nullable<number>;
  /** Current number of chunks held in the engine buffer. */
  readonly bufferDepth: number;
}

/**
 * Complete statistics snapshot for both audio directions.
 */
export interface AudioStatisticsSnapshot {
  readonly inbound: DirectionalStats;
  readonly outbound: DirectionalStats;
}

/**
 * Mutable accumulator for one audio direction.
 */
class DirectionalAccumulator {
  private _chunksReceived = 0;
  private _chunksLost = 0;
  private _totalDurationMs = 0;
  private _bufferDepth = 0;
  private _lastSequence: Nullable<number> = null;
  private _lastArrivalMs: Nullable<number> = null;
  private _jitterMs: Nullable<number> = null;

  /**
   * Records the arrival of a new chunk, updating all accumulators.
   *
   * @param sequence    - The chunk's sequence number.
   * @param durationMs  - Audio duration of this chunk.
   * @param arrivalMs   - Wall-clock time when the chunk arrived.
   */
  recordChunk(sequence: number, durationMs: number, arrivalMs: number): void {
    if (this._lastSequence !== null && sequence > this._lastSequence + 1) {
      this._chunksLost += sequence - this._lastSequence - 1;
    }

    const interArrivalMs = this._lastArrivalMs !== null
      ? Math.max(0, arrivalMs - this._lastArrivalMs)
      : null;

    if (interArrivalMs !== null) {
      const deviation = Math.abs(interArrivalMs - durationMs);
      this._jitterMs = this._jitterMs === null
        ? deviation
        : this._jitterMs + (deviation - this._jitterMs) / 16;
    }

    this._chunksReceived += 1;
    this._totalDurationMs += durationMs;
    this._lastSequence = sequence;
    this._lastArrivalMs = arrivalMs;
  }

  /** Sets the current buffer depth (chunk count). */
  setBufferDepth(depth: number): void {
    this._bufferDepth = depth;
  }

  /** Produces a frozen snapshot of this direction's statistics. */
  snapshot(): DirectionalStats {
    const total = this._chunksReceived + this._chunksLost;
    return Object.freeze<DirectionalStats>({
      chunksReceived: this._chunksReceived,
      chunksLost: this._chunksLost,
      packetLossRate: total > 0 ? this._chunksLost / total : 0,
      avgChunkDurationMs: this._chunksReceived > 0
        ? this._totalDurationMs / this._chunksReceived
        : null,
      jitterMs: this._jitterMs,
      bufferDepth: this._bufferDepth,
    });
  }

  /** Resets all accumulators. */
  reset(): void {
    this._chunksReceived = 0;
    this._chunksLost = 0;
    this._totalDurationMs = 0;
    this._bufferDepth = 0;
    this._lastSequence = null;
    this._lastArrivalMs = null;
    this._jitterMs = null;
  }
}

/**
 * Calculates audio quality statistics for inbound and outbound streams.
 */
export class AudioStatistics {
  private readonly _inbound = new DirectionalAccumulator();
  private readonly _outbound = new DirectionalAccumulator();

  // ─── Recording ────────────────────────────────────────────────────────────

  /**
   * Records a received audio chunk for the given direction.
   *
   * @param direction  - 'inbound' or 'outbound'.
   * @param sequence   - Chunk sequence number.
   * @param durationMs - Chunk audio duration in milliseconds.
   * @param arrivalMs  - Wall-clock timestamp when the chunk arrived.
   */
  recordChunk(
    direction: AudioDirection,
    sequence: number,
    durationMs: number,
    arrivalMs: number
  ): void {
    this._accumulator(direction).recordChunk(sequence, durationMs, arrivalMs);
  }

  /**
   * Updates the current buffer depth for the given direction.
   * Should be called after each `AudioBuffer.append()` or `drain()`.
   *
   * @param direction - 'inbound' or 'outbound'.
   * @param depth     - Current chunk count in the buffer.
   */
  setBufferDepth(direction: AudioDirection, depth: number): void {
    this._accumulator(direction).setBufferDepth(depth);
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  /** Frozen stats for the inbound (caller → engine) stream. */
  inbound(): DirectionalStats {
    return this._inbound.snapshot();
  }

  /** Frozen stats for the outbound (engine → caller) stream. */
  outbound(): DirectionalStats {
    return this._outbound.snapshot();
  }

  /**
   * Returns a complete frozen snapshot for both directions.
   */
  snapshot(): Readonly<AudioStatisticsSnapshot> {
    return Object.freeze<AudioStatisticsSnapshot>({
      inbound: this._inbound.snapshot(),
      outbound: this._outbound.snapshot(),
    });
  }

  /**
   * Resets all accumulators for both directions.
   */
  reset(): void {
    this._inbound.reset();
    this._outbound.reset();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _accumulator(direction: AudioDirection): DirectionalAccumulator {
    return direction === 'inbound' ? this._inbound : this._outbound;
  }
}
