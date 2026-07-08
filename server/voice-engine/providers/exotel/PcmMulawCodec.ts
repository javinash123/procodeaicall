/**
 * @module PcmMulawCodec
 *
 * Pure TypeScript G.711 μ-law encoder. No third-party codec libraries.
 *
 * ## Why this exists
 * When `VOICE_OUTPUT_FORMAT=pcm`, OpenAI is configured to emit raw 16-bit
 * PCM (8 kHz mono) instead of μ-law. Exotel's media WebSocket only accepts
 * G.711 μ-law payloads, so this module converts PCM → μ-law immediately
 * before the frame is handed to Exotel.
 *
 * ## Algorithm
 * Standard ITU-T G.711 μ-law compression:
 *   1. Extract sign, take absolute value.
 *   2. Clip to the standard 32635 ceiling.
 *   3. Add the standard bias (0x84 / 132).
 *   4. Find the exponent (segment) by locating the highest set bit.
 *   5. Extract a 4-bit mantissa from the segment.
 *   6. Pack sign|exponent|mantissa and bitwise-invert (μ-law convention).
 *
 * This is the encode half of the μ-law codec; it is independent of, and
 * does not replace, any other codec used elsewhere in the codebase.
 */

const MULAW_BIAS = 0x84; // 132 — standard G.711 μ-law bias
const MULAW_CLIP = 32635; // standard G.711 μ-law clip ceiling

/**
 * Encodes a single signed 16-bit PCM sample (range -32768..32767) to one
 * G.711 μ-law byte (range 0x00..0xFF).
 */
export function encodeMulawSample(sample: number): number {
  let sign = 0;

  if (sample < 0) {
    sign = 0x80;
    sample = -sample;
  }
  if (sample > MULAW_CLIP) sample = MULAW_CLIP;

  sample += MULAW_BIAS;

  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; mask >>= 1) {
    exponent--;
  }

  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/**
 * Converts a buffer of raw 16-bit little-endian PCM samples (as emitted by
 * OpenAI in `audio/pcm` mode) into a buffer of G.711 μ-law bytes — one
 * output byte per input sample.
 *
 * If the input length is odd (a stray trailing half-sample), that trailing
 * byte is dropped rather than guessed at.
 */
export function pcm16ToMulaw(pcm: Buffer): Buffer {
  const sampleCount = Math.floor(pcm.length / 2);
  const out = Buffer.allocUnsafe(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const sample = pcm.readInt16LE(i * 2);
    out[i] = encodeMulawSample(sample);
  }

  return out;
}
