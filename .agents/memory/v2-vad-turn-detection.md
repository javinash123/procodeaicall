---
name: V2 VAD — server VAD schema and client VAD phone noise
description: turn_detection placement for gpt-realtime, and why energy-based client VAD is unusable for Exotel phone audio.
---

## Rule 1 — turn_detection placement
`turn_detection` for `gpt-realtime` must be at the **TOP LEVEL** of the `session.update` payload — NOT nested under `audio.input.turn_detection`.

## Why
Across 10+ live calls, nesting under `audio.input.turn_detection` caused `speech_started` to NEVER fire (confirmed: `speech_started: NO` in every call trace). Moving to top level is the correct schema for this model. This contradicts an earlier note about top-level fields being rejected — that note was wrong about `turn_detection` specifically. Only raw legacy fields like `input_audio_format` / `output_audio_format` (old flat schema) are rejected.

## Rule 2 — Client VAD is useless for phone audio
Exotel phone line audio after 8kHz mulaw → 24kHz PCM16 resampling has a persistent background noise floor of RMS **4500–7500**. Energy-based silence detection with any threshold in that range will always classify noise as "speech". `VAD_SPEECH_RMS = 150` caused 100% of turns to trigger via `max_turn_duration` (14s of fake speech), committing noise and generating self-responses.

**Fix:** Set `VAD_SPEECH_RMS = 15000` — effectively disabling client VAD trigger on phone noise. Do NOT call `createResponse()` from the `max_turn_duration` path; only drain (commit) the buffer. Server VAD's `create_response: true` handles all response creation.

## How to apply
- `_buildSessionConfig`: `turn_detection` at TOP LEVEL, not under `audio.input`
- `RealtimeBridge.VAD_SPEECH_RMS`: must be above phone noise floor (~7500); use 15000+
- `_commitTurn('max_turn_duration')`: commit buffer only — never call `createResponse()`
- `_commitTurn('silence_after_speech')`: can call `createResponse()` as fallback for missed server VAD
- Server VAD: `threshold: 0.2`, `silence_duration_ms: 600`, `create_response: true`
