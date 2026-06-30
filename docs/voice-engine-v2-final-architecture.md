# NIJVOX Voice Engine V2 — Final Architecture Specification

**Document Type:** Final Frozen Architecture  
**Status:** FROZEN — implementation begins after this document  
**Replaces:** `docs/voice-engine-v2-architecture.md` (approved draft)  
**Scope:** Voice Engine subsystem only. Auth, Campaign Management, CRM, Dashboard, MongoDB, Express routing, and Exotel outbound REST are out of scope and remain untouched.  
**Scale Target:** 100,000 calls per day (~70 concurrent peak, engineered to 1,000 concurrent without redesign)

---

## Architecture Review Findings

The approved draft established correct structural principles: module boundaries, provider abstraction, session state shape, and deployment topology. This review identifies ten material gaps that must be resolved before implementation begins. They are addressed section by section, then synthesised into the final specification.

---

## Review Finding 1 — Real-Time Gap

**Verdict: The draft is not truly real-time. Three structural changes are required.**

### What real-time means for a voice engine

A voice agent is perceived as real-time when the caller hears the first word of the AI's response within 1,000 ms of finishing their own sentence. The draft's sequential pipeline does not achieve this.

### Gap 1.1 — STT requires a complete utterance before processing begins

The draft buffers the entire caller utterance, builds a WAV file, and uploads it to Whisper in a single HTTP request. No transcription begins until the caller finishes speaking and the 800 ms VAD silence timer fires.

**Real-time alternative:** Streaming STT providers (Deepgram Nova-2, Google STT v2 streaming, AssemblyAI Streaming) accept audio chunks incrementally and return partial transcripts in under 300 ms from the first spoken word. This allows LLM processing to begin before the caller finishes speaking — a technique called *speculative turn completion*.

The STTProvider interface must support both modes:

```
STTProvider
  // Non-streaming path (Whisper-compatible): upload → transcribe → return
  transcribe(frame: AudioFrame, options: STTOptions): Promise<STTResult>

  // Streaming path (optional — provider declares capability):
  streamTranscribe(options: STTOptions): STTStreamSession

STTStreamSession
  push(chunk: Buffer): void            ← feed audio incrementally
  on("partial", (text: string) => void)
  on("final",   (result: STTResult) => void)
  on("error",   (err: Error) => void)
  close(): void
```

Providers that implement only `transcribe` are valid. Providers that implement both unlock the streaming path. The `TurnOrchestrator` checks `provider.supportsStreaming` at startup and selects the appropriate path. This is a backwards-compatible extension of the existing interface.

### Gap 1.2 — LLM response is not streamed to TTS

The draft waits for the complete LLM response before beginning TTS synthesis. For an 80-token response, this adds ~400–600 ms of silence.

**Real-time alternative:** LLM streaming (token-by-token) feeds TTS sentence-by-sentence. When the LLM emits the first complete sentence (detected by punctuation: `.`, `?`, `!`, or a 200 ms stream pause), TTS synthesis begins for that sentence while the LLM continues generating the next. This is sentence-streaming pipelining.

The LLMProvider interface must support an optional streaming path:

```
LLMProvider
  // Non-streaming (all providers must implement)
  complete(messages: ConversationMessage[], options: LLMOptions): Promise<LLMResult>

  // Streaming (optional — provider declares capability)
  stream(messages: ConversationMessage[], options: LLMOptions): AsyncIterable<LLMChunk>

LLMChunk
  delta: string          ← incremental token text
  isFinal: boolean       ← true on last chunk
  tokensUsed?: number    ← populated on final chunk only
```

The `TurnOrchestrator` streams LLM tokens into a `SentenceBuffer` that flushes to `TTSService` on sentence boundaries. This eliminates 400–600 ms of perceived silence.

### Gap 1.3 — The 800 ms VAD silence timer is the dominant latency floor

The VAD silence timer waits 800 ms of silence before triggering STT. For short utterances ("Yes", "No", "Tell me more"), the caller experiences ~800 ms of dead air before any response is audible. Filler phrases mask this, but only partially.

**Improvement:** When streaming STT is active, the VAD timer can be reduced to 400 ms for utterances where the streaming STT has already returned a high-confidence final result. The timer is the safety net; streaming STT is the fast path.

```
Latency budget with all three improvements:

  VAD trigger (streaming STT fast path)  300 ms   (STT already has result)
  LLM first token                        200 ms
  Sentence boundary detection              50 ms
  TTS first chunk                        250 ms
  ─────────────────────────────────────────────
  Total perceived latency (P50)          800 ms   ← from caller-stops to agent-speaks
  Total perceived latency (P95)        1,200 ms

  Current draft (Whisper non-streaming):
  VAD silence timer                      800 ms
  STT upload + transcribe                900 ms
  LLM completion                         700 ms
  TTS first chunk                        400 ms
  ─────────────────────────────────────────────
  Total (P95)                          2,800 ms   — without filler masking
```

### Summary of real-time changes to the draft

| Change | Impact | Interface affected |
|---|---|---|
| Add `streamTranscribe` to STTProvider | -500 ms P95 | `stt/STTProvider.ts` |
| Add `stream` to LLMProvider | -400 ms P95 | `llm/LLMProvider.ts` |
| Add `SentenceBuffer` to pipeline | Enables LLM→TTS pipelining | `pipeline/` (new) |
| Reduce VAD timer to 400 ms when streaming STT confident | -400 ms P95 | `audio/VoiceActivityDetector.ts` |
| Retain non-streaming paths | Backwards compatibility | All providers |

---

## Review Finding 2 — Event-Driven Architecture

**Verdict: Yes. The engine must be event-driven. The synchronous function-call chain prevents future extensibility and creates invisible coupling between pipeline stages.**

### Why the current draft is not event-driven

In the draft, `TurnOrchestrator` calls `STTService.transcribe()`, awaits the result, calls `LLMService.complete()`, awaits the result, then calls `TTSService.synthesize()`. This is a synchronous chain. Adding any cross-cutting concern (analytics, supervisor monitoring, quality scoring) requires modifying `TurnOrchestrator` directly.

An event-driven design inverts this: each module *emits* what happened. Any module that cares about that event *subscribes*. New concerns are added by adding new subscribers, not by modifying existing code.

### The Internal Event Bus

The `EventBus` is a typed, synchronous, in-process pub/sub system. It does not use network I/O. It is not a message queue. It lives within a single Node.js process and uses synchronous iteration over subscriber arrays to guarantee delivery order and to allow error propagation.

```
EventBus
  emit<T extends VoiceEvent>(event: T): void
  on<T extends VoiceEvent>(type: T["type"], handler: (event: T) => void): Unsubscribe
  off(type: string, handler: Function): void
  onAny(handler: (event: VoiceEvent) => void): Unsubscribe
```

The bus is scoped per-session. Each `VoiceSession` owns one `EventBus` instance. There is no global bus. This provides natural isolation between concurrent calls.

### Event Catalogue

Every event carries a `sessionId`, `turnId` (when in a turn), and `timestampMs`.

**Transport Events**

| Event Type | Publisher | Payload |
|---|---|---|
| `transport.connected` | ExotelTransport | `streamSid`, `campaignId`, `mediaFormat` |
| `transport.media_received` | ExotelTransport | `rawBuffer`, `sequenceNumber` |
| `transport.stop_received` | ExotelTransport | `streamSid` |
| `transport.error` | ExotelTransport | `error`, `fatal: boolean` |
| `transport.media_sent` | ExotelTransport | `bytesSent`, `durationMs` |
| `transport.clear_sent` | ExotelTransport | `streamSid` |

**Audio Pipeline Events**

| Event Type | Publisher | Payload |
|---|---|---|
| `audio.frame_decoded` | AudioPipeline | `pcm16`, `rmsLevel`, `durationMs` |
| `audio.speech_start` | VoiceActivityDetector | `rmsLevel`, `voicedChunks` |
| `audio.speech_end` | VoiceActivityDetector | `trigger: "silence"\|"force"`, `totalDurationMs` |
| `audio.frame_discarded` | AudioPipeline | `reason: "cooldown"\|"min_gate"\|"silence"` |
| `audio.cooldown_buffer_flushed` | EchoGuard | `bufferedBytes`, `durationMs` |
| `audio.barge_in_detected` | BargeInController | `rmsLevel`, `bargeInCount` |
| `audio.echo_discarded` | EchoGuard | `overlapRatio`, `transcript` |

**STT Events**

| Event Type | Publisher | Payload |
|---|---|---|
| `stt.started` | STTService | `audioBytes`, `durationMs`, `provider` |
| `stt.partial` | STTService | `partialText`, `confidence` |
| `stt.completed` | STTService | `text`, `confidence`, `noSpeechProb`, `latencyMs`, `provider` |
| `stt.discarded` | STTService | `reason: "no_speech"\|"hallucination"\|"min_gate"`, `noSpeechProb` |
| `stt.error` | STTService | `error`, `provider`, `retryable`, `fallbackProvider` |

**LLM Events**

| Event Type | Publisher | Payload |
|---|---|---|
| `llm.started` | LLMService | `messageCount`, `promptTokens`, `stage`, `provider` |
| `llm.chunk` | LLMService | `delta`, `accumulatedText` |
| `llm.sentence_ready` | SentenceBuffer | `sentence`, `sentenceIndex` |
| `llm.completed` | LLMService | `text`, `tokensUsed`, `latencyMs`, `stage`, `provider` |
| `llm.forbidden_phrase_removed` | ForbiddenPhraseFilter | `phrase`, `finalText` |
| `llm.error` | LLMService | `error`, `provider`, `retryable`, `fallbackProvider` |

**TTS Events**

| Event Type | Publisher | Payload |
|---|---|---|
| `tts.started` | TTSService | `text`, `voice`, `provider` |
| `tts.first_chunk` | TTSService | `latencyMs`, `provider` |
| `tts.chunk_sent` | TTSService | `chunkBytes`, `cumulativePlaybackMs` |
| `tts.completed` | TTSService | `totalPlaybackMs`, `latencyMs`, `provider` |
| `tts.aborted` | TTSService | `reason: "barge_in"\|"error"`, `playedMs` |
| `tts.error` | TTSService | `error`, `provider`, `retryable` |
| `tts.filler_sent` | FillerService | `phrase`, `durationMs` |

**Pipeline (Turn) Events**

| Event Type | Publisher | Payload |
|---|---|---|
| `turn.started` | TurnOrchestrator | `userTurnCount`, `audioBytes` |
| `turn.completed` | TurnOrchestrator | `userTurnCount`, `totalDurationMs`, `transcript`, `response` |
| `turn.aborted` | TurnOrchestrator | `reason: "barge_in"\|"error"`, `stage` |

**Session Events**

| Event Type | Publisher | Payload |
|---|---|---|
| `session.created` | SessionManager | `streamSid`, `campaignId`, `nodeId` |
| `session.greeting_sent` | GreetingController | `durationMs` |
| `session.closed` | SessionManager | `reason`, `durationMs`, `totalTurns`, `bargeIns` |
| `session.state_changed` | SessionManager | `from: SessionState`, `to: SessionState` |
| `session.error` | SessionManager | `error`, `fatal: boolean` |

### Subscriber Map

| Subscriber | Events consumed |
|---|---|
| `MetricsCollector` | All events (aggregates into counters/histograms) |
| `Logger` | All events (structured log lines) |
| `TurnOrchestrator` | `audio.speech_end`, `audio.barge_in_detected`, `stt.completed`, `llm.completed`, `llm.sentence_ready` |
| `EchoGuard` | `tts.completed`, `tts.first_chunk` (to arm cooldown) |
| `BargeInController` | `audio.frame_decoded` (during `isSpeaking` state), `tts.started`, `tts.aborted` |
| `GreetingController` | `transport.connected` |
| `SessionManager` | `transport.connected`, `transport.stop_received`, `transport.error` |
| `PostCallAnalyzer` (future) | `session.closed`, `turn.completed` |
| `SupervisorStream` (future) | `stt.completed`, `llm.completed`, `turn.completed` |
| `QualityScorer` (future) | `session.closed` (reads all turns from session history) |

### Event Lifecycle

```
1. Publisher calls eventBus.emit(event)
2. EventBus iterates subscriber array synchronously
3. Each subscriber handler executes in call-stack order
4. If a subscriber throws, the error is caught, logged at warn level,
   and the next subscriber continues (bus is fault-tolerant)
5. emit() returns after all subscribers have been called
6. No event is queued, persisted, or retried by the bus itself
   (persistence belongs to subscribers like MetricsCollector)
```

The synchronous delivery model is intentional. Voice engine events are high-frequency (one per audio frame = ~100/second per call). An async/queued bus would add latency and complexity. Subscribers that need async work (e.g., writing to MongoDB) must handle their own async dispatch internally and return immediately from the handler.

