/**
 * @module AudioClock
 *
 * Monotonic clock abstraction for all time measurements within the audio engine.
 *
 * ## Purpose
 * Centralises all timestamp production behind a single interface. Pipeline
 * stages never call `Date.now()` directly — they receive an `IAudioClock`
 * via dependency injection. This makes timing deterministic in tests and
 * swappable in production (e.g. high-resolution process.hrtime-based clock).
 *
 * ## Thread Safety
 * `SystemAudioClock` is stateless except for the optional epoch anchor.
 * Safe to share across pipeline stages.
 */

import type { Timestamp } from '../types/index.js';

/**
 * Public contract for audio engine clocks.
 */
export interface IAudioClock {
  /**
   * Returns the current time as a millisecond Unix timestamp.
   * Implementations must be monotonically non-decreasing within a session.
   */
  now(): Timestamp;

  /**
   * Returns the number of milliseconds elapsed since `since`.
   * Equivalent to `now() - since` but communicates intent clearly.
   *
   * @param since - A past timestamp produced by this same clock.
   */
  elapsed(since: Timestamp): number;

  /**
   * Records the current instant as the epoch for this clock instance.
   * Subsequent calls to `elapsed(0)` will measure from this point.
   */
  reset(): void;
}

/**
 * Production clock backed by `Date.now()`.
 *
 * This is the ONLY location in the audio engine where `Date.now()` is called.
 * All other modules receive an `IAudioClock` via injection.
 */
export class SystemAudioClock implements IAudioClock {
  private _epoch: Timestamp;

  constructor() {
    this._epoch = Date.now();
  }

  /** @inheritdoc */
  now(): Timestamp {
    return Date.now();
  }

  /** @inheritdoc */
  elapsed(since: Timestamp): number {
    return Date.now() - since;
  }

  /**
   * Resets the epoch anchor to the current instant.
   * After calling `reset()`, `elapsed(this._epoch)` returns near-zero.
   */
  reset(): void {
    this._epoch = Date.now();
  }

  /**
   * Returns elapsed milliseconds since the most recent `reset()` call
   * (or construction time if `reset()` was never called).
   */
  sinceEpoch(): number {
    return Date.now() - this._epoch;
  }
}
