---
name: V2 input buffer desync + ClientVAD silence failure
description: ClientVAD silence detector never fires for Exotel phone audio; server VAD is the reliable solution. SessionSupervisor recordActivity never wired.
---

## Rule
Use OpenAI server VAD (nested under `audio.input.turn_detection`, NOT top-level — gpt-realtime schema).
Set `create_response: true` so server VAD auto-commits AND creates responses.
Wire `supervisor.recordActivity()` to `bridge.speech_detected` and `bridge.audio_ready` in RuntimeIntegration.

## Why — three confirmed bugs

**Bug 1: ClientVAD silence detection never fires for phone audio**
Exotel 8kHz µ-law audio has persistent background noise that keeps RMS above the 150 threshold continuously.
Result: every single turn committed via `max_turn_duration=14s`. 4 turns × 14s = 56s call with no real conversation.
Symptoms: every commit log says `Committing turn (max_turn_duration) speechMs=14000`.

**Bug 2: SessionSupervisor inactivity timeout fires while caller is speaking**
`recordActivity()` was never called after `supervisor.start()`. `_lastActivityAt` is set once at start and never updated.
With 14s-per-turn, the 30s supervisor timeout fires during turn 5's silence-detection wait.
Symptom: `SessionSupervisor: inactivity timeout exceeded, idleMs=30001` right after turn 4, while `[ClientVAD] Speech detected rms=7014`.

**Bug 3: Partial session.update reverts server VAD**
Sending `session.update` with only `{ instructions }` caused OpenAI to revert `turn_detection` to server_vad defaults.
Fixed: every session.update now sends `_buildSessionConfig(instructions)` (full config). Also resets `_inputBufferBytesSent = 0` after each update.

## turn_detection schema for gpt-realtime
- Place under `audio.input.turn_detection` — this is CORRECT for the `gpt-realtime` model
- Top-level `turn_detection` was the old `gpt-4o-realtime-preview` schema (now deprecated)
- `turn_detection: null` echoes back as "MISSING" in session.updated — that means it was applied (disabled)
- Settings: `{ type: 'server_vad', threshold: 0.4, prefix_padding_ms: 300, silence_duration_ms: 400, create_response: true, interrupt_response: true }`

## How to apply (OpenAIRealtimeSession.ts + RuntimeIntegration.ts)
- `_buildSessionConfig()`: server_vad with create_response:true under audio.input.turn_detection
- `updateInstructions()` + `response.done` handler: full config + `_inputBufferBytesSent = 0`
- `input_audio_buffer.committed` server event: `_inputBufferBytesSent = 0`
- `RuntimeIntegration`: bind `_onBridgeSpeech` and `_onBridgeAudio` to `supervisor.recordActivity()`, subscribe on start(), unsubscribe in stop() and shutdown()
- ClientVAD stays as max_turn_duration safety net; `_serverVadActive` flag prevents double-commit
