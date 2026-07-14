---
name: V2 chipmunk / fast audio fix
description: gpt-realtime model ignores audio/pcmu output format; PCM16 bytes passed raw to Exotel cause chipmunk audio. Fix requires VOICE_OUTPUT_FORMAT=pcm + encoding-aware durationMs.
---

## The rule
`VOICE_OUTPUT_FORMAT` must be set to `pcm` for the V2 voice pipeline. Never leave it unset (pcmu default is broken with gpt-realtime).

**Why:** The `gpt-realtime` model does not honor `audio/pcmu` (G.711 µ-law) output format in the nested `audio.output.format.type` session config field. It silently falls back to its native PCM16 output. With `VOICE_OUTPUT_FORMAT` unset, `ExotelAdapter.encodeOutboundAudio` does a passthrough (pcmu mode = no conversion), so raw PCM16 bytes reach Exotel. Exotel interprets them as G.711 µ-law 8kHz → codec mismatch → 2–6× playback speed → chipmunk/unintelligible voice.

**How to apply:**
1. `VOICE_OUTPUT_FORMAT=pcm` env var — asks OpenAI for PCM16 (definitely supported), tells ExotelAdapter to call `pcm16ToMulaw()` on every outbound delta.
2. `IntegrationFactory.ts` must pass `{ audioFormat: { sampleRate: 8000, encoding: 'pcm16' } }` to `OutboundAudioFlow` when in pcm mode. This was fixed to read `VOICE_OUTPUT_FORMAT` and set `defaultAudioFormat` accordingly.
3. `OutboundAudioFlow._buildChunk` durationMs formula must be bytes-per-sample aware: PCM16 = 2 bytes/sample (byteRate = sampleRate × 2), µ-law = 1 byte/sample. Without this, pacing is 2× too slow (choppy gaps between chunks).

## Three-component fix (all required)
| Component | Change |
|---|---|
| Env var | `VOICE_OUTPUT_FORMAT=pcm` |
| `IntegrationFactory.ts` | Derive `defaultAudioFormat` from `VOICE_OUTPUT_FORMAT`; pass `{ sampleRate:8000, encoding:'pcm16' }` in pcm mode |
| `OutboundAudioFlow._buildChunk` | `bytesPerSample = encoding===pcm16 ? 2 : 1`; `byteRate = sampleRate * bytesPerSample`; `durationMs = byteLength/byteRate*1000` |

## Key facts
- `pcm16ToMulaw` in `PcmMulawCodec.ts` does NOT resample — it only encodes. It is correct when OpenAI sends 8kHz PCM16 (which it does for telephony sessions with g711_ulaw input).
- The `PcmMulawCodec.ts` comment explicitly confirms OpenAI emits 8kHz mono PCM in pcm mode for telephony sessions — `audio/pcm` with g711_ulaw input → 8kHz output.
- The `audio/pcmu` format in the gpt-realtime nested session config was confirmed broken in practice (chipmunk symptom) despite the comment saying it was tested.
- `VOICE_OUTPUT_FORMAT` is a dual-key: it controls BOTH `OpenAIRealtimeSession._resolveOutputAudioMime()` (what OpenAI is asked to emit) AND `ExotelAdapter.encodeOutboundAudio()` (what conversion is applied). Both sides must be consistent.