---

## Review Finding 3 — Audio Pipeline Latency Analysis

**Every stage of the pipeline is catalogued below with its latency contribution and improvement path.**

### Full pipeline with latency attribution

```
Customer speaks
  │
  │  [PSTN / cellular network]
  │  Latency: 50–150 ms one-way propagation (fixed — not improvable)
  ▼
Exotel Media Stream Server
  │  Chunks audio into 20 ms frames of μ-law 8 kHz
  │  Sends as WebSocket binary frames
  │  Latency: 20–40 ms (frame accumulation + WS send)
  ▼
Server WebSocket receive
  │
  ├─ [Gate 1: Base64 decode]
  │    20–40 bytes → Buffer.from(payload, "base64")
  │    Latency: <0.1 ms per frame — negligible
  │
  ├─ [Gate 2: μ-law → PCM16 decode]
  │    Codec.mulawToInt16() — synchronous CPU
  │    Latency: <0.1 ms per 100ms chunk — negligible
  │
  ├─ [Gate 3: RMS energy measurement]
  │    Single pass over Int16Array
  │    Latency: <0.1 ms — negligible
  │
  ├─ [Gate 4a: Cooldown gate check]
  │    Timestamp comparison
  │    Latency: <0.01 ms — negligible
  │
  ├─ [Gate 4b/4c: VAD gate]
  │    Threshold comparison + push to mediaChunks array
  │    Latency: <0.1 ms — negligible
  │
  └─ [Gate 5: VAD silence timer]
       *** DOMINANT LATENCY #1 ***
       800 ms deliberate wait for caller to finish speaking
       Cannot be eliminated; can be reduced to 400 ms on streaming-STT fast path

───────── CALLER FINISHES SPEAKING — ENGINE WAKES UP ─────────

  │
  ├─ [Stage 6: Buffer flush + WAV construction]
  │    Concatenate mediaChunks + cooldownBuffer
  │    WavBuilder: prepend 44-byte RIFF header
  │    Latency: <1 ms for typical utterance (< 5 seconds)
  │    *** IMPROVABLE: use streaming STT to eliminate WAV construction entirely ***
  │
  ├─ [Stage 7: STT network call]
  │    *** DOMINANT LATENCY #2 ***
  │    Whisper HTTP POST: upload WAV + inference
  │    P50: 800 ms, P95: 1,500 ms, P99: 2,500 ms
  │    Bottlenecks:
  │      a) TCP connection setup (mitigate: HTTP keep-alive, connection pool)
  │      b) WAV upload time (mitigate: streaming STT — no upload)
  │      c) Model inference time (mitigate: Deepgram Nova-2 P50: 200 ms)
  │
  ├─ [Stage 8: Echo / hallucination guard]
  │    Word-overlap check + no_speech_prob check
  │    Latency: <1 ms — negligible
  │
  ├─ [Stage 9: History append + prompt build]
  │    String concatenation of system prompt + KB + history
  │    Latency: 1–5 ms for typical prompt — negligible
  │    *** WATCH: KB size — prompts > 8,000 tokens add measurable overhead ***
  │
  ├─ [Stage 10: LLM network call]
  │    *** DOMINANT LATENCY #3 ***
  │    GPT-4o HTTP POST: prompt → completion
  │    P50: 600 ms, P95: 1,400 ms, P99: 2,200 ms (for 80-token response)
  │    Bottlenecks:
  │      a) TTFT (time to first token): 300–700 ms
  │      b) Token generation: ~40 ms per token at gpt-4o speeds
  │    Mitigation: Stream tokens; pipeline first sentence to TTS immediately
  │
  ├─ [Stage 11: Forbidden phrase filter]
  │    Regex match against response string
  │    Latency: <1 ms — negligible
  │
  ├─ [Stage 12: TTS first chunk]
  │    *** DOMINANT LATENCY #4 ***
  │    OpenAI TTS HTTP POST → first audio chunk
  │    P50: 350 ms, P95: 700 ms, P99: 1,200 ms
  │    Mitigation: Sentence streaming — first sentence (~10 words) sent
  │                to TTS while LLM generates the rest
  │    Mitigation: Pre-warm TTS connection with HTTP keep-alive
  │
  ├─ [Stage 13: Audio encoding for Exotel]
  │    Resample 24 kHz PCM → 8 kHz PCM → μ-law
  │    Base64 encode
  │    Latency: <1 ms per chunk — negligible
  │    *** WATCH: runs synchronously in Node.js event loop on every chunk ***
  │    *** At 1,000 concurrent calls, this is ~1,000 × 10 ops/sec = 10,000 resamples/sec ***
  │    *** Monitor CPU; offload to worker_threads if usage > 60% ***
  │
  └─ [Stage 14: WebSocket send to Exotel]
       Exotel playout buffer receives first chunk
       Latency: <10 ms on same-region deployment
       *** CRITICAL: deploy server in same AWS region as Exotel's media servers ***

Customer hears first word
```

### Latency improvement priority table

| Latency Source | Current Cost | Improved Cost | Technique |
|---|---|---|---|
| VAD silence timer | 800 ms | 400 ms | Streaming STT fast path |
| STT (Whisper) | 800–1500 ms P95 | 150–350 ms P95 | Deepgram streaming |
| LLM TTFT | 300–700 ms | 300–700 ms | Unavoidable; mask with filler |
| LLM to TTS gap | 400–600 ms | ~0 ms | Sentence streaming pipeline |
| TTS first chunk | 350–700 ms | 200–400 ms | Sentence is shorter → faster |
| HTTP connection setup | 20–80 ms | <5 ms | Keep-alive pools per provider |
| Audio codec (resampling) | <1 ms/chunk | <1 ms/chunk | Watch at scale; use worker_threads |

### New module required: `SentenceBuffer`

Location: `pipeline/SentenceBuffer.ts`

Responsibility: Accepts LLM token chunks from the streaming path. Detects sentence boundaries (`.`, `!`, `?`, or 200 ms stream pause). Emits `llm.sentence_ready` events. The `TurnOrchestrator` subscribes to these events and calls `TTSService.synthesize()` for each sentence while LLM continues.

---

## Review Finding 4 — Provider Layer Completeness

**Verdict: Three providers are correctly abstracted (STT, LLM, TTS). One is missing: Telephony. One is under-specified: the Transport interface. VAD should be extensible but need not be a provider.**

### Gap 4.1 — Telephony is not a provider

The draft names `ExotelTransport` as a concrete class that the engine calls directly. The section on "Replacing Exotel Entirely" acknowledges this is the only Exotel-specific module, but provides no interface. If Exotel is replaced, the existing call sites in `TurnOrchestrator` and `pipeline/` break.

**Fix:** Define a `TelephonyProvider` interface. All pipeline code calls this interface. `ExotelTransport` is one implementation.

```
TelephonyProvider
  // Connection lifecycle
  accept(socket: WebSocket, request: IncomingMessage): void
  close(streamSid: string, reason: string): void

  // Inbound (telephony → engine)
  on(event: "connected",  handler: (e: TelephonyConnected) => void): void
  on(event: "media",      handler: (e: TelephonyMedia)    => void): void
  on(event: "stop",       handler: (e: TelephonyStop)     => void): void
  on(event: "error",      handler: (e: TelephonyError)    => void): void

  // Outbound (engine → telephony)
  sendAudio(streamSid: string, audioBuffer: Buffer): void
  clearBuffer(streamSid: string): void

  // Capability declaration
  readonly encoding: "mulaw" | "pcm16" | "opus"
  readonly sampleRate: number
  readonly supportsHalfDuplex: boolean

  TelephonyConnected { streamSid: string; callSid?: string; campaignId?: string }
  TelephonyMedia     { streamSid: string; payload: Buffer; sequenceNumber: number }
  TelephonyStop      { streamSid: string; reason?: string }
```

Providers registered under the key `"exotel"`, `"twilio"`, `"vonage"`, etc. The `Codec` layer reads `provider.encoding` and `provider.sampleRate` to determine the correct decode/encode path. No hardcoded μ-law assumption outside `ExotelTelephonyProvider`.

### Gap 4.2 — Provider interfaces must declare capabilities

The draft defines interfaces but does not define a capability-declaration mechanism. The `TurnOrchestrator` needs to know at startup whether to use the streaming or non-streaming path.

**Fix:** Add a `capabilities` object to each provider type:

```
STTProvider
  capabilities: {
    supportsStreaming:    boolean
    supportsLanguages:   string[]          ← ISO 639-1 codes
    minAudioMs:          number
    maxAudioMs:          number
    returnsConfidence:   boolean
    returnsSegments:     boolean
  }

LLMProvider
  capabilities: {
    supportsStreaming:    boolean
    maxContextTokens:    number
    supportsSystemRole:  boolean
    modelName:           string
  }

TTSProvider
  capabilities: {
    supportsStreaming:    boolean           ← always true for production providers
    supportedVoices:     string[]
    supportedEncodings:  AudioEncoding[]
    maxTextLength:       number
    supportsSSML:        boolean
  }

TelephonyProvider
  capabilities: {
    encoding:            AudioEncoding
    sampleRate:          number
    frameMs:             number
    supportsBargein:     boolean           ← sends Clear command
    supportsRecording:   boolean
  }
```

The `TurnOrchestrator` reads these at construction time and selects the execution path once, not per turn.

### Gap 4.3 — Provider health check

Each provider must expose a lightweight health check method:

```
STTProvider / LLMProvider / TTSProvider / TelephonyProvider
  ping(): Promise<{ ok: boolean; latencyMs: number }>
```

This is called by `HealthProbe` to populate the `/ready` response and by the circuit breaker during `HALF_OPEN` state.

### Revised Provider Registry

```
ProviderRegistry
  registerSTT(name, factory, defaultConfig?): void
  registerLLM(name, factory, defaultConfig?): void
  registerTTS(name, factory, defaultConfig?): void
  registerTelephony(name, factory, defaultConfig?): void

  resolveSTT(): STTProvider
  resolveLLM(): LLMProvider
  resolveTTS(): TTSProvider
  resolveTelephony(): TelephonyProvider

  healthCheck(): Promise<ProviderHealthReport>
```

Built-in registrations:

| Service | Key | Class | Streaming |
|---|---|---|---|
| STT | `"whisper"` | `WhisperSTTProvider` | No |
| STT | `"deepgram"` | `DeepgramSTTProvider` | Yes |
| STT | `"google"` | `GoogleSTTProvider` | Yes |
| LLM | `"openai"` | `OpenAILLMProvider` | Yes |
| LLM | `"anthropic"` | `AnthropicLLMProvider` | Yes |
| LLM | `"gemini"` | `GeminiLLMProvider` | Yes |
| TTS | `"openai"` | `OpenAITTSProvider` | Yes |
| TTS | `"elevenlabs"` | `ElevenLabsTTSProvider` | Yes |
| TTS | `"azure"` | `AzureTTSProvider` | Yes |
| Telephony | `"exotel"` | `ExotelTelephonyProvider` | N/A |
| Telephony | `"twilio"` | `TwilioTelephonyProvider` | N/A |

---

## Review Finding 5 — Session Management

**Verdict: The draft conflates serialisable state with in-process transient state. This must be explicitly split. Timers, audio buffers, and AbortControllers cannot be serialised to Redis.**

### The two-tier session model

Every `VoiceSession` in the engine has two layers:

**Layer A — `SerializableSessionState`** (survives Redis round-trip)

This is the only data that enters the `SessionStore`. It contains no Buffers, no Timers, no functions, no class instances.

```
SerializableSessionState {
  // Identity
  streamSid:             string
  campaignId:            string | undefined
  callSid:               string | undefined
  nodeId:                string

  // State machine
  state:                 SessionState
  userTurnCount:         number
  greetingDone:          boolean

  // Turn accounting
  bargeInCount:          number
  postSpeechCooldownUntil: number
  ttsPlaybackMs:         number

  // Conversation (text only — no audio)
  conversationHistory:   ConversationMessage[]
  campaignSnapshot:      CampaignSnapshot    ← serialisable subset of CampaignData

  // Lifecycle
  createdAt:             number
  lastActivityAt:        number
  closedAt:              number | undefined
}
```

**Layer B — `TransientSessionState`** (in-process only — never leaves the Node.js worker)

