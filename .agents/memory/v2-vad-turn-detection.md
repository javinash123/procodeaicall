---
name: V2 VAD — client-side silence detection
description: Server VAD (turn_detection: server_vad) doesn't work for gpt-realtime. Client-side energy-based VAD in RealtimeBridge is the fix.
---

## Rule
Use `turn_detection: null` in the session config and implement energy-based silence detection in `RealtimeBridge` rather than relying on OpenAI's server VAD.

## Why
Two problems with server VAD for `gpt-realtime`:
1. `audio.input.turn_detection` (nested schema) is silently ignored — `speech_started` never fires.
2. Top-level flat fields (`input_audio_format`, `turn_detection`, etc.) are rejected as `unknown_parameter` — the gpt-realtime model ONLY accepts the nested `audio` schema.

Both approaches for server VAD fail. The only reliable path is client-side VAD.

## How it works
`RealtimeBridge` contains a VAD state machine:
- `waiting_greeting` → `listening` on first `realtime.response_completed` (greeting done)
- `listening` → `in_speech` when PCM16 RMS ≥ 280
- `in_speech` → `responding` after 700ms of silence (≥ 120ms speech) → calls `provider.commitBuffer()` + `provider.createResponse()`
- `responding` → `listening` on next `realtime.response_completed`

RMS threshold 280, 700ms silence, 120ms min-speech — tuned for Exotel 8kHz mulaw upsampled to 24kHz PCM16.

## How to apply
- `_buildSessionConfig`: always set `audio.input.turn_detection: null`
- `IOpenAIRealtimeSession` and `OpenAIRealtimeSession`: expose `commitBuffer()` and `createResponse()` public methods
- `RealtimeBridge.forwardAudio()`: calls `_processClientVAD()` when in `listening` or `in_speech` state
- Never add flat top-level fields (`input_audio_format`, `output_audio_format`, `voice`, `turn_detection`) to `session.update` for gpt-realtime — they are rejected as unknown_parameter
