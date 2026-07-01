---
name: V2 call activation gap
description: RuntimeIntegration.start() was missing from the live production V2 path, causing zero diagnostics logs and no real OpenAI Realtime connection.
---

## The rule
`V2CallActivator.activateV2Session(ctx)` MUST be called immediately after `ctx.transportGateway.accept()` in the V2 router (`wsServer.ts`). Without it, the pipeline is wired but never started.

**Why:** `SessionFactory.createSession()` builds a `SessionContext` with a stub `providerSession` (no-op). The real OpenAI WebSocket is only opened by `RuntimeIntegration.start()` → `RealtimeBridge.connect()` → `providerSession.connect()`. If `start()` is never called, there is no OpenAI connection, no audio flow, and no `TurnDiagnosticsCollector` attachment.

**How to apply:** Any time `transportGateway.accept()` is called to hand a WebSocket to V2, follow it immediately with `void activateV2Session(ctx).catch(log)`. The activator handles campaign load, provider session open, integration assembly, start, and cleanup-on-disconnect registration.

## Production call flow (V2)
1. `/test-call` or `/api/leads/:id/call` → `getV2Coordinator().createSession({ campaignId, phone })` — registers stub session
2. Exotel WebSocket arrives at `/exotel-stream` → V2 Router in `wsServer.ts` finds session by callSid/phone
3. `ctx.transportGateway.accept(ws, ...)` — wires socket callbacks
4. **`activateV2Session(ctx)`** — loads campaign, opens real `IOpenAIRealtimeSession`, `IntegrationFactory.create()`, `integration.start()`, registers `transport.disconnected` cleanup
5. `RealtimeBridge.connect()` fires → `TurnDiagnosticsCollector.attach()` → `[TURN-DIAGNOSTICS]` logs appear

## Key files
- `server/voice-engine/migration/V2CallActivator.ts` — the activation function (new)
- `server/wsServer.ts` — calls `activateV2Session()` after `transportGateway.accept()`
- `server/voice-engine/integration/IntegrationFactory.ts` — assembles RuntimeIntegration
- `server/voice-engine/integration/RealtimeBridge.ts` — diagnostics attach in `connect()`, JSON persist in `disconnect()`

## JSON persistence
On call end, `RealtimeBridge._persistCallSummaryJson()` writes to:
`logs/call-diagnostics/call_<ISO-timestamp>_<sessionId>.json`
Never throws — errors are swallowed to protect the disconnect path.