```
TransientSessionState {
  // Raw audio (large Buffers — not serialisable, not needed cross-node)
  mediaChunks:           Buffer[]
  cooldownBuffer:        Buffer[]
  firstChunkAt:          number | null
  voicedChunks:          number

  // Node.js timers (handles — not serialisable)
  silenceTimer:          NodeJS.Timeout | null
  forceTimer:            NodeJS.Timeout | null

  // In-flight request cancellation
  sttAbortController:    AbortController | null
  llmAbortController:    AbortController | null
  ttsAbortController:    AbortController | null

  // Turn lock
  processing:            boolean
  isSpeaking:            boolean

  // Per-session event bus
  eventBus:              EventBus

  // Per-session logger (child with session bindings)
  logger:                Logger
}
```

**`VoiceSession` is the union of both layers.** The `SessionManager` is responsible for keeping them in sync. When the serialisable layer is updated, `SessionManager.persist(session)` is called — this writes only `SerializableSessionState` to the store.

### Audio buffers

Raw audio buffers (`mediaChunks`, `cooldownBuffer`) are `Buffer[]` arrays that grow during a turn and are cleared after STT handoff. They must remain in `TransientSessionState` because:

1. Serialising them to Redis on every frame would add ~1 ms of latency per 20 ms audio chunk
2. They are only needed for the duration of a single utterance
3. If a node crashes mid-turn, the partial audio is unrecoverable regardless — the caller will simply repeat themselves

Maximum buffer size: `FORCE_PROCESS_MS (5000) / 100ms frame = 50 frames × 3200 bytes = 160 KB` per turn. At 1,000 concurrent calls, this is 160 MB of audio buffer memory — well within typical VPS capacity.

### Conversation history

Conversation history lives in `SerializableSessionState.conversationHistory`. It is written to Redis after each completed turn. This enables:
- Full history reconstruction if inspected from admin tools
- Post-call analysis services to read the full conversation
- (Future) supervisor monitoring to read live history

History is trimmed to a rolling window before LLM calls to stay within token budget. The trim is applied by `LLMService` when building the message array — it does not mutate the session history, only the LLM call's input.

Maximum history entries per session: 100 turns (approximately 10,000 tokens). Beyond this, the oldest user+assistant pairs are dropped from LLM context but retained in full in the session for post-call analysis.

### Timers

Timers (`silenceTimer`, `forceTimer`) live exclusively in `TransientSessionState`. They are `NodeJS.Timeout` handles. When a timer fires, it calls `eventBus.emit("audio.speech_end")`. The `TurnOrchestrator` subscribes to this event and begins processing.

On session teardown: `clearTimeout(silenceTimer)`, `clearTimeout(forceTimer)`, then `AbortController.abort()` on all in-flight requests.

### Barge-in interruption state

Barge-in is not a boolean flag; it is a state transition in the session state machine: `ACTIVE → BARGE_IN → ACTIVE`. The state machine transition is:

```
ACTIVE
  → [audio.barge_in_detected emitted]
  → BargeInController.handle():
       clearTimeout(silenceTimer)
       clearTimeout(forceTimer)
       ttsAbortController.abort()
       llmAbortController.abort()         ← also cancel LLM if in-flight
       transport.clearBuffer(streamSid)
       session.state = BARGE_IN
       session.postSpeechCooldownUntil = now + 250
       session.isSpeaking = false
       session.mediaChunks = triggering chunks
       eventBus.emit("turn.aborted")
  → new silenceTimer armed (400 ms for streaming, 800 ms for batch)
  → [audio.speech_end fires]
  → TurnOrchestrator.beginTurn()
  → session.state = ACTIVE
```

### Knowledge context

Campaign knowledge base (`campaignCache`) is loaded once per session on `transport.connected`. It is stored as `CampaignSnapshot` in `SerializableSessionState`:

```
CampaignSnapshot {
  campaignId:    string
  goal:          string
  script:        string
  knowledgeBase: string        ← pre-serialised KB text, max 4,000 tokens
  voice:         string
  language:      string
  fetchedAt:     number        ← timestamp for cache invalidation
  version:       number        ← increment when campaign is updated
}
```

If a campaign is updated mid-call, the snapshot is not refreshed (the call uses the version active when it started). The `fetchedAt` timestamp allows post-call analysis to know which version of the KB was in use.

---

## Review Finding 6 — Scalability Analysis

**The architecture supports 100 concurrent calls today, 500 with Redis, and 1,000 with four nodes and minor infrastructure changes. No engine code changes are required at any tier.**

### Tier 1: 100 concurrent calls

**Infrastructure:** Single node, PM2 cluster (4 workers), 4–8 CPU cores, 8 GB RAM, no Redis.

**Calculation:**
- 100 concurrent calls ÷ 4 workers = 25 calls per worker
- Each call: ~50 ms CPU per turn (codec + VAD + prompt build), ~0.5% CPU
- 25 calls × 0.5% = 12.5% CPU per worker — well within capacity
- Audio buffer memory: 100 × 160 KB = 16 MB — negligible
- WebSocket connections: 100 open connections — negligible for Node.js

**Changes from current:** Zero. This is the immediate deployment target.

**Rate limits to watch:**
- Whisper: 50 requests/minute per API key (OpenAI Tier 1). At 100 calls with ~1 turn/15s, this is ~400 STT calls/minute — requires Tier 2 or Deepgram.
- GPT-4o: 500 requests/minute (Tier 1). Same pattern — ~400 RPM — tight but feasible.

### Tier 2: 500 concurrent calls

**Infrastructure:** 3 nodes, Redis session store, MongoDB replica set, load balancer with WS stickiness.

**Changes from Tier 1:**

| Change | Why |
|---|---|
| `session.store = "redis"` | Serialisable state shared across nodes for admin visibility |
| Redis 7+, 1 GB memory | 500 sessions × ~8 KB serialised state = 4 MB — tiny footprint |
| Load balancer sticky sessions | WebSocket connections must route to same node for entire call |
| Provider API tier upgrades | Whisper → Deepgram (no rate limit concern); GPT-4o → Tier 3 keys |
| MongoDB connection pool: 50/node | 3 nodes × 50 = 150 total connections to MongoDB |

**Memory per node (3 nodes, ~167 calls each):**
- Audio buffers: 167 × 160 KB = 27 MB
- Conversation history: 167 × 50 turns × 500 bytes average = 4 MB
- Campaign snapshots: 167 × ~2 KB = 340 KB
- Node.js runtime + engine: ~200 MB
- **Total: ~250 MB per node** — comfortable on 4 GB nodes

### Tier 3: 1,000 concurrent calls

**Infrastructure:** 6–8 nodes, Redis Cluster (3 shards), MongoDB Atlas M30+, CDN for TLS termination.

**Changes from Tier 2:**

| Change | Why |
|---|---|
| 6–8 application nodes | Linear scale — each node handles ~150 calls |
| Redis Cluster (3 shards) | Single Redis node tops out at ~50,000 ops/sec; cluster provides headroom |
| MongoDB Atlas M30+ | 16 vCPU, 64 GB RAM; connection pooling with 100 connections per node |
| Codec offload to worker_threads | 1,000 calls × 10 resamples/sec = 10,000 CPU ops/sec in event loop |
| HTTP connection pools per provider | 10 keep-alive connections per provider per node |
| Provider accounts: enterprise tier | OpenAI Enterprise, Deepgram Growth, or self-hosted Whisper.cpp |
| CDN/Anycast TLS termination | Reduce TLS handshake overhead across geographic regions |

**Codec offload detail:** At 1,000 concurrent calls, each 100 ms audio frame triggers a μ-law decode + RMS + (on TTS path) resample. Benchmarking on a 4-core node:
- μ-law decode of 3,200 bytes: ~0.02 ms
- RMS of 1,600 samples: ~0.01 ms
- Resample 8→16 kHz (1,600→3,200 samples): ~0.05 ms
- At 1,000 concurrent streams each sending 10 frames/sec: 10,000 operations × 0.08 ms = ~800 ms of CPU per second per node

This is 80% of one CPU core consumed by codec work alone. Offloading codec operations to a `worker_threads` pool (2–4 workers) is required at Tier 3. The `Codec` module already provides pure functions — they are trivially movable to a worker thread pool without interface changes.

### 100,000 calls per day

100,000 calls per day at average call duration of 5 minutes = 833,333 call-minutes/day. Peak hour assumption (2× average) = ~1,667 concurrent calls at peak.

This requires Tier 3 infrastructure × 2, or 12–16 application nodes. The architecture scales linearly from Tier 2 onward — each node is stateless (sessions in Redis), each worker is independent.

The single most important operational metric at this scale: **P95 STT latency**. At 100,000 calls/day with ~4 turns/call = 400,000 STT requests/day. This drives provider selection — Deepgram streaming is the only viable option at this volume without self-hosting.

---

## Review Finding 7 — Future Feature Architecture Review

**Each future feature is reviewed for architectural support. Gaps are identified and resolved with extension points, not implementations.**

### 7.1 Conversation Memory

**Requirement:** The AI remembers facts about a lead across multiple calls (name, preferences, previous call outcome).

**Extension point:** `LLMService` currently builds a system prompt with campaign KB. A `MemoryService` provides an additional context block: a structured summary of previous call outcomes retrieved by `leadId` from MongoDB.

The `PromptBuilder` interface must support optional context sections:

```
PromptBuilder
  build(options: PromptBuildOptions): string

PromptBuildOptions {
  campaign:        CampaignSnapshot
  stage:           ConversationStage
  history:         ConversationMessage[]
  memoryContext?:  string          ← injected by MemoryService
  retrievedChunks?: string[]       ← injected by RAG (§7.2)
}
```

`MemoryService` is called before `LLMService` in `TurnOrchestrator`. The turn timeline becomes:
```
STT complete → MemoryService.recall(leadId) → LLMService.complete() → TTS
```
Memory recall must complete within `config.memory.timeoutMs` (default: 200 ms) or be skipped silently (never block the turn).

**No engine changes required** — the extension point is already the `PromptBuildOptions` shape.

### 7.2 Knowledge Versioning

**Requirement:** Campaign KB can be updated; active calls use the version they started with; analytics know which version served each call.

**Extension point:** `CampaignSnapshot.version` (already in §5) handles this. The campaign update endpoint increments `version` in MongoDB. Active sessions retain their snapshot. Post-call analysis records `{ campaignId, version }` per call.

**Additional requirement for versioning:** KB updates to an active session (for long campaigns) can be injected by emitting a `session.kb_updated` event that updates `campaignCache` in-place. This is an opt-in feature per campaign configuration.

### 7.3 Supervisor Monitoring

**Requirement:** A human supervisor can listen to a live call, read the transcript in real time, and optionally inject a coaching message to the AI.

**Extension point:** `SupervisorChannel` subscribes to the session's event bus on `stt.completed`, `llm.completed`, and `turn.completed`. It forwards these events over a separate WebSocket connection to the supervisor's browser.

```
SupervisorChannel
  attach(sessionId: string, supervisorWs: WebSocket): void
  detach(sessionId: string, supervisorWs: WebSocket): void
  inject(sessionId: string, coachingText: string): void    ← inserts as system message
```

`SupervisorChannel` is a subscriber — it has zero coupling to the pipeline. Adding it requires no changes to existing modules. A `GET /api/supervisor/stream?sessionId=...` endpoint creates the supervisor WebSocket and calls `attach()`.

### 7.4 Call Analytics

**Requirement:** After call completion, detailed analytics are available: full transcript, sentiment by turn, objection handling quality, stage progression, outcome.

**Extension point:** `PostCallAnalyzer` subscribes to `session.closed`. It reads the full `conversationHistory` from `SerializableSessionState` and submits a batch LLM analysis job. Results are written to a `CallAnalysis` MongoDB collection.

The `PostCallAnalyzer` is completely asynchronous and out-of-band — it does not affect call quality or latency. It registers on the event bus in `index.ts`:

```
eventBus.on("session.closed", e => postCallAnalyzer.analyze(e.sessionId))
```

### 7.5 Quality Scoring

**Requirement:** Each call receives a quality score (0–100) based on: conversation naturalness, objection handling, stage progression, outcome, echo events, hallucination discards.

**Extension point:** `QualityScorer` subscribes to `session.closed`. It reads metrics emitted during the session (turn latency, barge-in count, echo discards, hallucination discards, final stage reached, call outcome) and computes a score using a deterministic formula. The score is written to `CallLog.qualityScore`.

Input metrics are already captured by `MetricsCollector` — no new data collection needed.

### 7.6 Voice Cloning

**Requirement:** Campaigns can use a custom AI voice cloned from sample recordings.

**Extension point:** `TTSOptions.voice` currently accepts a voice name string. Voice cloning providers (ElevenLabs, PlayHT, Azure Custom Neural Voice) accept a voice ID that references a cloned voice. No interface change is required.

Campaign configuration gains a `customVoiceId?: string` field. `TTSService` passes this as `options.voice` when present. The existing `TTSProvider` interface handles this transparently.

