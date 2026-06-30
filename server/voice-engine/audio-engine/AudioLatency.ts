/**
 * @module AudioLatency
 *
 * Executable latency calculator for the audio pipeline.
 *
 * ## Purpose
 * Tracks four distinct latency dimensions for each chunk flowing through the
 * engine, computes rolling averages, and exposes a snapshot for metrics and
 * logging. No metrics exporter lives here — only raw calculations.
 *
 * ## Latency Dimensions
 * - **Receive latency**     — time from chunk capture to engine receipt.
 * - **Processing latency**  — time spent inside the pipeline (decode, buffer, schedule).
 * - **Response latency**    — time from utterance commit to first outbound audio.
 * - **End-to-end latency**  — full round-trip from inbound capture to outbound playback.
 *
 * ## Ownership
 * Owned by `AudioEngine`. One instance per call.
 *
 * ## Thread Safety
 * All methods are synchronous. Must be called from the engine's single-threaded
 * async pipeline.
 */

import type { Timestamp, Nullable } from '../types/index.js';

/**
 * A point-in-time latency measurement for one chunk or event.
 */
export interface LatencySample {
  /** When the source event occurred (e.g. chunk received). */
  readonly capturedAt: Timestamp;
  /** When the engine processed this event. */
  readonly processedAt: Timestamp;
  /** Derived latency value in milliseconds. */
  readonly latencyMs: number;
}

/**
 * Snapshot of all latency dimensions at a point in time.
 */
export interface AudioLatencySnapshot {
  /** Average receive latency over the sample window (ms). */
  readonly avgReceiveLatencyMs: Nullable<number>;
  /** Average processing latency over the sample window (ms). */
  readonly avgProcessingLatencyMs: Nullable<number>;
  /** Most recently observed response latency (ms), or null if not yet measured. */
  readonly lastResponseLatencyMs: Nullable<number>;
  /** Most recently observed end-to-end latency (ms), or null if not yet measured. */
  readonly lastEndToEndLatencyMs: Nullable<number>;
  /** Total samples recorded across all dimensions. */
  readonly totalSamples: number;
}

/**
 * Rolling average calculator over a fixed window of samples.
 */
class RollingAverage {
  private readonly _window: number;
  private readonly _samples: number[] = [];
  private _sum = 0;

  constructor(windowSize: number) {
    this._window = windowSize;
  }

  push(value: number): void {
    this._samples.push(value);
    this._sum += value;
    if (this._samples.length > this._window) {
      this._sum -= this._samples.shift()!;
    }
  }

  average(): Nullable<number> {
    if (this._samples.length === 0) return null;
    return this._sum / this._samples.length;
  }

  count(): number {
    return this._samples.length;
  }
}

/**
 * Calculates and tracks audio latency across all pipeline dimensions.
 */
export class AudioLatency {
  private readonly _receive: RollingAverage;
  private readonly _processing: RollingAverage;
  private _lastResponseMs: Nullable<number> = null;
  private _lastEndToEndMs: Nullable<number> = null;
  private _totalSamples = 0;

  /**
   * @param rollingWindowSize - Number of recent samples to include in averages.
   *                            Defaults to 50.
   */
  constructor(rollingWindowSize = 50) {
    this._receive = new RollingAverage(rollingWindowSize);
    this._processing = new RollingAverage(rollingWindowSize);
  }

  // ─── Recording ────────────────────────────────────────────────────────────

  /**
   * Records how long it took for an inbound chunk to travel from the capture
   * device to the engine's receive handler.
   *
   * @param capturedAt - Timestamp embedded in the chunk (set at capture).
   * @param receivedAt - Timestamp when the engine received the chunk.
   */
  recordReceive(capturedAt: Timestamp, receivedAt: Timestamp): void {
    const latencyMs = Math.max(0, receivedAt - capturedAt);
    this._receive.push(latencyMs);
    this._totalSamples += 1;
  }

  /**
   * Records how long a chunk spent being processed by the pipeline
   * (buffering, scheduling, any transform decisions).
   *
   * @param pipelineEnteredAt - When the chunk entered the pipeline.
   * @param pipelineExitedAt  - When the pipeline finished with the chunk.
   */
  recordProcessing(pipelineEnteredAt: Timestamp, pipelineExitedAt: Timestamp): void {
    const latencyMs = Math.max(0, pipelineExitedAt - pipelineEnteredAt);
    this._processing.push(latencyMs);
    this._totalSamples += 1;
  }

  /**
   * Records the response latency — the time between committing an inbound
   * utterance and delivering the first outbound audio chunk.
   *
   * @param utteranceCommittedAt - When the engine committed the caller's utterance.
   * @param firstResponseChunkAt - When the first outbound audio chunk was ready.
   */
  recordResponse(utteranceCommittedAt: Timestamp, firstResponseChunkAt: Timestamp): void {
    this._lastResponseMs = Math.max(0, firstResponseChunkAt - utteranceCommittedAt);
    this._totalSamples += 1;
  }

  /**
   * Records the full end-to-end latency for a complete turn cycle.
   *
   * @param inboundCapturedAt  - When the inbound audio was captured.
   * @param outboundPlayedAt   - When the outbound audio began playing to the caller.
   */
  recordEndToEnd(inboundCapturedAt: Timestamp, outboundPlayedAt: Timestamp): void {
    this._lastEndToEndMs = Math.max(0, outboundPlayedAt - inboundCapturedAt);
    this._totalSamples += 1;
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  /** Rolling average receive latency in ms, or null if no samples yet. */
  averageReceiveLatencyMs(): Nullable<number> {
    return this._receive.average();
  }

  /** Rolling average processing latency in ms, or null if no samples yet. */
  averageProcessingLatencyMs(): Nullable<number> {
    return this._processing.average();
  }

  /** Most recent response latency in ms, or null if not yet measured. */
  lastResponseLatencyMs(): Nullable<number> {
    return this._lastResponseMs;
  }

  /** Most recent end-to-end latency in ms, or null if not yet measured. */
  lastEndToEndLatencyMs(): Nullable<number> {
    return this._lastEndToEndMs;
  }

  /**
   * Returns a frozen snapshot of all latency dimensions.
   */
  snapshot(): Readonly<AudioLatencySnapshot> {
    return Object.freeze<AudioLatencySnapshot>({
      avgReceiveLatencyMs:     this._receive.average(),
      avgProcessingLatencyMs:  this._processing.average(),
      lastResponseLatencyMs:   this._lastResponseMs,
      lastEndToEndLatencyMs:   this._lastEndToEndMs,
      totalSamples:            this._totalSamples,
    });
  }

  /**
   * Resets all recorded samples and counters.
   */
  reset(): void {
    this._lastResponseMs = null;
    this._lastEndToEndMs = null;
    this._totalSamples = 0;
  }
}
