---
name: Exotel call quality — echo spirals, hallucinations, dead air
description: Durable root causes and fixes for the three pathological call patterns seen in test recordings
---

# Exotel Call Quality — Durable Lessons

## Lesson 1 — TTS playback gap causes echo spiral
**What:** `streamTTSToExotel()` sends chunks and returns, but the phone still plays them. `resetTurn()` already cleared `isSpeaking`, so echoing TTS audio passes VAD → Whisper → GPT → more TTS → more echo.  
**Fix:** Post-speech cooldown: `postSpeechCooldownUntil = now + playbackMs + 900ms` after normal completion, `now + 250ms` after barge-in (Clear already flushed Exotel buffer).  
**Secondary fix:** `isLikelyEcho()` — drop STT result if >45% word overlap with last 3 AI messages.  
**Why:** "Sent to Exotel" ≠ "played on phone." Always assume audio is still playing after streaming ends.

## Lesson 2 — Greeting timer race causes pre-greeting AI response
**What:** `sendGreeting` fires at 800ms; the silence timer also fires at 800ms. Connection noise triggers `processAudio` with empty history → AI generates a random call-ending phrase before introducing itself.  
**Fix:** `greetingDone: boolean` on `ExotelSession` (init `false`). Media handler breaks early if `!greetingDone`. `processAudio` returns early too. `sendGreeting` sets it `true` after chunks are sent, also in `catch` and in the early-return guard so it can never deadlock.  
**Why:** Any two `setTimeout` calls with the same delay race. Never let `processAudio` run before conversational context exists.

## Lesson 3 — cooldownBuffer + low threshold creates a new echo loop
**What:** During cooldown, audio with `rms > VAD_THRESHOLD (200)` was buffered "to recover a quick Yes." But phone echo at 8kHz typically peaks 300–500 RMS — well above 200. Echo chunks filled the buffer, were flushed at cooldown expiry, fed to Whisper, and triggered 30 consecutive AI response cycles ("Yes. Yes. Yes." loop).  
**Fix:** `COOLDOWN_BUFFER_MIN_RMS = 600`. Only buffer audio above typical echo energy; genuine caller speech reads 600+ RMS.  
**Why:** Recovering lost short responses is good, but the threshold must be above echo energy, not just above noise floor.

## Lesson 4 — Whisper hallucinates on phone echo/silence
**What:** On 8kHz phone audio with echo or near-silence, Whisper invents plausible words ("Yes.", "Right.", "vaccine") rather than returning empty. `no_speech_prob` = 0.506 for hallucinated segments; 0.182–0.491 for genuine speech.  
**Fixes (all in `transcribeAudio`):**  
  1. Min audio gate: **4800 bytes** (300ms at 8kHz slin16) — blocks sub-300ms noise bursts before Whisper sees them.  
  2. `response_format: "verbose_json"` + average `no_speech_prob >= 0.5` → return `""`.  
  3. `prompt: "Real estate property sales call about apartments."` — anchors Whisper vocabulary, reduces hallucination of unrelated words.  
  4. No-segment fallback: if Whisper returns no segments and the audio is <1.5s with >6 words, treat as hallucination.  
**Why:** Never trust a Whisper output on telephony audio without checking `no_speech_prob`. The 0.5 threshold is the empirical coin-flip boundary observed in test recordings.

## Lesson 5 — BARGE_IN_MIN_CHUNKS must stay at 3
**What:** Reducing to 2 (to catch short "Yes" barge-ins) allowed 200ms TTS echo bursts to trigger barge-in → Clear sent → AI cut off itself → echo chunks collected → Whisper hallucination → loop.  
**Fix:** Keep at 3 (≈300ms of sustained speech). The `no_speech_prob` filter is the correct primary defence against echo; barge-in sensitivity is the secondary one.  
**Why:** Every defensive layer interacts. Tuning one threshold can break another; reason about the full chain.

## Prompt rules that matter
- NEVER say "Thank you for your time / Have a great day" unless caller explicitly says goodbye — only the caller ends the call.  
- NEVER say "I can't access websites / I don't have access to the internet."  
- Never answer a direct question with another question.  
- `max_tokens=80`, `temperature=0.2`, QUALIFY stage on `userTurnCount ≤ 1`.

## Key numeric thresholds (tuned through 3 test calls)
| Constant | Value | Rationale |
|---|---|---|
| `SILENCE_TIMEOUT_MS` | 800ms | Feels responsive; allows natural pauses |
| `FORCE_PROCESS_MS` | 5000ms | Max utterance before forced STT |
| `VAD_THRESHOLD` | 200 RMS | Noise floor; below = silence |
| `BARGE_IN_THRESHOLD` | 700 RMS | Must be clearly above echo energy |
| `BARGE_IN_MIN_CHUNKS` | 3 | ≈300ms sustained; don't lower |
| `COOLDOWN_BUFFER_MIN_RMS` | 600 RMS | Above echo (300–500), below barge-in (700) |
| Post-speech cooldown | playbackMs + 900ms | Normal; 250ms after barge-in |
| Min STT audio gate | 4800 bytes | 300ms; below this = noise burst |
| Whisper nsp threshold | 0.5 | Drop transcript if avg nsp ≥ 0.5 |