For voice cloning workflows (recording → training → deployment), a separate `VoiceTrainingService` operates entirely outside the real-time voice engine.

### 7.7 Custom AI Providers

**Requirement:** Enterprise customers bring their own LLM, STT, or TTS provider (self-hosted Llama, Azure OpenAI, on-premise Whisper, etc.).

**Extension point:** The `ProviderRegistry` is already the plug-in point. A custom provider is any module that implements the relevant interface. The plugin loading mechanism described in §15.8 of the draft is the correct approach:

```
config.plugins: ["@company/internal-llm-provider"]
```

Each plugin package exports `register(registry: ProviderRegistry): void`. No engine code changes. Enterprise customers can publish private npm packages that wrap their internal APIs.

**Security consideration for custom providers:** Custom provider configs flow through the `providerConfig: Record<string, unknown>` field. If these configs contain API keys pointing to customer infrastructure, they must be stored encrypted in MongoDB and decrypted only at provider construction time (§9 below).

---

## Review Finding 8 — Testing Strategy

**A voice engine requires five distinct testing layers. Each targets a different failure mode.**

### Layer 1: Unit Tests

**Target:** Individual modules in complete isolation. All dependencies are replaced with typed mock implementations that satisfy the interface contract.

**Scope and approach:**

| Module | What to test |
|---|---|
| `Codec` | μ-law encode/decode round-trips; resampler output sample count; edge cases (silence, clipping, empty buffer) |
| `VoiceActivityDetector` | RMS below threshold → no timer armed; RMS above threshold → timer armed; force timer fires at `FORCE_PROCESS_MS`; timer resets on new voiced chunk |
| `EchoGuard` | Cooldown gate blocks frames; cooldown buffer threshold; word-overlap detection at boundary values (44%, 45%, 46%) |
| `WavBuilder` | Header bytes match RIFF spec; sample rate and channel count written correctly; output parseable by audio library |
| `ConversationStage` | Stage transitions at correct `userTurnCount` values |
| `ForbiddenPhraseFilter` | Each forbidden phrase is removed; response without forbidden phrases is unchanged |
| `PromptBuilder` | KB injected before rules; stage-specific instructions present; token budget enforced |
| `SentenceBuffer` | Single sentence detected correctly; multi-sentence split on boundaries; stream pause flushes buffer |
| `CircuitBreaker` | State transitions on threshold errors; OPEN state bypasses calls; HALF_OPEN probe allows exactly one call |

**Mock provider contract tests:** Each provider interface has a shared test suite that any provider implementation must pass. New providers are validated by running this suite against them before registration.

### Layer 2: Integration Tests

**Target:** Module combinations with real in-process wiring but mocked external I/O.

**Key integration test scenarios:**

```
Scenario: Normal turn — STT → LLM → TTS
  Given: MockSTTProvider returns "Tell me about the property"
  Given: MockLLMProvider returns "It has 3 bedrooms and 2 bathrooms"
  Given: MockTTSProvider yields 3 audio chunks then isFinal: true
  When: TurnOrchestrator.beginTurn() is called
  Then: All 3 events emitted (stt.completed, llm.completed, tts.completed)
  Then: Transport received 3 sendAudio calls
  Then: postSpeechCooldownUntil was set
  Then: session.processing is false after completion

Scenario: Barge-in during TTS
  Given: TTS stream is in progress (3 chunks sent, 5 remaining)
  When: BargeInController.handle() is called (high-energy audio during TTS)
  Then: TTSAbortController.abort() was called
  Then: transport.clearBuffer() was called
  Then: tts.aborted event emitted with playedMs = sum of 3 chunks
  Then: session.state = BARGE_IN
  Then: session.processing = false

Scenario: STT hallucination discarded
  Given: MockSTTProvider returns no_speech_prob = 0.7 for all segments
  When: STTService.transcribe() is called
  Then: STTResult.text = ""
  Then: stt.discarded event emitted with reason "hallucination"
  Then: TurnOrchestrator does NOT call LLMService

Scenario: Provider fallback on timeout
  Given: Primary STT provider times out after 3000ms
  Given: Fallback STT provider returns transcript in 400ms
  When: STTService.transcribe() is called
  Then: stt.error event emitted for primary
  Then: stt.completed event emitted with fallback provider name
  Then: voice.provider.fallbacks_total metric incremented

Scenario: Session teardown on WebSocket close
  Given: Active session with one pending silenceTimer
  When: transport.error event fires (WebSocket closed unexpectedly)
  Then: silenceTimer is cleared
  Then: All AbortControllers aborted
  Then: MetricsCollector.flush() called
  Then: storage.upsertCallLog() called with final state
  Then: session removed from SessionStore
```

### Layer 3: Load Tests

**Tool:** k6 or Artillery (WebSocket support required)

**Test scenarios:**

```
Scenario A — Ramp test
  0 → 100 → 200 → 500 → 1000 concurrent WS connections over 10 minutes
  Each connection sends simulated μ-law audio + receives audio back
  Assert: P95 turn latency < 2,000 ms throughout
  Assert: Error rate < 0.1%
  Assert: Node.js event loop lag < 100 ms at peak

Scenario B — Steady-state endurance
  200 concurrent calls for 60 minutes
  Assert: No memory leak (heap grows < 5% over duration)
  Assert: CPU usage < 70% sustained
  Assert: Redis connection pool not exhausted

Scenario C — Provider failure under load
  100 concurrent calls
  After 30 seconds: primary STT provider begins returning 503
  Assert: All calls fall back to secondary provider within 5 seconds
  Assert: Circuit breaker opens for primary provider
  Assert: No calls dropped during transition
```

**Load test infrastructure:** A dedicated WebSocket load injector that reads real recorded call audio (μ-law WAV files from actual test calls) and replays them at the correct 8 kHz frame rate. This tests the real audio path, not synthetic silence.

### Layer 4: Audio Quality Tests

**Target:** Verify that the codec pipeline does not introduce audible artefacts.

**Test cases:**

| Test | Method | Pass Criterion |
|---|---|---|
| μ-law round-trip fidelity | Encode PCM → μ-law → decode PCM; compute SNR | SNR > 35 dB |
| Resampler frequency response | Resample 8→16 kHz; apply FFT; check 3.4 kHz cutoff | -3 dB at 3,400 Hz |
| Resampler aliasing | Input signal at 7 kHz (above Nyquist for 8 kHz); resample to 8 kHz; detect aliasing | No aliasing above -60 dB |
| Echo guard threshold | Feed recorded echo (known RMS values) through EchoGuard; verify suppression | Echo below 600 RMS blocked 100% |
| VAD accuracy | Feed reference audio with known speech/silence segments | Precision > 95%, Recall > 90% |
| TTS resampler | Downsample 24→8 kHz; measure PESQ score vs reference | PESQ > 3.5 (fair MOS) |

Golden files: A corpus of 10 reference WAV files (5 male voices, 5 female voices, varying speech rates and background noise levels) is stored in `tests/audio/fixtures/`. All audio tests assert against these golden files.

### Layer 5: Latency Regression Tests

**Target:** Prevent latency regressions as the engine evolves.

**Method:** After each CI build, run the engine against a mock provider suite that returns deterministic responses with injected delays:
- MockSTTPProvider: returns in exactly 500 ms
- MockLLMProvider: yields first token in 200 ms, completes in 400 ms
- MockTTSProvider: yields first chunk in 150 ms

Measure end-to-end turn latency (VAD trigger → first TTS chunk received by mock transport).

**SLA assertions:**

| Metric | Maximum Allowed |
|---|---|
| Turn latency (mock providers, P50) | 900 ms |
| Turn latency (mock providers, P95) | 1,100 ms |
| Session creation latency | 50 ms |
| Campaign cache load latency | 200 ms |
| Event bus `emit()` duration (100 subscribers) | 5 ms |

These numbers exclude provider I/O — they measure only the engine's internal processing overhead.

### Layer 6: Provider Mock Framework

All three provider interfaces have ready-made mock implementations provided in `tests/mocks/`. These mocks:

- Accept configurable latency (delay before response)
- Accept configurable error injection (fail after N calls, or at specific call index)
- Record all calls for assertion in integration tests
- Implement the full interface including capability declarations and `ping()`

---

## Review Finding 9 — Security Architecture

**Voice data, secrets, PII, and recordings each require distinct handling. The current draft addresses logging PII only. This section provides the complete security model.**

### 9.1 Voice Data (in transit)

All WebSocket connections between Exotel and the engine use WSS (TLS 1.2 minimum, TLS 1.3 preferred). The reverse proxy (Nginx/Apache) terminates TLS. Internal routing between proxy and Node.js is plain HTTP/WS on localhost only — never exposed to network interfaces.

Provider API calls (STT, LLM, TTS) use HTTPS. All provider SDKs must be configured to reject invalid TLS certificates (`rejectUnauthorized: true` — Node.js default).

### 9.2 Voice Data (at rest)

The engine does not record or persist audio by default. Audio buffers are ephemeral, existing only in `TransientSessionState` during a turn and cleared immediately after STT handoff.

If recording is enabled (future feature):
- Audio files are written to object storage (S3 or equivalent) only
- Never written to local disk
- Encrypted with AES-256 at the object storage layer (server-side encryption)
- Access controlled by signed URLs with 15-minute TTL
- URLs stored in `CallLog.recordingUrl` — not the audio data itself
- Retention policy: configurable per campaign (default: 90 days, then permanent deletion)

### 9.3 PII Handling

PII sources in the voice engine:

| Data | Classification | Handling |
|---|---|---|
| Phone number | PII | Hashed with HMAC-SHA256 before logging; stored in MongoDB as plaintext for campaign use |
| Caller transcript | Sensitive | Never logged in production unless `transcriptLogging = true` (admin opt-in per campaign); stored in `conversationHistory` per session |
| Agent transcript | Internal | May be logged at info level — does not contain caller PII directly |
| Campaign KB | Confidential business data | Access restricted to campaign owner; not logged |

HMAC key for phone number hashing: a separate secret from `SESSION_SECRET`, stored as `VOICE_LOG_HMAC_KEY` environment variable. Without this key, log files cannot be de-anonymised.

### 9.4 API Keys and Secrets

**Provider API keys** (OpenAI, Deepgram, ElevenLabs, etc.):
- Stored as environment variables for the primary account keys
- Per-user provider keys (stored in MongoDB `AdminSettings`) are encrypted at rest using AES-256-GCM with the `SESSION_SECRET` as the encryption key derivation input
- Decrypted in memory only when a provider is constructed for a session
- Never appear in logs, metrics, or event payloads

**Exotel credentials** (API key, API token, Account SID):
- Environment variables only; never in MongoDB
- Rotated by updating the environment and restarting

**Session secrets:**
- `SESSION_SECRET` used only for Express session signing and as KDF input for DB encryption
- `VOICE_LOG_HMAC_KEY` used only for phone number hashing in logs
- Both are environment variables; never committed to source control

### 9.5 Knowledge Base Security

Campaign knowledge bases may contain confidential business data (pricing, unpublished product information, internal scripts). Access controls:

- KBs are accessible only to the campaign's owner (`userId` check on all campaign reads)
- KB text is included in LLM system prompts — it is transmitted to the LLM provider
- Campaigns must declare their LLM provider; if a customer uses a third-party provider, they accept that their KB is transmitted to that provider
- KB content is never exposed in API responses beyond what the owner explicitly configured
- KB content is not logged at any level

### 9.6 WebSocket Authentication

The `/exotel-stream` WebSocket upgrade endpoint currently relies on the presence of `campaignId` in the query string. This is insufficient — any client that knows the domain can connect.

