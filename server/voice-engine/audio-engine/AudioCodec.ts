/**
 * @module AudioCodec
 *
 * Codec capability registry for the audio engine.
 *
 * ## Purpose
 * Defines the interface that codec implementations must satisfy and provides
 * a registry for looking up capabilities by encoding name. This module contains
 * NO codec implementation — only interfaces, capability descriptors, and the
 * codec registry abstraction.
 *
 * ## Adding a Codec
 * 1. Create a separate implementation file (outside this module).
 * 2. Implement `ICodecDescriptor`.
 * 3. Register it with `CodecRegistry.register()` at bootstrap.
 *
 * ## Supported Encodings
 * - `pcm`      — Signed 8-bit linear PCM
 * - `pcm16`    — Signed 16-bit linear PCM (little-endian)
 * - `linear16` — Synonym for pcm16, used by some telephony APIs
 * - `mulaw`    — G.711 μ-law (8kHz, 8-bit)
 * - `alaw`     — G.711 A-law (8kHz, 8-bit)
 * - `opus`     — Opus variable-bitrate codec
 */

import type { AudioEncoding } from './AudioChunk.js';
import { VoiceEngineError, ErrorCode } from '../errors/index.js';

// ─── Codec Capability Descriptor ─────────────────────────────────────────────

/**
 * Describes the properties and constraints of one audio codec.
 * Implementations are registered in the `CodecRegistry`; this module
 * does not implement any codec itself.
 */
export interface ICodecDescriptor {
  /** The encoding this descriptor covers. */
  readonly encoding: AudioEncoding;

  /** Human-readable codec name (e.g. "G.711 μ-law"). */
  readonly displayName: string;

  /** Supported sample rates in Hz. */
  readonly supportedSampleRates: readonly number[];

  /** Whether this codec produces variable-bitrate output. */
  readonly isVariableBitrate: boolean;

  /**
   * Typical bits-per-sample for fixed-bitrate codecs.
   * Undefined for variable-bitrate codecs like Opus.
   */
  readonly bitsPerSample?: number;

  /**
   * Approximate bytes per millisecond at the default sample rate.
   * Used by the buffer and scheduler for capacity calculations.
   */
  readonly bytesPerMs: number;
}

// ─── Static Descriptors ───────────────────────────────────────────────────────

/**
 * Read-only capability descriptor for each supported encoding.
 * These describe the codec contracts only — no processing logic.
 */
export const CODEC_DESCRIPTORS: Readonly<Record<AudioEncoding, ICodecDescriptor>> = Object.freeze({
  pcm: {
    encoding: 'pcm',
    displayName: 'PCM (8-bit signed)',
    supportedSampleRates: [8_000, 16_000, 22_050, 44_100, 48_000],
    isVariableBitrate: false,
    bitsPerSample: 8,
    bytesPerMs: 8,             // 8 kHz × 1 byte/sample ÷ 1000
  },
  pcm16: {
    encoding: 'pcm16',
    displayName: 'PCM16 (16-bit signed, little-endian)',
    supportedSampleRates: [8_000, 16_000, 22_050, 44_100, 48_000],
    isVariableBitrate: false,
    bitsPerSample: 16,
    bytesPerMs: 32,            // 16 kHz × 2 bytes/sample ÷ 1000
  },
  linear16: {
    encoding: 'linear16',
    displayName: 'Linear16 (16-bit PCM, telephony alias)',
    supportedSampleRates: [8_000, 16_000],
    isVariableBitrate: false,
    bitsPerSample: 16,
    bytesPerMs: 16,            // 8 kHz × 2 bytes/sample ÷ 1000
  },
  mulaw: {
    encoding: 'mulaw',
    displayName: 'G.711 μ-law',
    supportedSampleRates: [8_000],
    isVariableBitrate: false,
    bitsPerSample: 8,
    bytesPerMs: 8,             // 8 kHz × 1 byte/sample ÷ 1000
  },
  alaw: {
    encoding: 'alaw',
    displayName: 'G.711 A-law',
    supportedSampleRates: [8_000],
    isVariableBitrate: false,
    bitsPerSample: 8,
    bytesPerMs: 8,             // 8 kHz × 1 byte/sample ÷ 1000
  },
  opus: {
    encoding: 'opus',
    displayName: 'Opus (variable bitrate)',
    supportedSampleRates: [8_000, 12_000, 16_000, 24_000, 48_000],
    isVariableBitrate: true,
    bitsPerSample: undefined,
    bytesPerMs: 4,             // ~32 kbps at 8kHz, conservative estimate
  },
});

// ─── Codec Registry ───────────────────────────────────────────────────────────

/**
 * Runtime registry that maps encoding names to descriptor instances.
 *
 * Initialised with the static descriptors from `CODEC_DESCRIPTORS`.
 * Additional descriptors can be registered via `register()` for custom codecs.
 */
export class CodecRegistry {
  private readonly _descriptors: Map<AudioEncoding, ICodecDescriptor>;

  constructor() {
    this._descriptors = new Map<AudioEncoding, ICodecDescriptor>(
      Object.entries(CODEC_DESCRIPTORS) as [AudioEncoding, ICodecDescriptor][]
    );
  }

  /**
   * Returns the capability descriptor for the given encoding.
   *
   * @throws {VoiceEngineError} if the encoding is not registered.
   */
  get(encoding: AudioEncoding): ICodecDescriptor {
    const descriptor = this._descriptors.get(encoding);
    if (!descriptor) {
      throw new VoiceEngineError(
        `AudioCodec: no descriptor registered for encoding '${encoding}'`,
        ErrorCode.AUDIO_DECODE_FAILED,
        false,
        { encoding }
      );
    }
    return descriptor;
  }

  /**
   * Returns `true` if the encoding is registered in this registry.
   */
  has(encoding: AudioEncoding): boolean {
    return this._descriptors.has(encoding);
  }

  /**
   * Registers a custom codec descriptor.
   * Overwrites an existing entry if the encoding is already present.
   */
  register(descriptor: ICodecDescriptor): void {
    this._descriptors.set(descriptor.encoding, descriptor);
  }

  /**
   * Returns all registered encodings.
   */
  encodings(): readonly AudioEncoding[] {
    return Array.from(this._descriptors.keys());
  }
}
