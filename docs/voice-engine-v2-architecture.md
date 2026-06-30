# NIJVOX Voice Engine V2 — Architecture Specification

**Document Type:** Architecture Specification (read-only reference)  
**Status:** Proposed — pending engineering review  
**Scope:** Voice Engine subsystem only. All other platform modules (Auth, Campaign Management, CRM, Dashboard, MongoDB, Express routing, Exotel outbound REST) are out of scope and must remain untouched.

---

## Table of Contents

1. [Folder Structure](#1-folder-structure)
2. [Module Responsibilities](#2-module-responsibilities)
3. [Interfaces Between Modules](#3-interfaces-between-modules)
4. [Session Lifecycle](#4-session-lifecycle)
5. [Audio Lifecycle](#5-audio-lifecycle)
6. [Data Flow Diagram](#6-data-flow-diagram)
7. [Provider Abstraction](#7-provider-abstraction)
8. [Dependency Graph](#8-dependency-graph)
9. [Configuration Strategy](#9-configuration-strategy)
10. [Error Handling Strategy](#10-error-handling-strategy)
11. [Logging Strategy](#11-logging-strategy)
12. [Metrics](#12-metrics)
13. [Deployment Architecture](#13-deployment-architecture)
14. [Scalability Strategy](#14-scalability-strategy)
15. [Future Extensibility](#15-future-extensibility)

---

## 1. Folder Structure

The Voice Engine V2 lives entirely under `server/voice-engine/`. Nothing outside this directory is created or modified. The existing platform continues to import only through the single public entry point: `server/voice-engine/index.ts`.

```
server/
└── voice-engine/
    │
    ├── index.ts                        ← Public entry point (sole export surface)
    │
    ├── config/
    │   ├── defaults.ts                 ← Compile-time safe defaults for all tunables
    │   └── schema.ts                   ← Zod validation schema for runtime config object
    │
    ├── session/
    │   ├── SessionManager.ts           ← Create, retrieve, destroy sessions; owns the registry
    │   ├── SessionStore.ts             ← Interface: in-process Map (default) or Redis adapter
    │   ├── adapters/
    │   │   ├── InMemorySessionStore.ts ← Single-node default
    │   │   └── RedisSessionStore.ts    ← Horizontal-scaling adapter
    │   └── types.ts                    ← VoiceSession shape and all session-scoped types
    │
    ├── transport/
    │   ├── ExotelTransport.ts          ← WebSocket lifecycle for one Exotel call leg
    │   ├── ProtocolParser.ts           ← Exotel JSON envelope parsing (connected/media/stop)
    │   └── types.ts                    ← ExotelEnvelope, MediaFrame, TransportEvent shapes
    │
    ├── audio/
    │   ├── AudioPipeline.ts            ← Orchestrates codec → VAD → buffer → flush
    │   ├── Codec.ts                    ← μ-law ↔ PCM16 encode/decode + resampler
    │   ├── VoiceActivityDetector.ts    ← RMS-based VAD with silence timer and force timer
    │   ├── EchoGuard.ts               ← Cooldown window + cooldown buffer + word-overlap check
    │   ├── WavBuilder.ts              ← Produces standard WAV container from PCM frames
    │   └── types.ts                    ← AudioFrame, VADEvent, EchoGuardState shapes
    │
    ├── stt/
    │   ├── STTProvider.ts              ← Interface: transcribe(audio: AudioFrame): Promise<STTResult>
    │   ├── STTService.ts               ← Selects provider, applies no_speech_prob guard, retries
    │   └── providers/
    │       ├── WhisperSTTProvider.ts   ← OpenAI Whisper implementation
    │       ├── DeepgramSTTProvider.ts  ← (stub — future)
    │       └── GoogleSTTProvider.ts    ← (stub — future)
    │
    ├── llm/
    │   ├── LLMProvider.ts              ← Interface: complete(messages, options): Promise<LLMResult>
    │   ├── LLMService.ts               ← Stage router, system-prompt builder, history manager
    │   ├── PromptBuilder.ts            ← Assembles system prompt from campaign + stage + KB
    │   ├── ConversationStage.ts        ← Stage enum + turn-count thresholds
    │   ├── ForbiddenPhraseFilter.ts    ← Post-generation phrase stripping
    │   └── providers/
    │       ├── OpenAILLMProvider.ts    ← GPT-4o implementation
    │       ├── AnthropicLLMProvider.ts ← (stub — future)
    │       └── GeminiLLMProvider.ts    ← (stub — future)
    │
    ├── tts/
    │   ├── TTSProvider.ts              ← Interface: synthesize(text, options): AsyncIterable<AudioChunk>
    │   ├── TTSService.ts               ← Selects provider, encodes for Exotel, manages streaming
    │   ├── FillerService.ts            ← Selects and injects low-latency filler phrases
    │   └── providers/
    │       ├── OpenAITTSProvider.ts    ← OpenAI tts-1 streaming implementation
    │       ├── ElevenLabsTTSProvider.ts← (stub — future)
    │       └── AzureTTSProvider.ts     ← (stub — future)
    │
    ├── pipeline/
    │   ├── TurnOrchestrator.ts         ← Coordinates STT → LLM → TTS for one turn
    │   ├── GreetingController.ts       ← Fires greeting exactly once, gates all other processing
    │   └── BargeInController.ts        ← Detects barge-in, sends Clear, interrupts active TTS
    │
    ├── metrics/
    │   ├── MetricsCollector.ts         ← Interface: record(event: MetricEvent): void
    │   ├── InProcessCollector.ts       ← In-memory aggregator (default)
    │   ├── PrometheusCollector.ts      ← Prometheus counter/histogram exposition
    │   └── types.ts                    ← MetricEvent union type
    │
    ├── monitoring/
    │   ├── HealthProbe.ts              ← /health and /ready endpoint handlers
    │   └── AlertSink.ts               ← Interface: notify(alert: Alert): Promise<void>
    │
    ├── errors/
    │   ├── VoiceEngineError.ts         ← Base error class with code + context
    │   ├── codes.ts                    ← Enum of all engine error codes
    │   └── handlers.ts                 ← Per-error recovery strategies
    │
    └── logger/
        ├── Logger.ts                   ← Structured logger interface (info/warn/error/debug)
        └── adapters/
            ├── ConsoleLogger.ts        ← Development / single-node
            └── PinoLogger.ts           ← Production JSON logger
```

**Boundary rule:** The platform's existing `server/wsServer.ts` retains its `httpServer.on('upgrade')` routing. It calls `server/voice-engine/index.ts` ← `ExotelTransport` for the `/exotel-stream` path only. No voice-engine module imports from any other `server/` file except through the two approved seams: `callMap.ts` (read-only) and `storage.ts` (read-only: `getCampaign`, `upsertCallLog`).

---

## 2. Module Responsibilities

### 2.1 `config/`
Owns every tunable value the engine uses at runtime. Provides a single validated configuration object consumed by all other modules. No other module reads `process.env` directly.

| Responsibility | Details |
|---|---|
| Schema validation | Zod parse at startup; hard-fail if required values missing |
| Safe defaults | All optional tunables have compile-time defaults |
| Per-provider config | Each provider block is an opaque record forwarded at construction time |
| Hot-reload surface | Optional watch mechanism for non-secret tunables (thresholds, timeouts) |

### 2.2 `session/`
Owns the lifecycle registry of all active call sessions. A session is the unit of horizontal isolation: all state for one phone call lives in one session object.

| Responsibility | Details |
|---|---|
| Session creation | Allocate `VoiceSession` on `connected` event |
| Session lookup | Thread-safe retrieval by `streamSid` |
| Session destruction | Flush metrics, write `CallLog`, release buffers on `stop` or timeout |
| Store abstraction | `SessionStore` interface lets the registry back onto Redis without changing callers |
| TTL enforcement | Sessions orphaned by dropped WebSockets expire after configurable TTL |

### 2.3 `transport/`
Owns the raw WebSocket connection to Exotel. Translates binary WebSocket frames into structured `TransportEvent` objects and vice versa. Has no knowledge of audio content, STT, LLM, or TTS.

| Responsibility | Details |
|---|---|
| Connection lifecycle | `open`, `close`, `error` events |
| Envelope parsing | `connected`, `media`, `stop` JSON envelopes |
| Media frame extraction | Base64 decode → raw `Buffer` |
| Outbound framing | Accepts `AudioChunk` from TTS layer, encodes to Exotel `media` event |
| Clear command | `sendClear(streamSid)` for barge-in interruption |

### 2.4 `audio/`
Owns all signal processing. Transforms raw telephony bytes into a form suitable for STT and TTS output back into a form suitable for Exotel. Stateless except for the VAD and echo-guard state objects that live on the session.

| Responsibility | Details |
|---|---|
| Codec | μ-law ↔ PCM16 encode/decode; linear resampler (8 kHz ↔ 16 kHz ↔ 24 kHz) |
| VAD | RMS energy → voiced/silent classification; silence timer; force-process timer |
| Echo guard | Post-speech cooldown window; cooldown buffer with high-energy threshold; word-overlap guard |
| WAV construction | Wraps PCM frames in standard RIFF/WAV container for STT APIs that require a file |
| Buffer management | Accumulate `mediaChunks`; flush on VAD trigger; clear after STT handoff |

### 2.5 `stt/`
Owns speech-to-text. Accepts a captured audio buffer and returns a transcript string. Provider is selected at startup via config; the rest of the engine never references a specific provider.

| Responsibility | Details |
|---|---|
| Provider selection | Factory reads `config.stt.provider` |
| Pre-flight validation | Minimum audio gate (300 ms / 4800 bytes); reject silence |
| Confidence filtering | `no_speech_prob` threshold check (verbose_json path) |
| Hallucination guard | Empty-segment heuristic for very short clips |
| Retry | Exponential backoff on transient provider errors |
| Result normalisation | Returns `{ text, confidence, durationMs, provider }` |

### 2.6 `llm/`
Owns language model interaction. Accepts conversation history + campaign context and returns the next agent utterance. Stage transitions and prompt construction are internal details.

| Responsibility | Details |
|---|---|
| Stage routing | `ConversationStage` transitions on `userTurnCount` |
| Prompt assembly | `PromptBuilder` injects KB, rules, stage instructions, forbidden phrases |
| History management | Append, trim to token budget, duplicate-message guard |
| Provider selection | Factory reads `config.llm.provider` |
| Post-generation filtering | `ForbiddenPhraseFilter` strips prohibited phrases |
| Result normalisation | Returns `{ text, stage, tokensUsed, latencyMs, provider }` |

### 2.7 `tts/`
Owns text-to-speech. Accepts a text string and streams audio chunks back to the transport layer in real time. Manages the post-speech playback timing that feeds the echo guard.

| Responsibility | Details |
|---|---|
| Provider selection | Factory reads `config.tts.provider` |
| Streaming | Yields `AudioChunk` incrementally; does not buffer entire response |
| Codec conversion | Converts provider output (PCM 24 kHz) to Exotel format (PCM 8 kHz → μ-law) |
| Playback accounting | Accumulates `ttsPlaybackMs` for echo-guard cooldown calculation |
| Filler injection | `FillerService` emits a short low-latency phrase while LLM is pending |

### 2.8 `pipeline/`
Owns turn-level orchestration. Coordinates the three provider services for a single conversational turn. Knows about greeting sequencing and barge-in interruption. Has no provider-specific knowledge.

| Responsibility | Details |
|---|---|
| Greeting gate | `GreetingController` fires once, sets `greetingDone`, blocks all other processing until complete |
| Turn lock | `processing` mutex prevents concurrent turns |
| Filler + LLM parallelism | Starts filler TTS while awaiting LLM response |
| Barge-in | `BargeInController` detects high-energy chunks during TTS; sends Clear; aborts TTS stream |
| Turn reset | Clears buffers, resets timers, releases lock on turn completion |

### 2.9 `metrics/`
Owns operational telemetry. Emits structured events that can be consumed by in-process aggregators or external systems.

### 2.10 `monitoring/`
Owns health and readiness probes consumed by load balancers and orchestration systems.

### 2.11 `errors/`
Owns the error taxonomy. Every engine error has a machine-readable code, a human message, and a structured context payload.

### 2.12 `logger/`
Owns structured logging. All modules receive a logger instance at construction; no module calls `console.log` directly.

---

## 3. Interfaces Between Modules

All cross-module contracts are expressed as TypeScript interfaces defined in each module's `types.ts`. No concrete class from one module is imported by another module; only interfaces cross module boundaries.

### 3.1 Core Interface Definitions

```
STTProvider
───────────
transcribe(frame: AudioFrame, options: STTOptions): Promise<STTResult>

  AudioFrame    { pcm16: Int16Array; sampleRate: number; durationMs: number }
  STTOptions    { prompt?: string; languageHint?: string }
  STTResult     { text: string; confidence: number; noSpeechProb: number;
                  durationMs: number; provider: string; segments?: STTSegment[] }


LLMProvider
───────────
complete(messages: ConversationMessage[], options: LLMOptions): Promise<LLMResult>

  ConversationMessage  { role: "system"|"user"|"assistant"; content: string }
  LLMOptions           { systemPrompt: string; maxTokens: number; temperature: number }
  LLMResult            { text: string; tokensUsed: number; latencyMs: number; provider: string }


TTSProvider
───────────
synthesize(text: string, options: TTSOptions): AsyncIterable<AudioChunk>

  TTSOptions   { voice: string; sampleRate: number; encoding: "pcm"|"mulaw"|"opus" }
  AudioChunk   { data: Buffer; durationMs: number; isFinal: boolean }


SessionStore
────────────
get(streamSid: string): Promise<VoiceSession | null>
set(streamSid: string, session: VoiceSession): Promise<void>
delete(streamSid: string): Promise<void>
all(): Promise<VoiceSession[]>


MetricsCollector
────────────────
record(event: MetricEvent): void
flush(): Promise<void>

  MetricEvent = TurnMetric | SessionMetric | ProviderMetric | ErrorMetric


Logger
──────
info(message: string, context?: Record<string, unknown>): void
warn(message: string, context?: Record<string, unknown>): void
error(message: string, error?: Error, context?: Record<string, unknown>): void
debug(message: string, context?: Record<string, unknown>): void
child(bindings: Record<string, unknown>): Logger
```

### 3.2 Module Coupling Matrix

```
                  config session transport audio  stt   llm   tts  pipeline metrics logger
config              ─      ←       ←        ←      ←     ←     ←     ←        ←      ←
session             →      ─       ←        ○      ○     ○     ○     ←        →      ←
transport           →      →       ─        →      ○     ○     ○     →        →      ←
audio               →      →       ←        ─      →     ○     ←     ←        →      ←
stt                 →      ○       ○        ←      ─     ○     ○     ←        →      ←
llm                 →      ○       ○        ○      ○     ─     ○     ←        →      ←
tts                 →      ○       →        →      ○     ○     ─     ←        →      ←
pipeline            →      →       →        →      →     →     →     ─        →      ←
metrics             →      ○       ○        ○      ○     ○     ○     ○        ─      ←
logger              ○      ○       ○        ○      ○     ○     ○     ○        ○      ─

→  module in column receives a dependency on module in row
←  module in row receives a dependency on module in column
○  no coupling
```

**Key rule:** Only `pipeline/` depends on `stt/`, `llm/`, and `tts/` simultaneously. No other module crosses more than two provider layers.

### 3.3 Public Engine API (server/voice-engine/index.ts)

The only surface the existing platform touches:

```
createVoiceEngine(config: VoiceEngineConfig): VoiceEngine

VoiceEngine {
  handleExotelUpgrade(req, socket, head): void   ← called by wsServer.ts
  getHealth(): HealthStatus
  getMetrics(): MetricsSummary
  shutdown(): Promise<void>
}
```

The existing `wsServer.ts` replaces its direct `handleExotelStream` call with `engine.handleExotelUpgrade(...)`. No other change to `wsServer.ts` is required.

---

## 4. Session Lifecycle

A session maps exactly to one Exotel call leg (one WebSocket connection from Exotel's media stream server).

### 4.1 State Machine

```
                   ┌──────────────────────────────────────────────────────┐
                   │                                                      │
  WS connect  →  INITIALISING  →  GREETING  →  ACTIVE  →  CLOSING  →  CLOSED
                       │              │           │           │
                       │              │     ┌─────▼─────┐    │
                       │              │     │ BARGE_IN   │    │
                       │              │     └─────┬─────┘    │
                       │              │           │           │
                       └──────────────┴───────────┘           │
                                ERROR (any state)  ────────────┘
```

| State | Entry Condition | Exit Condition |
|---|---|---|
| `INITIALISING` | WebSocket `open` + `connected` envelope received | `sendGreeting()` starts |
| `GREETING` | Greeting TTS stream begins | All greeting chunks flushed + cooldown armed |
| `ACTIVE` | `greetingDone = true` | Caller hangs up, agent closes, error, or TTL |
| `BARGE_IN` | High-energy audio during AI speech | Clear sent, TTS aborted, STT begins |
| `CLOSING` | `stop` envelope received or WS `close` | Metrics flushed, `CallLog` written |
| `CLOSED` | `CLOSING` teardown complete | Session removed from registry |

### 4.2 VoiceSession Shape

```
VoiceSession {
  // Identity
  streamSid:           string
  campaignId:          string | undefined
  callSid:             string | undefined
  nodeId:              string            ← hostname of handling node

  // State machine
  state:               SessionState      ← enum of states above
  userTurnCount:       number
  greetingDone:        boolean

  // Audio accumulation
  mediaChunks:         Buffer[]
  cooldownBuffer:      Buffer[]
  firstChunkAt:        number | null
  voicedChunks:        number
  bargeInCount:        number

  // Timing
  postSpeechCooldownUntil: number
  ttsPlaybackMs:           number

  // Turn lock
  processing:          boolean
  isSpeaking:          boolean

  // Timers (not serialisable — only in InMemorySessionStore)
  silenceTimer:        TimerHandle | null
  forceTimer:          TimerHandle | null

  // Conversation
  conversationHistory: ConversationMessage[]
  campaignCache:       CampaignData | undefined

  // Lifecycle timestamps
  createdAt:           number
  lastActivityAt:      number
  closedAt:            number | undefined
}
```

### 4.3 Session Teardown Sequence

1. Receive `stop` envelope **or** WebSocket `close`/`error`
2. Cancel `silenceTimer` and `forceTimer`
3. Abort any in-flight STT, LLM, or TTS requests (via `AbortController`)
4. Flush remaining `MetricEvent`s
5. Write `CallLog` record via `storage.upsertCallLog`
6. Remove session from `SessionStore`
7. Emit `session.closed` log line with full summary

---

## 5. Audio Lifecycle

One audio lifecycle corresponds to one conversational turn: from the moment the caller begins speaking to the moment the agent's response finishes playing.

### 5.1 Inbound Path (Caller → STT)

```
Stage 1 — Receive
  Exotel WS `media` event
    → ProtocolParser extracts base64 payload
    → Buffer.from(payload, "base64")   [raw μ-law, 8 kHz]

Stage 2 — Codec
  Codec.mulawToInt16(rawBuffer)        [Int16Array, 8 kHz]

Stage 3 — Energy measurement
  AudioPipeline.rmsLevel(pcmBuffer)

Stage 4 — Gate decisions (in order, short-circuit on first match)
  4a. Cooldown gate:  now < postSpeechCooldownUntil
        → rms > COOLDOWN_BUFFER_MIN_RMS (600) ?
             yes → push to cooldownBuffer
             no  → discard
        → break (do not accumulate)

  4b. Barge-in gate: session.isSpeaking
        → rms > BARGE_IN_THRESHOLD (700) AND voicedChunks++ >= BARGE_IN_MIN_CHUNKS (3) ?
             yes → BargeInController.trigger()
             no  → discard

  4c. VAD gate: rms > VAD_THRESHOLD (200)
        → voicedChunks++
        → push to mediaChunks
        → arm silenceTimer (800 ms) if not armed
        → arm forceTimer (5000 ms) if not armed

  4d. Silence gate: rms <= VAD_THRESHOLD
        → if silenceTimer running: no-op (timer handles flush)
        → else: discard

Stage 5 — Timer fires (silence or force)
  → flush cooldownBuffer prepended to mediaChunks
  → hand combined buffer to TurnOrchestrator.beginTurn()

Stage 6 — Pre-STT validation
  total bytes >= 4800 (300 ms)?     no  → discard turn
  STTService.transcribe(audioFrame)

Stage 7 — Whisper response (verbose_json)
  compute avg(segment.no_speech_prob)
  avg >= 0.5 ?                       yes → discard (echo/silence hallucination)
  no segments AND short clip AND >6 words ? → discard (empty-segment heuristic)
  return STTResult.text
```

### 5.2 Outbound Path (TTS → Exotel)

```
Stage 1 — LLM produces text
  TurnOrchestrator has full response string

Stage 2 — TTS streaming begins
  TTSService.synthesize(text, { sampleRate: 24000, encoding: "pcm" })
    → AsyncIterable<AudioChunk>  [PCM 24 kHz chunks]

Stage 3 — Per-chunk processing
  Codec.resamplePCM16(chunk, 24000, 8000)  → PCM 8 kHz
  Codec.int16ToMulaw(pcm8k)               → μ-law buffer
  Base64 encode
  ttsPlaybackMs += Codec.pcm8kPlaybackMs(chunkBytes)
  ExotelTransport.sendMedia(streamSid, base64Chunk)

Stage 4 — Stream end
  postSpeechCooldownUntil = now + ttsPlaybackMs + POST_SPEECH_BUFFER_MS (900)
  isSpeaking = false
  resetTurn()
```

### 5.3 Barge-In Interruption Path

```
BargeInController detects sustained high energy during Stage 2/3 above
  → ExotelTransport.sendClear(streamSid)   ← Exotel flushes its playout buffer
  → TTSProvider stream.abort()              ← HTTP request cancelled
  → postSpeechCooldownUntil = now + 250    ← short cooldown (buffer already cleared)
  → isSpeaking = false
  → bargeInCount++
  → TurnOrchestrator.abortTurn()
  → cooldownBuffer pre-loaded with triggering chunks
  → next silenceTimer fires → beginTurn() as normal
```

---

## 6. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXOTEL MEDIA STREAM                               │
│                         (WebSocket, μ-law 8 kHz)                            │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ WS frames
                    ┌──────────────▼──────────────┐
                    │       ExotelTransport        │
                    │  ProtocolParser (JSON env)   │
                    └──────────────┬──────────────┘
                                   │ TransportEvent{media|connected|stop}
                    ┌──────────────▼──────────────┐
                    │        AudioPipeline         │◄── EchoGuard
                    │  Codec · VAD · BufferMgr     │◄── VoiceActivityDetector
                    └──────────────┬──────────────┘
                                   │ AudioFrame (PCM16, 8kHz)
          ┌────────────────────────▼────────────────────────┐
          │                  TurnOrchestrator                │
          │    GreetingController · BargeInController        │
          └───┬───────────────────────────────────────┬──────┘
              │ AudioFrame                            │ text response
   ┌──────────▼──────────┐               ┌────────────▼───────────┐
   │      STTService      │               │       TTSService        │
   │  + confidence filter │               │  + FillerService       │
   └──────────┬──────────┘               └────────────┬───────────┘
              │ transcript                             │ AudioChunk stream
   ┌──────────▼──────────┐                            │ (PCM 24kHz → 8kHz → μ-law)
   │      LLMService      │                ┌──────────▼──────────┐
   │  PromptBuilder       │                │    ExotelTransport   │
   │  Stage router        │                │    (outbound media)  │
   │  ForbiddenFilter     │                └─────────────────────┘
   └──────────┬──────────┘
              │ text
              └───────────────────────────────────► TTSService (above)

Side channels (non-blocking):
  All components → MetricsCollector → [InProcess | Prometheus]
  All components → Logger → [Console | Pino JSON]
  SessionManager ← All components (read session state)
  SessionManager → storage.upsertCallLog (on session close)
  SessionManager → callMap (read campaignId on connect)

External provider calls:
  STTService  → [Whisper API | Deepgram | Google STT]
  LLMService  → [GPT-4o | Claude | Gemini]
  TTSService  → [OpenAI TTS | ElevenLabs | Azure TTS]
```

---

## 7. Provider Abstraction

### 7.1 Design Principle

Each provider type (`STT`, `LLM`, `TTS`) has exactly one interface. All engine code inside `pipeline/` and `audio/` programs to that interface only. Provider-specific code is isolated to `providers/` subdirectories. Switching a provider requires only a config change; no engine code changes.

### 7.2 Provider Registry

A `ProviderRegistry` is constructed once at engine startup. It reads `config.stt.provider`, `config.llm.provider`, `config.tts.provider` and instantiates the corresponding concrete class. The registry is injected into `STTService`, `LLMService`, and `TTSService` respectively.

```
ProviderRegistry
  registerSTT(name: string, factory: (cfg: unknown) => STTProvider): void
  registerLLM(name: string, factory: (cfg: unknown) => LLMProvider): void
  registerTTS(name: string, factory: (cfg: unknown) => TTSProvider): void
  resolveSTT(): STTProvider
  resolveLLM(): LLMProvider
  resolveTTS(): TTSProvider
```

Built-in registrations (done in `index.ts` before engine starts):

| Service | Key | Class |
|---|---|---|
| STT | `"whisper"` | `WhisperSTTProvider` |
| STT | `"deepgram"` | `DeepgramSTTProvider` |
| STT | `"google"` | `GoogleSTTProvider` |
| LLM | `"openai"` | `OpenAILLMProvider` |
| LLM | `"anthropic"` | `AnthropicLLMProvider` |
| LLM | `"gemini"` | `GeminiLLMProvider` |
| TTS | `"openai"` | `OpenAITTSProvider` |
| TTS | `"elevenlabs"` | `ElevenLabsTTSProvider` |
| TTS | `"azure"` | `AzureTTSProvider` |

### 7.3 Provider Configuration Contract

Each provider receives an opaque `providerConfig: Record<string, unknown>` at construction time. The provider is responsible for extracting and validating its own keys. The engine core never reads provider-specific keys.

### 7.4 Provider Interface Contracts

**STTProvider — non-negotiable contract:**
- Must return `STTResult` within `config.stt.timeoutMs` or throw `STTTimeoutError`
- Must handle silence (return `{ text: "" }`) rather than throwing
- Must not buffer entire audio before returning — must process the passed `AudioFrame` directly

**LLMProvider — non-negotiable contract:**
- Must return `LLMResult` with non-empty `text` or throw
- Must respect `options.maxTokens` and `options.temperature` (map to provider equivalents)
- Streaming variant is optional at the provider level; `LLMService` uses the completion path

**TTSProvider — non-negotiable contract:**
- Must return an `AsyncIterable<AudioChunk>` that yields within `config.tts.firstChunkTimeoutMs`
- Each `AudioChunk.data` must be raw PCM at the sample rate declared in `TTSOptions`
- Final chunk must have `isFinal: true`
- Must support `AbortController` for barge-in cancellation

### 7.5 Fallback Provider Chain

Each service supports an ordered fallback list. If the primary provider throws a retryable error, the service attempts the next provider in the chain transparently, emitting a `ProviderFallbackMetric`.

```
config.stt.providerChain: ["whisper", "google"]
config.llm.providerChain: ["openai", "anthropic"]
config.tts.providerChain: ["openai", "elevenlabs"]
```

---

## 8. Dependency Graph

Edges represent "A depends on B" (A imports from B).

```
index.ts
  ├── config/schema.ts
  ├── config/defaults.ts
  ├── session/SessionManager.ts
  │     ├── session/SessionStore.ts (interface)
  │     │     ├── adapters/InMemorySessionStore.ts
  │     │     └── adapters/RedisSessionStore.ts
  │     └── session/types.ts
  ├── transport/ExotelTransport.ts
  │     ├── transport/ProtocolParser.ts
  │     └── transport/types.ts
  ├── audio/AudioPipeline.ts
  │     ├── audio/Codec.ts
  │     ├── audio/VoiceActivityDetector.ts
  │     ├── audio/EchoGuard.ts
  │     ├── audio/WavBuilder.ts
  │     └── audio/types.ts
  ├── stt/STTService.ts
  │     ├── stt/STTProvider.ts (interface)
  │     └── stt/providers/WhisperSTTProvider.ts
  ├── llm/LLMService.ts
  │     ├── llm/LLMProvider.ts (interface)
  │     ├── llm/PromptBuilder.ts
  │     ├── llm/ConversationStage.ts
  │     ├── llm/ForbiddenPhraseFilter.ts
  │     └── llm/providers/OpenAILLMProvider.ts
  ├── tts/TTSService.ts
  │     ├── tts/TTSProvider.ts (interface)
  │     ├── tts/FillerService.ts
  │     └── tts/providers/OpenAITTSProvider.ts
  ├── pipeline/TurnOrchestrator.ts
  │     ├── pipeline/GreetingController.ts
  │     ├── pipeline/BargeInController.ts
  │     ├── stt/STTService.ts          [injected]
  │     ├── llm/LLMService.ts          [injected]
  │     └── tts/TTSService.ts          [injected]
  ├── metrics/MetricsCollector.ts (interface)
  │     ├── metrics/InProcessCollector.ts
  │     └── metrics/PrometheusCollector.ts
  ├── monitoring/HealthProbe.ts
  ├── errors/VoiceEngineError.ts
  │     └── errors/codes.ts
  └── logger/Logger.ts (interface)
        ├── logger/adapters/ConsoleLogger.ts
        └── logger/adapters/PinoLogger.ts

Acyclic verification rules:
  - logger/ has zero imports from any voice-engine module
  - errors/ has zero imports from any voice-engine module except logger/
  - config/ has zero imports from any voice-engine module
  - audio/ has zero imports from stt/, llm/, tts/, or pipeline/
  - stt/, llm/, tts/ have zero imports from each other
  - transport/ has zero imports from stt/, llm/, tts/, or pipeline/
  - pipeline/ is the only module that imports from all three provider service layers
```

---

## 9. Configuration Strategy

### 9.1 Configuration Hierarchy

Values are resolved in this precedence order (highest wins):

```
1. Environment variables          (VOICE_STT_PROVIDER=whisper)
2. .env file                      (loaded by dotenv in server/index.ts, unchanged)
3. MongoDB AdminSettings document  (runtime-mutable, per-user provider keys)
4. defaults.ts                    (compile-time fallbacks)
```

### 9.2 Configuration Schema

```
VoiceEngineConfig {
  // Node identity (for session affinity and logging)
  nodeId:         string           default: os.hostname()

  // STT
  stt: {
    provider:          string      default: "whisper"
    providerChain:     string[]    default: ["whisper"]
    timeoutMs:         number      default: 10_000
    noSpeechThreshold: number      default: 0.5
    minAudioBytes:     number      default: 4_800
    providerConfig:    Record<string, unknown>
  }

  // LLM
  llm: {
    provider:          string      default: "openai"
    providerChain:     string[]    default: ["openai"]
    timeoutMs:         number      default: 15_000
    maxTokens:         number      default: 80
    temperature:       number      default: 0.20
    providerConfig:    Record<string, unknown>
  }

  // TTS
  tts: {
    provider:              string  default: "openai"
    providerChain:         string[]default: ["openai"]
    firstChunkTimeoutMs:   number  default: 3_000
    voice:                 string  default: "shimmer"
    providerConfig:        Record<string, unknown>
  }

  // Audio pipeline
  audio: {
    exotelSampleRate:         number  default: 8_000
    sttSampleRate:            number  default: 16_000
    ttsSampleRate:            number  default: 24_000
    silenceTimeoutMs:         number  default: 800
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

  // Session
  session: {
    store:            "memory"|"redis"  default: "memory"
    ttlMs:            number            default: 3_600_000  (1 hr)
    redisUrl:         string | undefined
  }

  // Metrics
  metrics: {
    collector:        "inprocess"|"prometheus"  default: "inprocess"
    prometheusPort:   number                    default: 9090
  }

  // Logging
  logging: {
    adapter:   "console"|"pino"  default: "console"
    level:     "debug"|"info"|"warn"|"error"  default: "info"
    pretty:    boolean           default: false
  }
}
```

### 9.3 Runtime Config Reload

Audio pipeline thresholds (`vadThreshold`, `bargeInThreshold`, `cooldownBufferMinRms`, `postSpeechBufferMs`) are safe to reload without restarting the engine. The `AudioPipeline` reads these from the config object by reference. A `PUT /api/voice-engine/config` endpoint (admin-only, existing auth middleware) writes to the in-memory config object. Session-level values (timers already armed) reflect the new values on the next turn.

Provider identity (`stt.provider`, `llm.provider`, `tts.provider`) requires engine restart because the provider registry is built at startup.

---

## 10. Error Handling Strategy

### 10.1 Error Taxonomy

```
VoiceEngineError (base)
  ├── TransportError          — WS connection lost, malformed envelope
  ├── CodecError              — μ-law decode failure, invalid buffer size
  ├── STTError
  │     ├── STTTimeoutError
  │     ├── STTProviderError  — HTTP 4xx/5xx from provider
  │     └── STTSilenceError   — audio below minimum gate (not propagated; silent discard)
  ├── LLMError
  │     ├── LLMTimeoutError
  │     ├── LLMProviderError
  │     └── LLMEmptyResponseError
  ├── TTSError
  │     ├── TTSTimeoutError   — first chunk did not arrive within firstChunkTimeoutMs
  │     ├── TTSProviderError
  │     └── TTSStreamError    — mid-stream failure
  └── SessionError
        ├── SessionNotFoundError
        └── SessionStoreError — Redis unavailable
```

Each error carries: `code: ErrorCode`, `sessionId?: string`, `provider?: string`, `retryable: boolean`, `cause?: Error`.

### 10.2 Recovery Strategies by Layer

| Error | Strategy | User Impact |
|---|---|---|
| `TransportError` on open | Log + reject, no session created | None (call never started) |
| `TransportError` mid-call | Trigger session teardown | Call drops |
| `CodecError` | Discard frame, log warning, continue | None (one frame lost) |
| `STTTimeoutError` | Retry up to 2× on fallback chain; if all fail, skip turn (send filler "Sorry, can you say that again?") | Minor — agent asks for repeat |
| `STTProviderError` (4xx) | No retry (bad request); discard turn; log | Minor |
| `LLMTimeoutError` | Retry 1× on fallback chain; if all fail, send scripted fallback phrase | Minor — canned response |
| `LLMEmptyResponseError` | Retry 1× same provider; if still empty, send scripted fallback | Minor |
| `TTSTimeoutError` | Abort turn; send scripted audio fallback (pre-rendered WAV) | Minor |
| `TTSStreamError` | Abort; session enters next turn normally | Minor — agent cuts off |
| `SessionStoreError` | Degrade to in-process fallback if Redis; log alert | None in degraded mode |

### 10.3 Turn-Level Error Boundary

`TurnOrchestrator.beginTurn()` wraps its entire execution in a `try/catch`. On any unhandled error:
1. Emit `ErrorMetric` with full context
2. Call `resetTurn()` to release the processing lock
3. Do NOT close the WebSocket — the session continues and accepts the next turn
4. Log at `error` level with `sessionId`, `campaignId`, `userTurnCount`, and full stack

The session is only closed if a `TransportError` or unrecoverable `SessionError` occurs.

### 10.4 Circuit Breaker

Each provider service maintains a per-provider circuit breaker with three states: `CLOSED` (normal), `OPEN` (provider bypassed), `HALF_OPEN` (probe allowed). Parameters:

| Parameter | Default |
|---|---|
| Failure threshold to OPEN | 5 consecutive errors |
| Open duration | 30 s |
| Half-open probe count | 1 |

On `OPEN`, the service immediately tries the next provider in `providerChain`. If no fallback exists, it throws `ProviderUnavailableError`.

---

## 11. Logging Strategy

### 11.1 Principles

- All log lines are structured JSON in production (`PinoLogger`) and human-readable in development (`ConsoleLogger`).
- No `console.log` anywhere in the voice engine. Every module receives a `Logger` instance (child of the root logger) with default bindings for `module` and `sessionId`.
- Log levels: `debug` (every audio frame — off by default), `info` (turn boundaries, session lifecycle), `warn` (recoverable errors, fallback activations), `error` (unrecoverable errors, provider failures).
- No PII in logs. Phone numbers are hashed with a short HMAC before logging. Transcript content is logged only at `debug` level and only when `config.logging.transcriptLogging = true`.

### 11.2 Standard Log Events

| Event | Level | Key Fields |
|---|---|---|
| Session created | `info` | `streamSid`, `campaignId`, `nodeId` |
| Greeting sent | `info` | `streamSid`, `durationMs` |
| Turn started | `info` | `streamSid`, `userTurnCount`, `audioBytes` |
| STT result | `info` | `streamSid`, `turnId`, `provider`, `latencyMs`, `noSpeechProb`, `textLength` |
| LLM result | `info` | `streamSid`, `turnId`, `provider`, `latencyMs`, `tokensUsed`, `stage` |
| TTS stream complete | `info` | `streamSid`, `turnId`, `provider`, `latencyMs`, `playbackMs` |
| Barge-in detected | `info` | `streamSid`, `bargeInCount`, `rms` |
| Echo discarded | `warn` | `streamSid`, `overlapRatio` |
| Hallucination discarded | `warn` | `streamSid`, `avgNoSpeechProb`, `wordCount` |
| Provider fallback | `warn` | `streamSid`, `service`, `from`, `to`, `reason` |
| Provider error | `error` | `streamSid`, `service`, `provider`, `code`, `retryable` |
| Session closed | `info` | `streamSid`, `userTurnCount`, `durationMs`, `closeReason` |

### 11.3 Correlation

Every log line from a session includes `sessionId` (= `streamSid`). Every log line from a turn includes `turnId` (= `${streamSid}:${userTurnCount}`). This allows complete per-call trace reconstruction by filtering on `sessionId` in any log aggregator.

---

## 12. Metrics

### 12.1 Metric Categories

**Session metrics** — emitted on session open and close:

| Metric | Type | Description |
|---|---|---|
| `voice.sessions.active` | Gauge | Current active sessions on this node |
| `voice.sessions.total` | Counter | Cumulative sessions since startup |
| `voice.sessions.duration_ms` | Histogram | Call duration distribution |
| `voice.sessions.turns` | Histogram | Turns per call distribution |
| `voice.sessions.barge_ins` | Histogram | Barge-ins per call |

**Turn metrics** — emitted on each completed turn:

| Metric | Type | Description |
|---|---|---|
| `voice.turn.stt_latency_ms` | Histogram | Whisper/STT response time |
| `voice.turn.llm_latency_ms` | Histogram | LLM completion time |
| `voice.turn.tts_first_chunk_ms` | Histogram | Time to first TTS audio chunk |
| `voice.turn.tts_total_ms` | Histogram | Full TTS stream duration |
| `voice.turn.total_latency_ms` | Histogram | STT end → TTS first chunk |
| `voice.turn.echo_discards` | Counter | Turns discarded as echo |
| `voice.turn.hallucination_discards` | Counter | Turns discarded by nsp filter |

**Provider metrics** — emitted per provider call:

| Metric | Type | Description |
|---|---|---|
| `voice.provider.calls_total` | Counter | Labels: `service`, `provider`, `status` |
| `voice.provider.errors_total` | Counter | Labels: `service`, `provider`, `code` |
| `voice.provider.fallbacks_total` | Counter | Labels: `service`, `from`, `to` |
| `voice.provider.circuit_open` | Gauge | Labels: `service`, `provider` |

**Audio pipeline metrics:**

| Metric | Type | Description |
|---|---|---|
| `voice.audio.cooldown_buffer_flushes` | Counter | Cooldown buffer non-empty flushes |
| `voice.audio.min_gate_discards` | Counter | Chunks below 4800-byte gate |
| `voice.audio.vad_events` | Counter | Labels: `type` (silence\|force) |

### 12.2 Exposition

- **Development / single-node:** `InProcessCollector` — `GET /api/voice-engine/metrics` returns JSON snapshot.
- **Production:** `PrometheusCollector` exposes `/metrics` on a separate port (default 9090) in standard Prometheus text format. Labels include `node_id` and `env`.

---

## 13. Deployment Architecture

### 13.1 Current (Single-Node)

```
┌─────────────────────────────────────┐
│          VPS / Replit Node           │
│                                     │
│  ┌────────┐   ┌────────────────┐   │
│  │ Apache │   │   PM2 Cluster  │   │
│  │ Nginx  │──►│  nijvox (N=4)  │   │
│  │ Proxy  │   │  port 5000     │   │
│  └────────┘   └───────┬────────┘   │
│                        │            │
│              ┌─────────▼──────────┐ │
│              │      MongoDB       │ │
│              │  (same host)       │ │
│              └────────────────────┘ │
└─────────────────────────────────────┘
```

In this topology, PM2 cluster mode creates N workers sharing a single TCP port via `cluster` round-robin. Each worker is a Node.js process with its own in-memory `SessionStore`. Sessions are pinned to a worker for their lifetime because Exotel sends all frames for a call to the same WebSocket connection (the initial WS upgrade is sticky by definition of WebSocket).

**This topology requires no Redis.** `session.store = "memory"` is the correct default.

### 13.2 Multi-Node (Horizontal Scaling Target)

```
                        ┌──────────────┐
Exotel ──── HTTPS/WSS──►│  Load Balancer│
                        │  (sticky WS)  │
                        └──────┬───────┘
                 ┌─────────────┼──────────────┐
                 │             │              │
          ┌──────▼──┐   ┌──────▼──┐   ┌──────▼──┐
          │ Node A  │   │ Node B  │   │ Node C  │
          │ nijvox  │   │ nijvox  │   │ nijvox  │
          └──────┬──┘   └──────┬──┘   └──────┬──┘
                 └──────┬──────┘──────┬───────┘
                        │             │
                 ┌───────▼──┐  ┌──────▼─────┐
                 │  Redis   │  │  MongoDB   │
                 │ Sessions │  │  (replica) │
                 └──────────┘  └────────────┘
```

Transition requires only:
1. Set `session.store = "redis"` and `session.redisUrl` in config
2. Point load balancer to multiple nodes with WebSocket sticky sessions (based on `X-Forwarded-For` + `streamSid` cookie, or Exotel-guaranteed connection affinity)
3. No code changes

WebSocket sticky sessions are guaranteed because Exotel opens one WebSocket per call and sends all frames on that connection. The load balancer must forward the initial upgrade and all subsequent frames to the same backend node. This is standard WebSocket behaviour for all major load balancers (HAProxy, Nginx, AWS ALB with stickiness enabled).

### 13.3 Infrastructure Components

| Component | Role | Technology |
|---|---|---|
| Reverse proxy | TLS termination, WS upgrade forward | Apache/Nginx (existing) |
| Process manager | Worker supervision, zero-downtime reload | PM2 (existing) |
| Session store | Cross-node session sharing (multi-node only) | Redis 7+ |
| Database | Campaign, lead, call-log persistence | MongoDB (existing) |
| Metrics scrape | Prometheus pull | `/metrics` on port 9090 |
| Log shipping | Structured JSON to aggregator | Pino → stdout → filebeat/fluentbit |

---

## 14. Scalability Strategy

### 14.1 Vertical Scaling (Current)

The CPU-bound work in the voice engine is audio codec operations (μ-law encode/decode, resampling). These are synchronous but fast (microseconds per frame). The I/O-bound work is three external HTTP calls per turn (STT, LLM, TTS). Node.js's event loop handles concurrent I/O naturally. PM2 cluster mode with `N = CPU_COUNT` workers saturates the machine.

**Bottlenecks and mitigations:**

| Bottleneck | Mitigation |
|---|---|
| STT latency (dominant: ~800ms–2s) | Filler phrases mask latency; async parallel filler + LLM |
| LLM latency (~500ms–1.5s) | Filler already covers this; `maxTokens=80` keeps responses short |
| TTS first chunk latency (~300ms–800ms) | Streaming (yield first chunk immediately); `firstChunkTimeoutMs` guard |
| MongoDB per-turn reads (campaign cache) | `campaignCache` on session — reads only once per call |
| Concurrent calls per node | 4 PM2 workers × ~50 concurrent WS connections each = ~200 concurrent calls per node |

### 14.2 Horizontal Scaling

Beyond ~200 concurrent calls, add nodes. The only shared state is:
- MongoDB (already shared, existing replication strategy)
- Redis sessions (added when multi-node is enabled)

The voice engine itself is stateless at the node level when Redis is the session store. Nodes can be added and removed without draining (Exotel's WebSocket connection reconnects on the next call).

### 14.3 Campaign Cache Warming

On `connected` event, `TurnOrchestrator` calls `loadCampaignData()` and stores result in `session.campaignCache`. All subsequent turns read from memory. MongoDB is read exactly once per call for campaign data.

### 14.4 Provider Latency Budget

The target end-to-end latency from caller-stops-speaking to agent-first-audio is under 2 seconds (P95):

| Stage | Target | Current Baseline |
|---|---|---|
| VAD silence timer | 800 ms | 800 ms (fixed) |
| STT (Whisper) | 600 ms | ~800–1500 ms |
| LLM (GPT-4o) | 500 ms | ~500–1200 ms |
| TTS first chunk | 300 ms | ~300–700 ms |
| **Total (sequential)** | **2200 ms** | **~2400–4200 ms** |
| **With filler masking** | **800 ms perceived** | Filler audible at 800ms |

Filler injection (existing pattern) is the primary latency-masking technique. It fires immediately after VAD triggers, while STT + LLM run in parallel. The human perception of "response time" becomes the VAD silence timer (800ms) plus filler generation time (~200ms) = ~1 second perceived, regardless of actual STT+LLM latency.

---

## 15. Future Extensibility

### 15.1 Adding a New STT/LLM/TTS Provider

1. Create `server/voice-engine/stt/providers/NewProvider.ts` implementing `STTProvider`
2. Register in `server/voice-engine/index.ts`: `registry.registerSTT("new", cfg => new NewSTTProvider(cfg))`
3. Set `config.stt.provider = "new"` in environment
4. No other changes required

### 15.2 Adding a New Telephony Transport

The voice engine currently has one transport implementation (`ExotelTransport`). A second carrier (e.g., Twilio, Vonage, Plivo) requires:
1. Create `server/voice-engine/transport/TwilioTransport.ts` implementing the same `Transport` interface
2. Add a factory in `index.ts` that selects based on `config.transport.provider`
3. The protocol differences (μ-law vs. PCMU vs. Opus; frame size; envelope format) are encapsulated entirely in the transport and codec layers

### 15.3 Adding Conversation Memory / RAG

`LLMService.buildMessages()` receives the full `VoiceSession`. Injecting a RAG retrieval step requires only modifying `PromptBuilder.buildSystem()` to accept a `retrievedChunks: string[]` argument. The retrieval call itself belongs in `LLMService` before calling the provider. No interface changes required.

### 15.4 Adding Real-Time Transcription Output

A `TranscriptBroadcaster` (observer pattern) can be attached to `STTService`. After each turn, it emits the transcript over a separate WebSocket channel (e.g., `/transcript-stream?callSid=...`) for real-time dashboards. This requires no change to any existing module.

### 15.5 Adding Post-Call Analysis

`TurnOrchestrator` emits a `TurnCompletedEvent` that currently goes only to `MetricsCollector`. Adding a `PostCallAnalysisService` subscriber requires only registering it as an additional observer on that event bus. It can batch turn transcripts and call an LLM analysis endpoint asynchronously after session close.

### 15.6 Supporting Multi-Language Calls

`STTOptions.languageHint` is already in the interface. `TTSOptions.voice` supports per-language voices. `PromptBuilder` receives the `CampaignData` which can carry a `language` field. Multi-language support requires only:
- A `language` field on `Campaign` schema (existing DB, schema migration only)
- `PromptBuilder` reads it and adjusts system prompt language
- `TTSService` passes the appropriate voice name per language

### 15.7 Replacing Exotel Entirely

Because `ExotelTransport` is the only module that knows Exotel's protocol, replacing Exotel requires only replacing that module. The `AudioPipeline`, `STTService`, `LLMService`, `TTSService`, and `TurnOrchestrator` have zero Exotel-specific code and require no changes.

### 15.8 Plugin System (Long-Term)

The `ProviderRegistry` pattern is the embryo of a plugin system. A future version could load provider implementations from npm packages at startup:

```
config.plugins: ["@nijvox/deepgram-stt", "@nijvox/elevenlabs-tts"]
```

Each package exports a `register(registry: ProviderRegistry): void` function. No engine changes required. This enables third-party provider marketplace extensibility without engine rebuilds.

---

## Appendix A — Key Constants Reference

| Constant | Value | Location | Rationale |
|---|---|---|---|
| `VAD_THRESHOLD` | 200 RMS | `audio/` config | Noise floor at 8kHz telephony |
| `BARGE_IN_THRESHOLD` | 700 RMS | `audio/` config | Above echo (300-500), below clipping |
| `BARGE_IN_MIN_CHUNKS` | 3 | `audio/` config | ~300ms sustained; prevents echo barge-in |
| `COOLDOWN_BUFFER_MIN_RMS` | 600 RMS | `audio/` config | Above echo, below barge-in; tuned from call recordings |
| `MIN_AUDIO_BYTES` | 4800 | `stt/` config | 300ms at 8kHz PCM16; below = noise burst |
| `NO_SPEECH_THRESHOLD` | 0.5 | `stt/` config | Whisper coin-flip boundary; above = hallucination |
| `POST_SPEECH_BUFFER_MS` | 900 | `audio/` config | Phone playout lag after WS stream ends |
| `POST_BARGE_IN_COOLDOWN_MS` | 250 | `audio/` config | Exotel clears buffer on Clear command |
| `SILENCE_TIMEOUT_MS` | 800 | `audio/` config | Natural pause length |
| `FORCE_PROCESS_MS` | 5000 | `audio/` config | Maximum utterance before forced STT |
| `FILLER_PROBABILITY` | 0.85 | `pipeline/` config | Skip filler 15% of time for naturalness |
| `MAX_TOKENS` | 80 | `llm/` config | Keeps responses short for voice |
| `TEMPERATURE` | 0.20 | `llm/` config | Low variance; predictable sales arc |

All constants are configurable via `VoiceEngineConfig`. None are hardcoded in logic.

---

## Appendix B — What Is Explicitly Out of Scope

The following platform modules are referenced (read-only) but never modified:

| Module | How V2 Reads It |
|---|---|
| `server/callMap.ts` | Read `phoneCallMap` on `connected` to resolve `campaignId` |
| `server/storage.ts` | Call `getCampaign()` once per session; call `upsertCallLog()` on close |
| `server/wsServer.ts` | Replace `handleExotelStream(ws, campaignId)` call with `engine.handleExotelUpgrade(req, socket, head)` — one line |
| `shared/schema.ts` | Types used: `Campaign`, `Lead`, `CallLog` — imported as read-only types |
| `server/db.ts` | Not imported; storage layer handles DB |

Authentication, campaign CRUD, CRM, lead management, appointment booking, billing, and the React frontend are entirely unaffected.
