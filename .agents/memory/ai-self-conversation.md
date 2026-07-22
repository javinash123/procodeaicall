---
name: AI self-conversation fix
description: AI was asking questions and immediately answering them itself during live calls — three root causes each required a separate fix.
---

# AI Self-Conversation Bug — Root Causes and Fixes

## The Symptom
During a real call the AI would ask a question ("Is this a good time?") and then immediately generate a hypothetical customer answer ("Yes, sure!") and continue the conversation — talking to itself without waiting for the caller.

## Three Layered Root Causes

### Cause 1 — `max_output_tokens` not set
Without a token cap, the Realtime API model generates an unlimited-length audio response. In practice it produces an entire conversation arc (greeting + hypothetical customer reply + response + next question) in a single audio clip.

**Fix:** Add `max_output_tokens: 250` to `_buildSessionConfig()` in `OpenAIRealtimeSession.ts`. This physically caps each AI turn to ~3-4 short sentences.

### Cause 2 — existingScript embedded verbatim with Customer: lines
Campaign scripts are often written in play-dialogue format (`Agent: ... / Customer: ...`). When embedded verbatim in the system prompt the model sees `Customer:` labels and treats the script as a template to continue — generating both sides.

**Fix:** `sanitizeScriptForPrompt()` in `SalesConversationPolicy.ts` strips all `Customer:` / `Caller:` / `User:` / `Client:` / `Prospect:` / `Lead:` lines and removes `Agent:` prefixes before the script is embedded. The script block label changed to "TALKING-POINTS — agent lines only".

### Cause 3 — Stage machine advanced on agent turns only (no customer gate)
`ConversationEvaluator` advanced stages after `minTurns` agent turns with no requirement that the customer had spoken. GREETING had `minTurns: 1`, so after the AI's first utterance the stage advanced to RAPPORT — the AI raced through the funnel talking to itself.

**Fix:** Added `CUSTOMER_TURN_COMPLETED` signal and `customerTurnsInCurrentStage` / `customerHasRespondedThisStage` tracking. Every stage evaluator now gates advancement on `customerHasRespondedThisStage === true`. The `input_audio_buffer.committed` server event fires the customer turn signal in `OpenAIRealtimeSession.ts`.

## Why These Three Must ALL Be Fixed Together
- Token cap alone: stops monologues but state machine still races through stages.
- Script sanitization alone: fixes one input vector but token cap is still absent.
- Customer gate alone: correct sequencing but model can still monologue 250+ tokens past a question.

## Key Files
- `server/voice-engine/providers/openai/OpenAIRealtimeSession.ts` — `_buildSessionConfig`, `max_output_tokens`, `input_audio_buffer.committed` handler
- `server/voice-engine/conversation/SalesConversationPolicy.ts` — `sanitizeScriptForPrompt`, salesFunnelSection
- `server/voice-engine/conversation-state/ConversationEvaluator.ts` — `customerHasRespondedThisStage` gate on every stage
- `server/voice-engine/conversation-state/ConversationProgress.ts` — `customerTurns` tracking
- `server/voice-engine/conversation/TurnControlPolicy.ts` — explicit prompt rules against self-answering

## Verification
`server/voice-engine/test-conversation-flow.ts` — 42 assertions, all pass. Run with `npx tsx server/voice-engine/test-conversation-flow.ts`.
