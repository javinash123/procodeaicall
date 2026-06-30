/**
 * @module AudioChunk
 *
 * Immutable model representing one discrete audio packet that flows through
 * the Voice Engine audio pipeline.
 *
 * ## Purpose
 * `AudioChunk` is the fundamental unit of audio in the engine. Every audio
 * payload — whether arriving from the telephony provider or being assembled
 * for playback — is wrapped in an `AudioChunk` before entering any pipeline
 * stage.
 *
 * ## Ownership
 * Chunks are produced by adapter code that interfaces with transport layers.
 * Once created, chunks are never mutated. Pipeline stages produce new chunks
 * rather than modifying existing ones.
 *
 * ## Thread Safety
 * All properties are readonly. Safe to share across pipeline stages without
 * defensive copying.
 */

import type { Timestamp } from '../types/index.js';

/**
 * Direction of audio flow relative to the engine.
 *
 * - `inbound`  — audio received from the caller (microphone → engine).
 * - `outbound` — audio to be played to the caller (engine → speaker).
 */
export type AudioDirection = 'inbound' | 'outbound';

/**
 * Supported payload formats for an `AudioChunk`.
 *
 * - `binary`  — raw bytes in a `Uint8Array`.
 * - `base64`  — base64-encoded string (common for WebSocket/JSON transports).
 */
export type AudioPayloadFormat = 'binary' | 'base64';

/**
 * Immutable audio packet that flows through the pipeline.
 */
export interface AudioChunk {
  /**
   * Monotonically increasing sequence number within a stream.
   * Used for gap detection and reordering.
   */
  readonly sequence: number;

  /**
   * Wall-clock timestamp (ms) when this chunk was received or created.
   */
  readonly timestamp: Timestamp;

  /**
   * Number of audio samples per second (e.g. 8000, 16000, 48000).
   */
  readonly sampleRate: number;

  /**
   * Audio encoding of the payload bytes.
   */
  readonly encoding: AudioEncoding;

  /**
   * Duration of the audio in this chunk, in milliseconds.
   */
  readonly durationMs: number;

  /**
   * The raw audio payload.
   * When `payloadFormat === 'binary'` this is a `Uint8Array`;
   * when `'base64'` this is a base64 string.
   */
  readonly payload: Uint8Array | string;

  /**
   * Format of `payload` — drives how downstream stages decode the chunk.
   */
  readonly payloadFormat: AudioPayloadFormat;

  /**
   * Direction of audio flow relative to the engine.
   */
  readonly direction: AudioDirection;

  /**
   * Optional track identifier (e.g. stream label, channel).
   */
  readonly trackId?: string;
}

/**
 * Supported audio encodings.
 * Matches the enum defined in `AudioCodec.ts`; kept here as a plain string
 * union so `AudioChunk` has no dependency on the codec registry.
 */
export type AudioEncoding =
  | 'pcm'
  | 'pcm16'
  | 'linear16'
  | 'mulaw'
  | 'alaw'
  | 'opus';

/**
 * Creates a new immutable `AudioChunk`. All fields are sealed with
 * `Object.freeze` to prevent accidental mutation.
 */
export function createAudioChunk(fields: AudioChunk): Readonly<AudioChunk> {
  return Object.freeze({ ...fields });
}

/**
 * Produces a new chunk derived from `base` with the specified overrides applied.
 * The original chunk is never modified.
 */
export function deriveAudioChunk(
  base: AudioChunk,
  overrides: Partial<AudioChunk>
): Readonly<AudioChunk> {
  return Object.freeze({ ...base, ...overrides });
}
