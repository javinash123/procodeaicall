/**
 * Standalone unit test for PcmMulawCodec (no test framework in this repo).
 *
 * Run with:
 *   npx tsx server/voice-engine/providers/exotel/__tests__/PcmMulawCodec.test.ts
 */

import assert from 'node:assert/strict';
import { encodeMulawSample, pcm16ToMulaw } from '../PcmMulawCodec.js';

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`  ok  — ${name}`);
}

console.log('PcmMulawCodec — unit tests');

// ── 1. PCM silence ───────────────────────────────────────────────────────────
check('silence: sample 0 encodes to standard μ-law silence byte 0xFF', () => {
  assert.equal(encodeMulawSample(0), 0xff);
});

check('silence: a full buffer of zero samples encodes to all 0xFF', () => {
  const sampleCount = 160; // 20ms @ 8kHz
  const pcm = Buffer.alloc(sampleCount * 2, 0); // int16 zeros
  const out = pcm16ToMulaw(pcm);

  assert.equal(out.length, sampleCount);
  for (const byte of out) assert.equal(byte, 0xff);
});

// ── 2. PCM sine wave ─────────────────────────────────────────────────────────
check('sine wave: encodes to a valid, non-constant μ-law byte stream', () => {
  const sampleRate = 8000;
  const freqHz = 440;
  const amplitude = 10000;
  const durationSamples = 160; // 20ms

  const pcm = Buffer.alloc(durationSamples * 2);
  for (let i = 0; i < durationSamples; i++) {
    const value = Math.round(amplitude * Math.sin((2 * Math.PI * freqHz * i) / sampleRate));
    pcm.writeInt16LE(value, i * 2);
  }

  const out = pcm16ToMulaw(pcm);

  assert.equal(out.length, durationSamples);
  for (const byte of out) {
    assert.ok(byte >= 0 && byte <= 0xff, `byte out of range: ${byte}`);
  }
  // A real sine wave must not collapse to a single repeated byte.
  const distinctValues = new Set(out);
  assert.ok(distinctValues.size > 1, 'expected varying μ-law bytes for a sine wave');
});

check('sine wave: equal-magnitude positive/negative samples differ only by sign bit', () => {
  // For a symmetric signal, +S and -S must produce codes that differ by
  // exactly the sign bit (0x80), since |sample| feeds the same segment table.
  for (const magnitude of [50, 500, 5000, 20000]) {
    const pos = encodeMulawSample(magnitude);
    const neg = encodeMulawSample(-magnitude);
    assert.equal(pos ^ neg, 0x80, `sign-bit mismatch at magnitude ${magnitude}`);
  }
});

// ── 3. PCM max amplitude ─────────────────────────────────────────────────────
check('max amplitude: +32767 encodes to 0x80', () => {
  assert.equal(encodeMulawSample(32767), 0x80);
});

check('max amplitude: -32768 encodes to 0x00', () => {
  assert.equal(encodeMulawSample(-32768), 0x00);
});

check('max amplitude: values above the clip ceiling saturate to the same code as the ceiling', () => {
  assert.equal(encodeMulawSample(32635), encodeMulawSample(40000));
  assert.equal(encodeMulawSample(-32635), encodeMulawSample(-40000));
});

console.log(`\n${passed} passed, 0 failed`);