**Required addition:** Exotel-signed webhook validation. Each incoming WebSocket connection must be validated against an Exotel-provided signature (similar to Twilio's `X-Twilio-Signature`). The `ExotelTelephonyProvider` validates this signature in `accept()` before allowing the session to be created. Connections that fail validation are rejected with HTTP 403 before the WebSocket upgrade completes.

The signature validation secret is stored as `EXOTEL_WEBHOOK_SECRET` (environment variable).

### 9.7 Rate Limiting

The engine is exposed via a single WebSocket upgrade endpoint. Abuse vectors:

| Vector | Mitigation |
|---|---|
| Excessive connection attempts from one IP | Nginx `limit_conn_zone` — max 10 new connections/second per IP |
| Long-lived idle sessions consuming memory | Session TTL (1 hour default); `lastActivityAt` checked every minute |
| Abnormally large audio payloads | Frame size gate: reject any single `media` payload > 10 KB |
| Provider cost abuse | Per-campaign call budget enforced by existing credit system |

---

## Final Voice Engine V2 — Frozen Specification

The following is the definitive, frozen architecture. All review findings are incorporated. Implementation begins against this document.

---

# NIJVOX Voice Engine V2 — Frozen Implementation Specification

**Date Frozen:** 2026  
**Target Scale:** 100,000 calls/day, 1,000 concurrent calls (engineered)  
**Immediate Target:** 100 concurrent calls, single node

---

## F1. Folder Structure

```
server/
└── voice-engine/
    │
    ├── index.ts                          ← Public entry point; sole export surface
    │
    ├── config/
    │   ├── defaults.ts                   ← Compile-time defaults for all tunables
    │   └── schema.ts                     ← Zod validation schema for VoiceEngineConfig
    │
    ├── events/
    │   ├── EventBus.ts                   ← Per-session typed pub/sub bus
    │   └── types.ts                      ← VoiceEvent union type; all event shapes
    │
    ├── session/
    │   ├── SessionManager.ts             ← Registry: create, retrieve, destroy, TTL
    │   ├── SessionStore.ts               ← Interface (get/set/delete/all)
    │   ├── adapters/
    │   │   ├── InMemorySessionStore.ts   ← Single-node default
    │   │   └── RedisSessionStore.ts      ← Multi-node adapter
    │   └── types.ts                      ← VoiceSession, SerializableSessionState,
    │                                        TransientSessionState, SessionState enum
    │
    ├── transport/
    │   ├── TelephonyProvider.ts          ← Interface (accept/close/sendAudio/clearBuffer)
    │   ├── providers/
    │   │   ├── ExotelTelephonyProvider.ts← Exotel WS implementation + signature validation
    │   │   └── TwilioTelephonyProvider.ts← (stub — future)
    │   └── types.ts                      ← TelephonyConnected, TelephonyMedia, TelephonyStop
    │
    ├── audio/
    │   ├── AudioPipeline.ts              ← Orchestrates: decode → VAD → gate → buffer
    │   ├── Codec.ts                      ← μ-law ↔ PCM16; resampler; WAV builder
    │   ├── VoiceActivityDetector.ts      ← RMS VAD; silence timer; force timer
    │   ├── EchoGuard.ts                  ← Cooldown window; cooldown buffer; overlap check
    │   └── types.ts                      ← AudioFrame, VADEvent, EchoGuardState
    │
    ├── stt/
    │   ├── STTProvider.ts                ← Interface (transcribe + optional streamTranscribe)
    │   ├── STTService.ts                 ← Provider selection; no_speech guard; circuit breaker
    │   └── providers/
    │       ├── WhisperSTTProvider.ts     ← OpenAI Whisper (batch only)
    │       ├── DeepgramSTTProvider.ts    ← Deepgram Nova-2 (streaming + batch)
    │       └── GoogleSTTProvider.ts      ← Google STT v2 (streaming + batch)
    │
    ├── llm/
    │   ├── LLMProvider.ts                ← Interface (complete + optional stream)
    │   ├── LLMService.ts                 ← Provider selection; history trim; circuit breaker
    │   ├── PromptBuilder.ts              ← System prompt assembly; KB injection; stage rules
    │   ├── ConversationStage.ts          ← Stage enum; turn-count thresholds
    │   ├── ForbiddenPhraseFilter.ts      ← Post-generation phrase removal
    │   └── providers/
    │       ├── OpenAILLMProvider.ts      ← GPT-4o (streaming + batch)
    │       ├── AnthropicLLMProvider.ts   ← Claude (streaming + batch)
    │       └── GeminiLLMProvider.ts      ← Gemini (streaming + batch)
    │
    ├── tts/
    │   ├── TTSProvider.ts                ← Interface (synthesize → AsyncIterable<AudioChunk>)
    │   ├── TTSService.ts                 ← Provider selection; per-chunk encode; playback accounting
    │   ├── FillerService.ts              ← Pre-rendered filler audio selection
    │   └── providers/
    │       ├── OpenAITTSProvider.ts      ← OpenAI tts-1 (streaming)
    │       ├── ElevenLabsTTSProvider.ts  ← ElevenLabs (streaming)
    │       └── AzureTTSProvider.ts       ← Azure TTS (streaming)
    │
    ├── pipeline/
    │   ├── TurnOrchestrator.ts           ← Coordinates full turn: STT→LLM→TTS
    │   ├── SentenceBuffer.ts             ← LLM token stream → sentence boundary detection
    │   ├── GreetingController.ts         ← One-shot greeting; sets greetingDone
    │   └── BargeInController.ts          ← Detects interruption; aborts TTS/LLM; resets turn
    │
    ├── providers/
    │   └── ProviderRegistry.ts           ← Factory registry for all four provider types
    │
    ├── metrics/
    │   ├── MetricsCollector.ts           ← Interface (record/flush)
    │   ├── InProcessCollector.ts         ← In-memory aggregation (dev/single-node)
    │   ├── PrometheusCollector.ts        ← Prometheus exposition on port 9090
    │   └── types.ts                      ← MetricEvent union; all metric shapes
    │
    ├── monitoring/
    │   ├── HealthProbe.ts                ← /health and /ready handlers + provider ping
    │   └── AlertSink.ts                  ← Interface (notify) + PagerDuty/Slack adapters
    │
    ├── errors/
    │   ├── VoiceEngineError.ts           ← Base class (code, sessionId, provider, retryable)
    │   ├── codes.ts                      ← ErrorCode enum
    │   └── CircuitBreaker.ts             ← CLOSED/OPEN/HALF_OPEN state machine
    │
    └── logger/
        ├── Logger.ts                     ← Interface (info/warn/error/debug/child)
        └── adapters/
            ├── ConsoleLogger.ts          ← Development
            └── PinoLogger.ts             ← Production JSON
```

---

## F2. Module Responsibilities

### F2.1 `events/`

Owns the per-session event bus. The bus is the spine of the engine: all module communication flows through it, not through direct function calls between modules.

| Responsibility | Detail |
|---|---|
| Typed publish/subscribe | All events are members of the `VoiceEvent` union |
| Per-session scope | One `EventBus` per `VoiceSession`; no global bus |
| Synchronous delivery | Handlers called immediately in emit order; no async queuing |
| Fault isolation | Handler exceptions are caught and logged; do not interrupt other handlers |
| Wildcard subscription | `onAny()` for cross-cutting concerns (metrics, logging) |

### F2.2 `config/`

Owns every tunable. No module reads `process.env` directly.

| Responsibility | Detail |
|---|---|
| Startup validation | Zod parse at `createVoiceEngine()` time; hard-fail on missing required values |
| Safe defaults | Every optional field has a compile-time default in `defaults.ts` |
| Hot-reload path | Audio thresholds and LLM parameters are reference-read; config update propagates to next turn |
| Provider config isolation | Each provider block is an opaque record; engine core never reads it |

### F2.3 `session/`

Owns the session registry and the two-tier session model.

| Responsibility | Detail |
|---|---|
| Session creation | Allocate `VoiceSession` (both tiers) on `transport.connected` |
| Persistence | Write `SerializableSessionState` to `SessionStore` after each state change |
| Transient state | `TransientSessionState` never persisted; lives only in process memory |
| TTL enforcement | Periodic scan; sessions without `lastActivityAt` update for TTL ms are torn down |
| Campaign snapshot | Load `CampaignSnapshot` on session create; cache in serialisable state |

### F2.4 `transport/`

Owns the telephony connection. Translates carrier-specific wire format into engine-internal events. Has zero knowledge of audio processing, STT, LLM, or TTS.

| Responsibility | Detail |
|---|---|
| Connection acceptance | `accept()` validates Exotel signature before allowing WS upgrade |
| Envelope parsing | Carrier-specific JSON → `TelephonyMedia`, `TelephonyConnected`, `TelephonyStop` |
| Event emission | Each parsed envelope emits a typed event on the session's event bus |
| Outbound encoding | Receives `Buffer` from TTSService; encodes to carrier format (base64 μ-law for Exotel) |
| Clear command | `clearBuffer()` sends carrier-specific buffer flush (Exotel `clear` event) |

### F2.5 `audio/`

Owns all signal processing. Completely stateless except for VAD and echo-guard state objects carried on `TransientSessionState`.

| Responsibility | Detail |
|---|---|
| Decode | μ-law (or carrier-native codec per `TelephonyProvider.encoding`) → PCM16 |
| VAD | RMS energy classification; silence and force timers; `audio.speech_end` emission |
| Echo guard | Cooldown window; cooldown buffer (threshold: 600 RMS); word-overlap check |
| Barge-in detection | Sustained high energy (700 RMS, 3 chunks) during TTS → `audio.barge_in_detected` |
| Resampling | Linear PCM16 resampler (8↔16↔24 kHz); offloaded to worker_threads at Tier 3 |

### F2.6 `stt/`

Owns speech-to-text. Provider-agnostic. Supports both batch and streaming paths.

| Responsibility | Detail |
|---|---|
| Path selection | Checks `provider.capabilities.supportsStreaming` at startup |
| Batch path | WAV build → HTTP POST → wait for full result |
| Streaming path | `streamTranscribe()` → incremental audio push → `stt.partial` + `stt.final` events |
| Pre-flight gate | Minimum 300 ms / 4,800 bytes audio |
| Hallucination guard | `no_speech_prob >= 0.5` → discard; empty-segment heuristic |
| Circuit breaker | Per provider; falls back to `providerChain` on OPEN |

### F2.7 `llm/`

Owns language model interaction. Provider-agnostic. Supports both batch and streaming paths.

| Responsibility | Detail |
|---|---|
| Path selection | Checks `provider.capabilities.supportsStreaming` at startup |
| Prompt assembly | `PromptBuilder` with optional `memoryContext` and `retrievedChunks` injection points |
| Stage routing | `ConversationStage` transitions on `userTurnCount` |
| History trim | Rolling window applied per call; never mutates session history |
| Streaming path | Token stream fed to `SentenceBuffer` in `pipeline/` |
| Forbidden phrase filter | Applied after full response is assembled |
| Circuit breaker | Per provider; falls back to `providerChain` on OPEN |

### F2.8 `tts/`

Owns text-to-speech. Always streaming. Manages echo-guard cooldown accounting.

| Responsibility | Detail |
|---|---|
| Streaming synthesis | `AsyncIterable<AudioChunk>`; never buffers full response |
| Sentence-level synthesis | When called by `SentenceBuffer`, synthesises each sentence as it arrives |
| Codec conversion | Provider PCM (24 kHz) → Exotel PCM (8 kHz) → μ-law; or pass-through for native μ-law providers |
| Playback accounting | `ttsPlaybackMs` incremented per chunk; used by `EchoGuard` for cooldown calculation |
| Filler injection | `FillerService` provides pre-rendered WAV fillers; played immediately after VAD fires |
| Circuit breaker | Per provider; falls back to `providerChain` on OPEN |

### F2.9 `pipeline/`

Owns turn-level orchestration. The only module that coordinates all three provider services. Subscribes to events; does not poll.

| Responsibility | Detail |
|---|---|
| Greeting gate | `GreetingController` fires once; blocks all turn processing until `greetingDone = true` |
| Turn lock | `processing` flag prevents concurrent turns; barge-in aborts in-flight turn |
| STT coordination | Subscribes to `audio.speech_end`; passes audio to `STTService` |
| LLM coordination | On `stt.completed`: calls `LLMService`; subscribes to `llm.sentence_ready` for streaming |
| TTS coordination | On `llm.sentence_ready` (streaming) or `llm.completed` (batch): calls `TTSService` |
| Barge-in handling | `BargeInController` subscribes to `audio.barge_in_detected`; aborts active LLM + TTS |
| Turn reset | Clears transient buffers; resets timers; releases turn lock |

### F2.10 `providers/`

Owns the `ProviderRegistry`. Instantiates all four provider types at startup. Provides `healthCheck()` for the `/ready` probe.

### F2.11 `metrics/`

Owns telemetry. Subscribes to all events via `eventBus.onAny()`. Normalises into counters and histograms.

### F2.12 `monitoring/`

Owns `/health` (liveness) and `/ready` (readiness) endpoints. Readiness requires all providers to pass `ping()`.

### F2.13 `errors/`

Owns error taxonomy, circuit breaker logic, and retry policies. No business logic.

### F2.14 `logger/`

Owns structured logging. Subscribes to all events via `eventBus.onAny()`. One log line per significant event.

---

## F3. Complete Interface Specifications

### F3.1 TelephonyProvider (new)

```
TelephonyProvider
  capabilities: TelephonyCapabilities
  accept(socket: WebSocket, request: IncomingMessage): void
  close(streamSid: string, reason: string): void
  sendAudio(streamSid: string, audioBuffer: Buffer): void
  clearBuffer(streamSid: string): void
  ping(): Promise<{ ok: boolean; latencyMs: number }>
  on(event: "connected", handler: (e: TelephonyConnected) => void): Unsubscribe
  on(event: "media",     handler: (e: TelephonyMedia)    => void): Unsubscribe
  on(event: "stop",      handler: (e: TelephonyStop)     => void): Unsubscribe
  on(event: "error",     handler: (e: TelephonyError)    => void): Unsubscribe

TelephonyCapabilities {
  encoding:           "mulaw" | "pcm16" | "opus"
  sampleRate:         number
  frameMs:            number
  supportsBargein:    boolean
  supportsRecording:  boolean
}
```

### F3.2 STTProvider (extended)

```
STTProvider
  capabilities: STTCapabilities
  transcribe(frame: AudioFrame, options: STTOptions): Promise<STTResult>
  streamTranscribe?(options: STTOptions): STTStreamSession    ← optional
  ping(): Promise<{ ok: boolean; latencyMs: number }>

STTCapabilities {
  supportsStreaming:    boolean
  supportsLanguages:   string[]
  minAudioMs:          number
  maxAudioMs:          number
  returnsConfidence:   boolean
  returnsSegments:     boolean
}

STTStreamSession {
  push(chunk: Buffer): void
  close(): void
  on(event: "partial", handler: (text: string, confidence: number) => void): void
  on(event: "final",   handler: (result: STTResult) => void): void
  on(event: "error",   handler: (err: Error) => void): void
}
```

### F3.3 LLMProvider (extended)

```
LLMProvider
  capabilities: LLMCapabilities
  complete(messages: ConversationMessage[], options: LLMOptions): Promise<LLMResult>
  stream?(messages: ConversationMessage[], options: LLMOptions): AsyncIterable<LLMChunk>
  ping(): Promise<{ ok: boolean; latencyMs: number }>

LLMCapabilities {
  supportsStreaming:    boolean
  maxContextTokens:    number
  supportsSystemRole:  boolean
  modelName:           string
}

LLMChunk {
  delta:      string
  isFinal:    boolean
  tokensUsed?: number    ← populated on final chunk only
}
```

### F3.4 TTSProvider (unchanged interface; capabilities added)

```
TTSProvider
  capabilities: TTSCapabilities
  synthesize(text: string, options: TTSOptions): AsyncIterable<AudioChunk>
  ping(): Promise<{ ok: boolean; latencyMs: number }>

TTSCapabilities {
  supportsStreaming:    boolean
  supportedVoices:     string[]
  supportedEncodings:  Array<"pcm" | "mulaw" | "opus">
  maxTextLength:       number
  supportsSSML:        boolean
}
```

### F3.5 PromptBuilder (extended)

```
PromptBuilder
  build(options: PromptBuildOptions): string

PromptBuildOptions {
  campaign:         CampaignSnapshot
  stage:            ConversationStage
  history:          ConversationMessage[]
  memoryContext?:   string          ← injected by MemoryService (future)
  retrievedChunks?: string[]        ← injected by RAG retrieval (future)
}
```

### F3.6 SessionStore (unchanged)

```
SessionStore
  get(streamSid: string): Promise<SerializableSessionState | null>
  set(streamSid: string, state: SerializableSessionState): Promise<void>
  delete(streamSid: string): Promise<void>
  all(): Promise<SerializableSessionState[]>
```

### F3.7 Public Engine API (unchanged)

```
createVoiceEngine(config: VoiceEngineConfig): VoiceEngine

VoiceEngine {
  handleExotelUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void
  getHealth(): HealthStatus
  getMetrics(): MetricsSummary
  shutdown(): Promise<void>
}
```

---

## F4. Session Lifecycle (State Machine)

```
                                   ┌─────────────────────────────────────┐
                                   │                                     │
WS upgrade   ┌──────────────┐    ┌──────────┐   ┌────────┐   ┌─────────┐│ ┌────────┐
accepted  → │ INITIALISING │──► │ GREETING │──►│ ACTIVE │──►│ CLOSING ││►│ CLOSED │
             └──────┬───────┘    └────┬─────┘   └───┬────┘   └─────────┘│ └────────┘
                    │                 │              │                   │
                    │                 │           ┌──▼──────┐           │
                    │                 │           │BARGE_IN │           │
                    │                 │           └──┬──────┘           │
                    │                 │              │ (returns ACTIVE) │
                    └─────────────────┴──────────────┘                  │
                                  ERROR (any state) ─────────────────────┘
```

| State | Entry | Exit |
|---|---|---|
| `INITIALISING` | WS upgrade accepted; `transport.connected` received | `GreetingController.start()` called |
| `GREETING` | Greeting TTS stream begins | All greeting chunks sent; cooldown armed; `greetingDone = true` |
| `ACTIVE` | `greetingDone = true` | Any of: `transport.stop_received`, TTL expired, unrecoverable error |
| `BARGE_IN` | `audio.barge_in_detected` while `isSpeaking` | TTS aborted; Clear sent; new silence timer armed |
| `CLOSING` | `transport.stop_received` or WS `close` | Metrics flushed; `upsertCallLog` written |
| `CLOSED` | Teardown complete | Session removed from registry |

### Session Teardown Sequence (authoritative)

```
1.  Receive close trigger (stop envelope OR WS close/error)
2.  Transition state: ACTIVE → CLOSING
3.  clearTimeout(silenceTimer); clearTimeout(forceTimer)
4.  sttAbortController?.abort()
5.  llmAbortController?.abort()
6.  ttsAbortController?.abort()
7.  eventBus.emit("session.closed", { reason, durationMs, totalTurns, bargeIns })
    — MetricsCollector.flush() called synchronously in its handler
    — Logger writes final summary in its handler
8.  storage.upsertCallLog({ streamSid, callSid, durationMs, totalTurns, qualityScore: null })
9.  sessionStore.delete(streamSid)
10. Transition state: CLOSING → CLOSED
11. Dispose eventBus (clear all subscribers)
12. GC eligible: all TransientSessionState Buffers released
```

---

## F5. Audio Lifecycle (Authoritative)

### F5.1 Inbound Path — Batch STT

```
Exotel WS "media" event
  → ProtocolParser: base64 decode → raw Buffer (μ-law 8 kHz)
  → Codec.mulawToInt16() → Int16Array (PCM16 8 kHz)
  → AudioPipeline.rmsLevel() → RMS value

GATE DECISIONS (ordered; short-circuit on first match):

  [G1] Cooldown gate: now < postSpeechCooldownUntil
         rms > 600 (COOLDOWN_BUFFER_MIN_RMS)?
           yes → cooldownBuffer.push(audioBuf); break
           no  → discard; break

  [G2] Barge-in gate: session.isSpeaking
         rms > 700 (BARGE_IN_THRESHOLD)?
           voicedChunks++; if voicedChunks >= 3 → audio.barge_in_detected; break
           else → discard; break

  [G3] VAD gate: rms > 200 (VAD_THRESHOLD)
         voicedChunks++; mediaChunks.push(audioBuf)
         arm silenceTimer(800ms) if not armed
         arm forceTimer(5000ms) if not armed

  [G4] Silence: discard

TIMER FIRES:
  silenceTimer OR forceTimer
    → eventBus.emit("audio.speech_end")
    → TurnOrchestrator.beginTurn()
         audio = [...cooldownBuffer, ...mediaChunks]
         cooldownBuffer = []; mediaChunks = []

PRE-STT:
  total bytes < 4800 (300ms)? → discard; return

STT (BATCH PATH):
  WavBuilder.build(audio) → WAV buffer
  STTService.transcribe(audioFrame)
    → provider.transcribe(frame, options)
    → check avg(no_speech_prob) >= 0.5 → discard if true
    → check empty-segment heuristic → discard if hallucination
    → return STTResult.text
  eventBus.emit("stt.completed")
```

### F5.2 Inbound Path — Streaming STT (fast path)

```
Streaming STT provider available:
  → On VAD first voiced chunk:
       STTStreamSession = provider.streamTranscribe(options)
       silenceTimer reduced to 400ms
  → Each subsequent voiced chunk:
       streamSession.push(rawPCMBuffer)
  → On "partial" event:
       eventBus.emit("stt.partial", { partialText })
  → On silenceTimer fire (400ms):
       streamSession.close()
  → On "final" event:
       apply no_speech_prob guard
       eventBus.emit("stt.completed")
```

### F5.3 Outbound Path — Sentence-Streaming (fast path)

```
STT complete → LLMService.stream() begins

LLMChunk received by SentenceBuffer:
  accumulate delta
  sentence boundary detected (.!? OR 200ms stream pause)?
    → eventBus.emit("llm.sentence_ready", { sentence })
    → TurnOrchestrator handles:
         TTSService.synthesize(sentence, options) → AsyncIterable<AudioChunk>
         For each AudioChunk:
           Codec.resamplePCM16(chunk.data, 24000, 8000)
           Codec.int16ToMulaw(pcm8k)
           transport.sendAudio(streamSid, mulawBuffer)
           ttsPlaybackMs += chunk.durationMs
           eventBus.emit("tts.chunk_sent")

LLM stream ends:
  eventBus.emit("llm.completed")
  Last TTS sentence completes (isFinal: true):
    postSpeechCooldownUntil = now + ttsPlaybackMs + 900
    isSpeaking = false
    eventBus.emit("tts.completed")
    TurnOrchestrator.resetTurn()
```

### F5.4 Barge-In Interruption Path

```
audio.barge_in_detected event fired (rms > 700, >= 3 consecutive chunks during TTS)

BargeInController.handle():
  1. transport.clearBuffer(streamSid)        ← Exotel flushes playout queue
  2. ttsAbortController.abort()              ← HTTP request for TTS cancelled
  3. llmAbortController.abort()             ← LLM HTTP request cancelled (if streaming)
  4. clearTimeout(silenceTimer)
  5. clearTimeout(forceTimer)
  6. session.postSpeechCooldownUntil = now + 250
  7. session.isSpeaking = false
  8. session.processing = false
  9. session.bargeInCount++
  10. session.state = BARGE_IN
  11. session.mediaChunks = [triggering chunks]
  12. eventBus.emit("tts.aborted", { reason: "barge_in" })
  13. eventBus.emit("turn.aborted", { reason: "barge_in" })
  14. arm new silenceTimer(400ms if streaming STT, else 800ms)
```

---

## F6. Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         EXOTEL / TELEPHONY CARRIER                           │
│                         (WSS, μ-law 8 kHz, 20ms frames)                     │
└─────────────────────────────┬────────────────────────────────────────────────┘
                              │ WebSocket frames (encrypted)
              ┌───────────────▼───────────────┐
              │      TelephonyProvider        │  ← Exotel signature validation
              │  ExotelTelephonyProvider      │
              └───────────────┬───────────────┘
                              │ TelephonyMedia events → EventBus
              ┌───────────────▼───────────────┐
              │        AudioPipeline          │ ←── EchoGuard (cooldown)
              │  Codec · VAD · Gates          │ ←── VoiceActivityDetector (timers)
              └───────────────┬───────────────┘
                              │ audio.speech_end event
              ┌───────────────▼───────────────┐
              │      TurnOrchestrator         │ ←── GreetingController (one-shot)
              │  + BargeInController          │ ←── SentenceBuffer (streaming)
              └──────┬────────────────┬───────┘
                     │                │
          audio.speech_end     llm.sentence_ready / llm.completed
                     │                │
       ┌─────────────▼──┐    ┌────────▼────────┐
       │   STTService    │    │    TTSService   │ ←── FillerService
       │ + hallucination │    │ + playback acct │
       │   guard         │    └────────┬────────┘
       └─────────────┬───┘             │ AudioChunk stream
                     │                 │ (PCM 24kHz→8kHz→μ-law)
              stt.completed    ┌───────▼───────────────┐
                     │         │   TelephonyProvider   │
       ┌─────────────▼──┐      │   (outbound sendAudio) │
       │   LLMService   │      └───────────────────────┘
       │ PromptBuilder  │
       │ Stage router   │──────────────────────► TTSService (text → audio)
       │ ForbiddenFilter│
       └────────────────┘

Cross-cutting (all modules → EventBus → subscribers):
  EventBus → MetricsCollector → [InProcess | Prometheus :9090]
  EventBus → Logger           → [Console | Pino JSON → stdout → log aggregator]
  EventBus → SupervisorChannel (future) → supervisor WebSocket
  EventBus → PostCallAnalyzer (future) → async analysis job
```

---

## F7. Provider Registry

```
ProviderRegistry {
  registerSTT(name, factory): void
  registerLLM(name, factory): void
  registerTTS(name, factory): void
  registerTelephony(name, factory): void

  resolveSTT(): STTProvider
  resolveLLM(): LLMProvider
  resolveTTS(): TTSProvider
  resolveTelephony(): TelephonyProvider

  healthCheck(): Promise<{
    stt:       { provider: string; ok: boolean; latencyMs: number }
    llm:       { provider: string; ok: boolean; latencyMs: number }
    tts:       { provider: string; ok: boolean; latencyMs: number }
    telephony: { provider: string; ok: boolean; latencyMs: number }
  }>
}
```

Provider selection: `config.*.provider` → `registry.resolve*()`.  
Fallback: `config.*.providerChain` → tried in order when circuit breaker is OPEN.  
Plugin: packages that export `register(registry: ProviderRegistry): void` are loaded at startup.

---

## F8. Dependency Graph (Acyclic — Enforced)

```
index.ts (composition root)
  ├── config/                      ← no imports from any engine module
  ├── logger/                      ← no imports from any engine module
  ├── errors/                      ← imports: logger/ only
  ├── events/                      ← imports: logger/, errors/ only
  ├── providers/ProviderRegistry   ← imports: stt/, llm/, tts/, transport/ interfaces only
  ├── session/                     ← imports: config/, logger/, errors/, events/
  ├── transport/                   ← imports: config/, logger/, errors/, events/
  ├── audio/                       ← imports: config/, logger/, errors/, events/
  ├── stt/                         ← imports: config/, logger/, errors/, events/, audio/types
  ├── llm/                         ← imports: config/, logger/, errors/, events/
  ├── tts/                         ← imports: config/, logger/, errors/, events/, audio/types
  ├── pipeline/                    ← imports: config, session, transport, audio, stt, llm, tts, events
  ├── metrics/                     ← imports: events/, config/, logger/
  └── monitoring/                  ← imports: providers/, metrics/, config/, logger/

Acyclic invariants (must be verified by CI dependency checker):
  - logger/ imports: nothing from voice-engine/
  - errors/ imports: logger/ only
  - events/ imports: logger/, errors/ only
  - config/ imports: nothing from voice-engine/
  - audio/ imports: nothing from stt/, llm/, tts/, pipeline/, transport/
  - stt/, llm/, tts/ import: nothing from each other
  - transport/ imports: nothing from audio/, stt/, llm/, tts/, pipeline/
  - pipeline/ is the ONLY module that imports from stt/, llm/, and tts/ simultaneously
  - metrics/ imports: nothing from session/, transport/, audio/, stt/, llm/, tts/, pipeline/
```

---

## F9. Configuration Schema (Final)

```
VoiceEngineConfig {
  nodeId:         string           default: os.hostname()

  stt: {
    provider:              string    default: "whisper"
    providerChain:         string[]  default: ["whisper"]
    timeoutMs:             number    default: 10_000
    noSpeechThreshold:     number    default: 0.5
    minAudioBytes:         number    default: 4_800
    providerConfig:        Record<string, unknown>
  }

  llm: {
    provider:              string    default: "openai"
    providerChain:         string[]  default: ["openai"]
    timeoutMs:             number    default: 15_000
    maxTokens:             number    default: 80
    temperature:           number    default: 0.20
    historyMaxTurns:       number    default: 100
    providerConfig:        Record<string, unknown>
  }

  tts: {
    provider:              string    default: "openai"
    providerChain:         string[]  default: ["openai"]
    firstChunkTimeoutMs:   number    default: 3_000
    voice:                 string    default: "shimmer"
    providerConfig:        Record<string, unknown>
  }

  telephony: {
    provider:              string    default: "exotel"
    webhookSecret:         string    ← required; no default (env: EXOTEL_WEBHOOK_SECRET)
    providerConfig:        Record<string, unknown>
  }

  audio: {
    silenceTimeoutMs:         number  default: 800
    silenceTimeoutStreamMs:   number  default: 400   ← when streaming STT active
    forceProcessMs:           number  default: 5_000
    vadThreshold:             number  default: 200
    minVoicedChunks:          number  default: 2
    bargeInThreshold:         number  default: 700
    bargeInMinChunks:         number  default: 3
    cooldownBufferMinRms:     number  default: 600
    postSpeechBufferMs:       number  default: 900
    postBargeInCooldownMs:    number  default: 250
    fillerProbability:        number  default: 0.85
  }

  session: {
    store:                 "memory" | "redis"   default: "memory"
    ttlMs:                 number               default: 3_600_000
    redisUrl?:             string
  }

  codec: {
    useWorkerThreads:      boolean  default: false   ← enable at Tier 3 (1,000+ calls)
    workerPoolSize:        number   default: 2
  }

  metrics: {
    collector:             "inprocess" | "prometheus"  default: "inprocess"
    prometheusPort:        number                      default: 9090
  }

  logging: {
    adapter:               "console" | "pino"          default: "console"
    level:                 "debug" | "info" | "warn" | "error"  default: "info"
    transcriptLogging:     boolean                     default: false
    logHmacKey?:           string                      ← env: VOICE_LOG_HMAC_KEY
  }

  plugins:                 string[]  default: []       ← npm package names
}
```

---

## F10. Error Handling Strategy (Final)

### Error Taxonomy

```
VoiceEngineError (base: code, sessionId?, provider?, retryable, cause?)
  ├── TransportError
  │     ├── TransportConnectionError   ← WS open failed
  │     ├── TransportProtocolError     ← Malformed envelope
  │     └── TransportSignatureError    ← Exotel signature validation failed
  ├── CodecError                       ← Decode/resample failure
  ├── STTError
  │     ├── STTTimeoutError
  │     ├── STTProviderError           ← HTTP 4xx/5xx
  │     ├── STTSilenceError            ← Below min gate (silent discard, never thrown)
  │     └── STTHallucinationError      ← no_speech_prob guard triggered (silent discard)
  ├── LLMError
  │     ├── LLMTimeoutError
  │     ├── LLMProviderError
  │     └── LLMEmptyResponseError
  ├── TTSError
  │     ├── TTSFirstChunkTimeoutError
  │     ├── TTSProviderError
  │     └── TTSStreamError             ← Mid-stream failure
  └── SessionError
        ├── SessionNotFoundError
        └── SessionStoreError          ← Redis unavailable
```

### Recovery Matrix

| Error | Retryable | Strategy | User Impact |
|---|---|---|---|
| `TransportSignatureError` | No | Reject WS upgrade with 403 | Call never starts |
| `TransportConnectionError` | No | No session created | None |
| `TransportProtocolError` | No | Discard frame; log warn | One frame lost |
| `TransportError` mid-call | No | Session teardown | Call drops |
| `CodecError` | No | Discard frame; log warn | One frame lost |
| `STTTimeoutError` | Yes (2×, fallback chain) | Ask "Sorry, could you repeat that?" | Minor |
| `STTProviderError` 4xx | No | Skip turn; log error | Minor |
| `STTProviderError` 5xx | Yes (2×, fallback chain) | Fallback provider | None visible |
| `LLMTimeoutError` | Yes (1×, fallback chain) | Scripted fallback phrase | Minor |
| `LLMEmptyResponseError` | Yes (1×, same provider) | Scripted fallback phrase | Minor |
| `TTSFirstChunkTimeoutError` | Yes (1×, fallback chain) | Pre-rendered WAV fallback | Minor |
| `TTSStreamError` | No | Abort; next turn normal | Agent cuts off |
| `SessionStoreError` (Redis) | Implicit | Degrade to in-process; alert | None |

### Circuit Breaker (per provider)

```
States: CLOSED → OPEN → HALF_OPEN → CLOSED

CLOSED → OPEN:    5 consecutive failures of same error type
OPEN duration:    30 seconds
OPEN → HALF_OPEN: After 30s, one probe call allowed
HALF_OPEN → CLOSED: Probe succeeds
HALF_OPEN → OPEN:   Probe fails; reset 30s timer

On OPEN: immediately attempt next provider in providerChain.
         If no next provider: throw ProviderUnavailableError.
         ProviderUnavailableError is not retried — use scripted fallback.
```

### Turn-Level Error Boundary

`TurnOrchestrator.beginTurn()` wraps the full turn in `try/catch`. On any uncaught error:
1. Emit `ErrorMetric`
2. Call `resetTurn()` (releases lock, clears buffers, re-arms timers)
3. Do NOT close WebSocket — session continues
4. Log at `error` with `sessionId`, `turnId`, `stage`, full stack

The session closes only on `TransportError` or `SessionError`.

---

## F11. Logging Strategy (Final)

### Principles

- All log output is structured JSON in production (`PinoLogger`), human-readable in development (`ConsoleLogger`)
- Every module receives a `Logger` instance at construction; `console.log` is forbidden
- One log line per significant event (driven by event bus subscription)
- Phone numbers hashed with HMAC-SHA256 before any log write; raw number never appears in logs
- Transcript text at `debug` level only; gated behind `transcriptLogging = true` config flag
- `turnId = "${streamSid}:${userTurnCount}"` on all turn-scoped log lines for trace reconstruction

### Log Event Catalogue

| Event | Level | Required Fields |
|---|---|---|
| `transport.connected` | info | `streamSid`, `hashedPhone`, `campaignId`, `nodeId` |
| `session.created` | info | `streamSid`, `campaignId`, `nodeId`, `elapsedMs` |
| `session.greeting_sent` | info | `streamSid`, `durationMs` |
| `audio.speech_end` | debug | `streamSid`, `trigger`, `audioBytes`, `durationMs` |
| `stt.completed` | info | `turnId`, `provider`, `latencyMs`, `textLength`, `noSpeechProb` |
| `stt.discarded` | warn | `turnId`, `reason`, `noSpeechProb`, `wordCount` |
| `stt.error` | error | `turnId`, `provider`, `code`, `retryable`, `fallbackProvider?` |
| `llm.completed` | info | `turnId`, `provider`, `latencyMs`, `tokensUsed`, `stage`, `responseLength` |
| `llm.forbidden_phrase_removed` | warn | `turnId`, `phrase` |
| `llm.error` | error | `turnId`, `provider`, `code`, `retryable`, `fallbackProvider?` |
| `tts.first_chunk` | info | `turnId`, `provider`, `latencyMs` |
| `tts.completed` | info | `turnId`, `provider`, `latencyMs`, `playbackMs` |
| `tts.aborted` | info | `turnId`, `reason`, `playedMs` |
| `tts.error` | error | `turnId`, `provider`, `code`, `retryable` |
| `audio.barge_in_detected` | info | `streamSid`, `bargeInCount`, `rms` |
| `audio.echo_discarded` | warn | `streamSid`, `overlapRatio` |
| `turn.completed` | info | `turnId`, `totalDurationMs`, `sttMs`, `llmMs`, `ttsMs` |
| `provider.circuit_open` | warn | `service`, `provider`, `failureCount` |
| `provider.fallback_activated` | warn | `service`, `from`, `to`, `reason` |
| `session.closed` | info | `streamSid`, `reason`, `durationMs`, `totalTurns`, `bargeIns` |
| Any unhandled error | error | `streamSid?`, `turnId?`, `stack`, `code` |

---

## F12. Metrics (Final)

### Session Metrics (emitted on session open and close)

| Name | Type | Labels |
|---|---|---|
| `voice.sessions.active` | Gauge | `node_id` |
| `voice.sessions.total` | Counter | `node_id`, `campaign_id` |
| `voice.sessions.duration_ms` | Histogram | `node_id` |
| `voice.sessions.turns_per_call` | Histogram | `node_id` |
| `voice.sessions.barge_ins_per_call` | Histogram | `node_id` |
| `voice.sessions.close_reason` | Counter | `node_id`, `reason` |

### Turn Metrics (emitted on each completed or aborted turn)

| Name | Type | Labels |
|---|---|---|
| `voice.turn.stt_latency_ms` | Histogram | `node_id`, `provider`, `path` (batch\|stream) |
| `voice.turn.llm_latency_ms` | Histogram | `node_id`, `provider`, `stage` |
| `voice.turn.tts_first_chunk_ms` | Histogram | `node_id`, `provider` |
| `voice.turn.total_perceived_ms` | Histogram | `node_id` (VAD trigger → TTS first chunk) |
| `voice.turn.echo_discards_total` | Counter | `node_id` |
| `voice.turn.hallucination_discards_total` | Counter | `node_id` |
| `voice.turn.aborted_total` | Counter | `node_id`, `reason` |

### Provider Metrics (emitted per provider call)

| Name | Type | Labels |
|---|---|---|
| `voice.provider.calls_total` | Counter | `service`, `provider`, `status` |
| `voice.provider.latency_ms` | Histogram | `service`, `provider` |
| `voice.provider.errors_total` | Counter | `service`, `provider`, `code` |
| `voice.provider.fallbacks_total` | Counter | `service`, `from`, `to` |
| `voice.provider.circuit_state` | Gauge | `service`, `provider` (0=CLOSED, 1=OPEN, 2=HALF_OPEN) |

### Audio Pipeline Metrics

| Name | Type | Labels |
|---|---|---|
| `voice.audio.frames_received_total` | Counter | `node_id` |
| `voice.audio.frames_discarded_total` | Counter | `node_id`, `reason` |
| `voice.audio.vad_events_total` | Counter | `node_id`, `trigger` |
| `voice.audio.cooldown_buffer_flushes_total` | Counter | `node_id` |
| `voice.audio.barge_ins_total` | Counter | `node_id` |

### SLA Alert Thresholds

| Metric | Alert Condition |
|---|---|
| `voice.turn.total_perceived_ms` P95 | > 2,500 ms over 5-min window |
| `voice.provider.errors_total` rate | > 5% of calls for any provider |
| `voice.provider.circuit_state` | Any provider OPEN for > 60 seconds |
| `voice.sessions.active` | > 90% of engineered maximum for node count |
| Node.js event loop lag | > 100 ms P99 |

---

## F13. Deployment Architecture (Final)

### Tier 1: Single Node (immediate — up to ~150 concurrent calls)

```
┌────────────────────────────────────────────────┐
│                   VPS (8 CPU, 8 GB RAM)         │
│                                                 │
│  ┌──────────────┐    ┌─────────────────────┐   │
│  │ Nginx        │    │   PM2 Cluster       │   │
│  │ TLS :443     │───►│   4–8 workers       │   │
│  │ WS proxy     │    │   port 5000         │   │
│  └──────────────┘    └──────────┬──────────┘   │
│                                 │               │
│                  ┌──────────────▼─────────────┐ │
│                  │   MongoDB (local replica)   │ │
│                  └────────────────────────────┘ │
│                                                 │
│  session.store = "memory"                       │
│  codec.useWorkerThreads = false                 │
└────────────────────────────────────────────────┘
```

### Tier 2: Multi-Node (500 concurrent calls)

```
                    ┌────────────────────────────┐
Exotel ─── WSS ────►   Load Balancer             │
                    │   (HAProxy / AWS ALB)       │
                    │   WS sticky by remote IP    │
                    └──────────┬─────────────────┘
               ┌───────────────┼───────────────┐
        ┌──────▼──┐      ┌──────▼──┐     ┌──────▼──┐
        │ Node A  │      │ Node B  │     │ Node C  │
        │ 4 CPUs  │      │ 4 CPUs  │     │ 4 CPUs  │
        │ 8 GB    │      │ 8 GB    │     │ 8 GB    │
        └────┬────┘      └────┬────┘     └────┬────┘
             └────────┬───────┘──────┬─────────┘
                      │              │
               ┌──────▼───┐   ┌──────▼──────┐
               │ Redis 7  │   │  MongoDB    │
               │ (1 node) │   │ (replica 3) │
               └──────────┘   └─────────────┘

Config changes from Tier 1:
  session.store = "redis"
  session.redisUrl = "redis://..."
```

### Tier 3: High-Scale (1,000 concurrent calls)

```
                    ┌──────────────────────────────┐
Exotel ─── WSS ────►  CDN / Anycast (TLS offload)  │
                    └─────────────┬────────────────┘
                    ┌─────────────▼────────────────┐
                    │  Load Balancer (Layer 7 WS)  │
                    └──────┬──────────────┬────────┘
           ┌───────────────┼──────────────┼──────────────┐
     ┌─────▼──┐      ┌─────▼──┐    ┌─────▼──┐    ┌─────▼──┐
     │Node A  │  ... │Node F  │    │Node G  │    │Node H  │
     │8 CPU   │      │8 CPU   │    │8 CPU   │    │8 CPU   │
     └──┬─────┘      └──┬─────┘    └──┬─────┘    └──┬─────┘
        └───────────────┼─────────────┘──────────────┘
                        │
           ┌────────────▼────────────────────────────┐
           │                                         │
    ┌──────▼──────┐   ┌────────────────┐   ┌────────▼───────┐
    │ Redis Cluster│   │  MongoDB M30+  │   │  Prometheus    │
    │ (3 shards)  │   │  (Atlas)       │   │  + Grafana     │
    └─────────────┘   └────────────────┘   └────────────────┘

Config changes from Tier 2:
  codec.useWorkerThreads = true
  codec.workerPoolSize = 2
  metrics.collector = "prometheus"
  stt.provider = "deepgram"    ← required at this volume; Whisper rate limits prohibitive
```

### Zero-Downtime Deployment

PM2 rolling reload (`pm2 reload nijvox`) sends `SIGINT` to one worker at a time and waits for `graceful_shutdown_timeout` before starting the replacement. The `VoiceEngine.shutdown()` method:
1. Stops accepting new WS upgrades
2. Waits for all active sessions to close naturally (or until `drain_timeout_ms = 30,000`)
3. Force-closes remaining sessions
4. Returns, allowing the process to exit cleanly

---

## F14. Scalability Strategy (Final)

### Concurrency capacity model

```
Per worker:
  Concurrent WS connections: ~75 (limited by event loop throughput, not memory)
  Memory per call: ~1.7 MB (audio buffers 160KB + history 40KB + overhead)
  CPU per call per second: ~0.5% (codec + VAD + gate logic)

Per node (4 workers):
  Concurrent calls: ~300 (conservative; tested at 200 before codec offload)
  Memory: 300 × 1.7 MB = 510 MB + 400 MB Node.js = ~1 GB
  CPU at 300 calls: 300 × 0.5% = 150% = ~1.5 cores (4 cores available = 38% utilisation)

Scale:
  100 concurrent:  1 node (Tier 1)
  500 concurrent:  2 nodes (Tier 2)
  1,000 concurrent: 4 nodes + codec worker threads (Tier 3)
  100,000/day peak: 1,667 concurrent = ~6 nodes (Tier 3 × 1.5)
```

### Event loop protection

At scale, the synchronous VAD and codec operations run on every audio frame across all concurrent calls. Protection measures:
1. `codec.useWorkerThreads = true` (Tier 3): moves resampling off the event loop
2. Event loop lag alert at 100 ms P99: triggers capacity scale-out
3. No blocking I/O anywhere in the engine (all provider calls are async HTTP)
4. `setImmediate()` yield points in tight loops (e.g., large buffer operations)

### MongoDB connection management

At all tiers, MongoDB is read exactly once per session (campaign snapshot on `connected`). All subsequent MongoDB writes are asynchronous (call log on close). Connection pool sizing: `min(nodeWorkers × 5, 100)` connections per node.

---

## F15. Future Extensibility Map

| Future Feature | Extension Point | Engine Changes Required |
|---|---|---|
| Conversation memory | `PromptBuildOptions.memoryContext` (already defined) | None — `MemoryService` subscribes to `session.created` and `turn.completed` |
| Knowledge versioning | `CampaignSnapshot.version` (already defined) | None — increment version on campaign update |
| Supervisor monitoring | `SupervisorChannel` subscribes to session event bus | None |
| Call analytics | `PostCallAnalyzer` subscribes to `session.closed` | None |
| Quality scoring | `QualityScorer` subscribes to `session.closed` | None |
| Voice cloning | `CampaignSnapshot.customVoiceId` → `TTSOptions.voice` | Campaign schema field only |
| Custom AI providers | `ProviderRegistry.register*()` + plugin loading | None |
| New telephony carrier | Implement `TelephonyProvider`; register under new key | None |
| RAG knowledge retrieval | `PromptBuildOptions.retrievedChunks` (already defined) | None — RAG service calls before `LLMService` |
| Real-time transcription dashboard | Subscriber to `stt.completed` events | None |
| Multi-language support | `STTOptions.languageHint`; `TTSOptions.voice`; `CampaignSnapshot.language` | Campaign schema field only |
| Sentiment analysis per turn | Subscriber to `llm.completed`; inline lightweight model | None |
| A/B provider testing | `ProviderRegistry` weighted resolution | Minor: add weight to `providerChain` entries |

---

## F16. Testing Layers Summary

| Layer | Tool | Target | Gate |
|---|---|---|---|
| Unit | Vitest / Jest | Each module in isolation; mock all interfaces | CI: every commit |
| Provider contract | Shared test suite | Every provider implements the interface correctly | CI: every commit |
| Integration | Vitest + in-process mocks | Full turn scenarios; barge-in; fallback; teardown | CI: every commit |
| Audio quality | Custom test harness + FFT | Codec fidelity; VAD accuracy; PESQ score | CI: nightly |
| Latency regression | In-process bench + mock providers | P50/P95 latency SLA; event loop overhead | CI: every commit |
| Load | k6 (WebSocket) | 100/500/1,000 concurrent; ramp; endurance | Release gate |
| Security | OWASP ZAP + manual | WS endpoint auth; PII leakage; header injection | Release gate |

---

## F17. Security Summary

| Concern | Control |
|---|---|
| WebSocket authentication | Exotel signature validation in `TelephonyProvider.accept()` |
| TLS | Nginx terminates; WSS enforced; providers use HTTPS |
| API key storage | Primary: environment variables. Per-user: AES-256-GCM encrypted in MongoDB |
| PII in logs | Phone numbers HMAC-SHA256 hashed; transcripts behind `transcriptLogging` flag |
| Audio at rest | Not persisted by default; object storage + SSE if recording enabled |
| Recording access | Signed URLs, 15-min TTL; never direct file access |
| KB confidentiality | Owner-scoped access; transmitted to declared LLM provider only |
| Rate limiting | Nginx `limit_conn_zone`; session TTL; frame size gate (10 KB max) |
| Dependency audit | `npm audit` in CI; dependabot alerts |

---

## Appendix A — Key Numeric Constants (Authoritative)

| Constant | Value | Rationale |
|---|---|---|
| `VAD_THRESHOLD` | 200 RMS | Telephony noise floor at 8 kHz |
| `BARGE_IN_THRESHOLD` | 700 RMS | Above echo (300–500 RMS); empirically validated |
| `BARGE_IN_MIN_CHUNKS` | 3 | ~300 ms sustained; prevents echo barge-in |
| `COOLDOWN_BUFFER_MIN_RMS` | 600 RMS | Between echo ceiling (500) and barge-in floor (700) |
| `MIN_AUDIO_BYTES` | 4,800 | 300 ms at 8 kHz PCM16; below = noise burst |
| `NO_SPEECH_THRESHOLD` | 0.5 | Whisper coin-flip boundary; empirically validated |
| `POST_SPEECH_BUFFER_MS` | 900 | Phone playout lag after WS stream ends |
| `POST_BARGE_IN_COOLDOWN_MS` | 250 | Exotel clears buffer on Clear command |
| `SILENCE_TIMEOUT_MS` | 800 | Natural pause; batch STT path |
| `SILENCE_TIMEOUT_STREAM_MS` | 400 | Natural pause; streaming STT path (STT already has result) |
| `FORCE_PROCESS_MS` | 5,000 | Maximum utterance length before forced STT |
| `FILLER_PROBABILITY` | 0.85 | Skip filler 15% of turns for naturalness |
| `MAX_TOKENS` | 80 | Keeps responses short; reduces TTS latency |
| `TEMPERATURE` | 0.20 | Low variance; predictable sales arc |
| `HISTORY_MAX_TURNS` | 100 | Rolling LLM context window; older turns retained for analytics |
| `SESSION_TTL_MS` | 3,600,000 | 1 hour; orphaned session expiry |
| `CIRCUIT_BREAKER_THRESHOLD` | 5 | Consecutive failures before provider bypass |
| `CIRCUIT_BREAKER_OPEN_MS` | 30,000 | Duration before half-open probe |
| `GRACEFUL_SHUTDOWN_TIMEOUT_MS` | 30,000 | Wait for active sessions before force-close |

All constants are configurable via `VoiceEngineConfig`. None are hardcoded in logic files.

---

## Appendix B — What This Specification Does Not Cover

The following exist in the platform and are unaffected by this specification:

| Module | Interaction with Voice Engine |
|---|---|
| `server/wsServer.ts` | One line change: `handleExotelStream` → `engine.handleExotelUpgrade` |
| `server/callMap.ts` | Read-only: `phoneCallMap` lookup on `transport.connected` |
| `server/storage.ts` | Read-only: `getCampaign()` on session create; `upsertCallLog()` on session close |
| `server/exotelService.ts` | Unchanged: outbound call initiation REST API |
| `shared/schema.ts` | Read-only: `Campaign` type imported as `CampaignData`; `CallLog` type for write |
| Auth, CRM, Dashboard, Billing | Zero interaction with voice engine |

---

*This document is frozen. Implementation begins against this specification. Any deviation requires a formal amendment and re-freeze.*
