---
name: Inbound mulaw→PCM16 transcoding for OpenAI Realtime
description: OpenAI Realtime API ignores unrecognised input_audio_format values and silently defaults to pcm16. Exotel sends mulaw — without transcoding, VAD never fires.
---

## Rule
Always transcode inbound G.711 μ-law (Exotel) → PCM16 LE **before** calling `bridge.forwardAudio()`, and always set the OpenAI session `input audio format` to `audio/pcm`.

## Why
The GA gpt-realtime session schema uses MIME-type format strings (`audio/pcm`, `audio/pcmu`). OpenAI does **not** recognise `audio/pcmu` as a valid input format — it silently defaults to `pcm16`. Raw mulaw bytes then arrive looking like random noise to the VAD, so `input_audio_buffer.speech_started` never fires and the AI is permanently silent after the greeting.

Evidence from call trace: 1372 × `input_audio_buffer.append` sent, `speech_started = NO`, `[AudioCapture] Byte-for-byte identical: true` (mulaw passed through unchanged).

## How to apply
- `InboundAudioFlow.ts` — call `mulawToPcm16(Buffer.from(base64, 'base64'))` on each chunk before `bridge.forwardAudio()`.
- `OpenAIRealtimeSession._buildSessionConfig` — hardcode `format: { type: 'audio/pcm' as const }` for the input audio block.
- `PcmMulawCodec.ts` — contains both `mulawToPcm16` (decode, added) and `pcm16ToMulaw` (encode, pre-existing).

Do **not** use `_toAudioMime(this._config.inputAudioFormat)` for the input format — it maps `g711_ulaw → audio/pcmu` which OpenAI does not accept.
