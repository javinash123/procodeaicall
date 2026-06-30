/**
 * Exotel Bidirectional Voicebot Stream Handler
 *
 * Exotel sends: Connected → Start → Media (inbound audio) → Stop
 * We respond with:  Media events (μ-law 8000 Hz audio chunks) + Clear to cancel current playback
 *
 * Audio pipeline (inbound):  μ-law 8k  →  PCM16 8k  →  upsample to 16k  →  WAV → Whisper STT
 * Audio pipeline (outbound): OpenAI TTS (PCM 24k)  →  downsample to 8k  →  μ-law  →  base64 chunks
 */

import OpenAI from "openai";
import { WebSocket } from "ws";
import { log } from "./index";
import { generateAIResponse, generateGreeting, type ConversationMessage, type CampaignData } from "./openaiService";
import { storage } from "./storage";
import { phoneCallMap, callSidMap, normalizePhone } from "./callMap";

let _openai: OpenAI | null = null;
const openai = new Proxy({} as OpenAI, {
  get(_t, prop) {
    if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return (_openai as any)[prop];
  },
});

// --- PATCH START: Exotel stream handling safety patch ---

type ExotelMediaFormat = {
  encoding?: string;
  sampleRate?: number | string;
  sample_rate?: number | string;
  channels?: number | string;
};

type ExotelSessionState = {
  campaignId?: string;
  mediaFormat: {
    encoding: string;
    sampleRate: number;
    channels: number;
  };
  transcriptBuffer: string[];
  audioChunks: Buffer[];
  lastMediaAt: number;
  isProcessing: boolean;
};

function safeJsonParse(input: string): any | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function getEventName(payload: any): string {
  return (
    payload?.event ??
    payload?.type ??
    payload?.message_type ??
    payload?.action ??
    ""
  )
    .toString()
    .trim();
}

function normalizeMediaFormat(raw: any): {
  encoding: string;
  sampleRate: number;
  channels: number;
} {
  const mediaFormat: ExotelMediaFormat =
    raw?.mediaFormat ??
    raw?.media_format ??
    raw?.start?.mediaFormat ??
    raw?.start?.media_format ??
    {};

  const encoding = String(mediaFormat.encoding ?? "pcm");
  const sampleRate = Number(
    mediaFormat.sampleRate ?? mediaFormat.sample_rate ?? 8000
  );
  const channels = Number(mediaFormat.channels ?? 1);

  return { encoding, sampleRate, channels };
}

function getMediaPayload(payload: any): string | null {
  return (
    payload?.media?.payload ??
    payload?.media?.data ??
    payload?.payload ??
    payload?.data ??
    null
  );
}

// ─── G.711 μ-law Codec (pure JS — no external dependencies) ──────────────────

const MULAW_BIAS = 33;
const MULAW_CLIP = 32635;

/** Encode one 16-bit PCM sample to a μ-law byte */
export function encodeMulaw(sample: number): number {
  let sign = 0;
  if (sample < 0) { sign = 0x80; sample = -sample; }
  if (sample > MULAW_CLIP) sample = MULAW_CLIP;
  sample += MULAW_BIAS;
  let exp = 7;
  for (let mask = 0x4000; !(sample & mask) && exp > 0; mask >>= 1) exp--;
  const mantissa = (sample >> (exp + 3)) & 0x0f;
  return (~(sign | (exp << 4) | mantissa)) & 0xff;
}

/** Decode one μ-law byte to a 16-bit PCM sample */
export function decodeMulaw(mulaw: number): number {
  mulaw = ~mulaw;
  const sign     = mulaw & 0x80;
  const exponent = (mulaw >> 4) & 0x07;
  const mantissa = mulaw & 0x0f;
  let sample = ((mantissa << 3) + 132) << exponent;
  sample -= 132;
  return sign ? -sample : sample;
}

/** Buffer of μ-law bytes → Int16Array of PCM samples */
export function mulawToInt16(buf: Buffer): Int16Array {
  const out = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = decodeMulaw(buf[i]);
  return out;
}

/** Int16Array of PCM samples → Buffer of μ-law bytes */
export function int16ToMulaw(pcm: Int16Array): Buffer {
  const out = Buffer.allocUnsafe(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = encodeMulaw(pcm[i]);
  return out;
}

// ─── PCM Resampler (linear interpolation) ────────────────────────────────────

/**
 * Resample PCM16 samples from srcRate to dstRate.
 * Uses linear interpolation — works cleanly for integer ratio pairs (24000→8000, 8000→16000).
 *
 * TODO: Replace with a higher-quality resampler (e.g. libsamplerate via WASM)
 *       if audio artefacts are noticeable in production calls.
 */
export function resamplePCM16(
  samples: Int16Array,
  srcRate: number,
  dstRate: number
): Int16Array {
  if (srcRate === dstRate) return samples;
  const ratio     = srcRate / dstRate;
  const outLength = Math.floor(samples.length / ratio);
  const out       = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos  = i * ratio;
    const lo   = Math.floor(pos);
    const hi   = Math.min(lo + 1, samples.length - 1);
    const frac = pos - lo;
    out[i]     = Math.round(samples[lo] * (1 - frac) + samples[hi] * frac);
  }
  return out;
}

// ─── WAV Builder ──────────────────────────────────────────────────────────────

/** Wrap raw PCM16 samples in a minimal WAV container (required by Whisper) */
export function buildWav(pcm: Int16Array, sampleRate: number, channels = 1): Buffer {
  const dataBytes = pcm.length * 2;
  const buf       = Buffer.allocUnsafe(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);                          // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * 2, 28);  // ByteRate
  buf.writeUInt16LE(channels * 2, 32);               // BlockAlign
  buf.writeUInt16LE(16, 34);                         // BitsPerSample
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < pcm.length; i++) buf.writeInt16LE(pcm[i], 44 + i * 2);
  return buf;
}

// ─── STT: Transcription ───────────────────────────────────────────────────────

/**
 * Transcribe accumulated μ-law audio (8 kHz mono) to text using OpenAI Whisper.
 *
 * TODO: Swap this function with a different STT provider (e.g. Deepgram, Google STT)
 *       by replacing the implementation while keeping the same signature:
 *         transcribeAudio(mulawChunks: Buffer[]): Promise<string>
 */
export async function transcribeAudio(mulawChunks: Buffer[]): Promise<string> {
  if (mulawChunks.length === 0) return "";

  const raw = Buffer.concat(mulawChunks);

  // Minimum 300 ms of 8 kHz slin16 audio = 4800 bytes.
  // Shorter bursts are almost always click/pop noise — Whisper will hallucinate
  // plausible words on them rather than return empty string.
  if (raw.length < 4800) return "";

  // PCM16 LE 8 kHz (Exotel sends raw slin16) → PCM16 16 kHz (Whisper prefers ≥16 kHz)
  const pcm8k  = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
  const pcm16k = resamplePCM16(pcm8k, 8000, 16000);
  const wav    = buildWav(pcm16k, 16000);

  // Whisper needs a File-like object
  const { toFile } = await import("openai");
  const wavFile = await toFile(wav, "audio.wav", { type: "audio/wav" });

  // Use verbose_json so we get per-segment no_speech_prob.
  // The prompt anchors Whisper to real-estate vocabulary which reduces the chance
  // of hallucinating unrelated words ("vaccine", "Wi-Fi") on phone echo/noise.
  const result: any = await openai.audio.transcriptions.create({
    model:           "whisper-1",
    file:            wavFile,
    language:        "en",
    response_format: "verbose_json" as any,
    prompt:          "Real estate property sales call about apartments.",
  });

  // Drop the transcript if Whisper itself signals low confidence that speech occurred.
  // no_speech_prob >= 0.5 means Whisper is at best guessing — empirically this
  // catches phone-echo and silence hallucinations (nsp observed: 0.506) while
  // keeping real caller speech (nsp observed: 0.182–0.491).
  const segments: any[] = result.segments ?? [];
  if (segments.length > 0) {
    const avgNsp = segments.reduce((s: number, seg: any) => s + (seg.no_speech_prob ?? 0), 0) / segments.length;
    if (avgNsp >= 0.5) {
      return ""; // Whisper uncertainty → treat as silence
    }
  } else {
    // No segment metadata returned — Whisper may have detected nothing meaningful.
    // Apply a length heuristic: more than 6 words from a very short clip is
    // statistically a hallucination (Whisper invents plausible filler on noise).
    const text = (result.text ?? "").trim();
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const durationSec = raw.length / (8000 * 2); // bytes ÷ (sampleRate × bytesPerSample)
    if (durationSec < 1.5 && wordCount > 6) return "";
  }

  return (result.text ?? "").trim();
}

// ─── TTS: Exotel-compatible audio encoding ────────────────────────────────────

/**
 * 20 ms of audio at 8 kHz = 160 μ-law bytes per chunk.
 * Exotel's Media payload should carry one chunk at a time for smooth streaming.
 * 320 bytes (40 ms) is also acceptable and reduces WebSocket message overhead.
 *
 * TODO: If TTS audio quality is unacceptable at 8 kHz, replace `openaiTTS` below
 *       with a provider that outputs PCMU/8000 natively, e.g.:
 *         - Google Cloud TTS telephony preset  (LINEAR16 or MULAW @ 8000 Hz)
 *         - ElevenLabs streaming with ULAW_8000 output format
 *         - Deepgram Aura (outputs μ-law on request)
 */
const EXOTEL_SAMPLE_RATE = 8000;
const EXOTEL_CHUNK_BYTES = 3200; // 100 ms of PCM16 LE @ 8 kHz = 3200 bytes (Exotel requires multiples of 320)

/**
 * Convert AI reply text → array of base64-encoded PCM16 LE chunks ready for Exotel Media events.
 * Pipeline: OpenAI TTS (raw PCM 24 kHz) → downsample to 8 kHz PCM16 LE → split into 3200-byte chunks
 * Exotel expects Linear PCM16 LE @ 8 kHz, base64-encoded, in multiples of 320 bytes.
 */
export async function encodeReplyForExotel(text: string): Promise<string[]> {
  // Request raw PCM from OpenAI TTS (24 kHz, 16-bit LE mono, no container)
  // "shimmer" — warm, articulate, professional (ideal for outbound sales/support calls)
  // Alternatives: "alloy" (neutral/professional), "echo" (confident male)
  const response = await openai.audio.speech.create({
    model:           "tts-1",
    voice:           "shimmer",
    input:           text,
    response_format: "pcm",
  });

  const raw    = Buffer.from(await response.arrayBuffer());
  const pcm24k = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
  const pcm8k  = resamplePCM16(pcm24k, 24000, EXOTEL_SAMPLE_RATE);

  // Convert Int16Array → raw PCM16 LE Buffer (no μ-law encoding — Exotel expects PCM16)
  const pcm8kBuf = Buffer.from(pcm8k.buffer, pcm8k.byteOffset, pcm8k.byteLength);

  // Split into 3200-byte chunks (100 ms @ 8 kHz PCM16) and base64-encode each
  const chunks: string[] = [];
  for (let off = 0; off < pcm8kBuf.length; off += EXOTEL_CHUNK_BYTES) {
    chunks.push(pcm8kBuf.slice(off, off + EXOTEL_CHUNK_BYTES).toString("base64"));
  }
  return chunks;
}

/**
 * Stream TTS audio to Exotel in real time as OpenAI generates it.
 *
 * Instead of waiting for the full audio file before playing (3–5 s delay),
 * this function pipes raw PCM bytes from the TTS response stream directly to
 * Exotel as they arrive.  The caller hears the first syllable within ~0.3–0.8 s
 * of the TTS request being sent.
 *
 * Pipeline per streamed chunk:
 *   Incoming bytes (PCM16 24 kHz) → accumulate to alignment boundary
 *   → resample to 8 kHz → split into 3200-byte chunks → send as Exotel Media events
 *
 * Barge-in is respected on every chunk: if session.isSpeaking is set to false
 * by the media handler while we're streaming, we abort immediately.
 */
export async function streamTTSToExotel(
  text: string,
  ws: WebSocket,
  session: ExotelSession
): Promise<void> {
  // Number of 24 kHz PCM16 bytes we accumulate before downsampling.
  // 9600 bytes @ 24 kHz = ~200 ms, which downsamples to 3200 bytes @ 8 kHz.
  const INPUT_BATCH = EXOTEL_CHUNK_BYTES * 3; // 9600

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const resp = await fetch("https://api.openai.com/v1/audio/speech", {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:           "tts-1",
      voice:           "shimmer",
      input:           text,
      response_format: "pcm", // raw PCM16 LE 24 kHz — no container
    }),
  });

  if (!resp.ok || !resp.body) {
    throw new Error(`TTS streaming failed: HTTP ${resp.status}`);
  }

  const reader  = (resp.body as any).getReader() as ReadableStreamDefaultReader<Uint8Array>;
  let remainder = Buffer.alloc(0);
  // Track total 8 kHz PCM bytes sent so we can set an accurate post-speech cooldown
  let total8kBytes = 0;

  const sendBuf = (buf: Buffer) => {
    // Ensure 2-byte alignment for PCM16 LE samples
    const aligned = buf.length & ~1;
    if (aligned < 2) return;
    const pcm24k   = new Int16Array(buf.buffer, buf.byteOffset, aligned / 2);
    const pcm8k    = resamplePCM16(pcm24k, 24000, EXOTEL_SAMPLE_RATE);
    const pcm8kBuf = Buffer.from(pcm8k.buffer, pcm8k.byteOffset, pcm8k.byteLength);
    for (let off = 0; off < pcm8kBuf.length; off += EXOTEL_CHUNK_BYTES) {
      if (!session.isSpeaking || ws.readyState !== WebSocket.OPEN) return;
      sendExotelMedia(ws, session.streamSid, pcm8kBuf.slice(off, off + EXOTEL_CHUNK_BYTES).toString("base64"));
      total8kBytes += Math.min(EXOTEL_CHUNK_BYTES, pcm8kBuf.length - off);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!session.isSpeaking || ws.readyState !== WebSocket.OPEN) break;

      remainder = Buffer.concat([remainder, Buffer.from(value)]);

      // Flush in INPUT_BATCH-sized windows so Exotel gets steady small chunks
      while (remainder.length >= INPUT_BATCH) {
        if (!session.isSpeaking || ws.readyState !== WebSocket.OPEN) break;
        sendBuf(remainder.slice(0, INPUT_BATCH));
        remainder = remainder.slice(INPUT_BATCH);
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  // Flush any remaining bytes after stream ends
  if (session.isSpeaking && remainder.length >= 2 && ws.readyState === WebSocket.OPEN) {
    sendBuf(remainder);
  }

  // ── Post-speech cooldown ─────────────────────────────────────────────────────
  // We've finished SENDING audio chunks, but Exotel is still PLAYING them.
  // Set a cooldown equal to the estimated playback duration + 900 ms buffer so
  // our own TTS audio doesn't echo back as inbound and cause a response spiral.
  //
  // Exception: if barge-in interrupted us, we already sent a Clear event which
  // empties Exotel's buffer instantly.  The caller is actively speaking, so we
  // must become responsive immediately — use a minimal 250 ms cooldown instead.
  const playbackMs = pcm8kPlaybackMs(total8kBytes);
  session.ttsPlaybackMs = playbackMs;
  if (session.isSpeaking) {
    // Normal completion — audio is still queued in Exotel's playout buffer
    session.postSpeechCooldownUntil = Date.now() + playbackMs + 900;
    log(`[exotel:${session.streamSid}] ▶ TTS done — playback ~${playbackMs} ms, cooldown +${playbackMs + 900} ms`, "ws");
  } else {
    // Interrupted by barge-in — Clear already flushed Exotel's buffer
    session.postSpeechCooldownUntil = Date.now() + 250;
    log(`[exotel:${session.streamSid}] ▶ TTS interrupted (barge-in) — minimal 250 ms cooldown`, "ws");
  }
}

// ─── Exotel WebSocket Send Helpers ───────────────────────────────────────────

/** Send one μ-law audio chunk back to Exotel as a Media event */
export function sendExotelMedia(
  ws: WebSocket,
  streamSid: string,
  payload: string
): void {
  if (ws.readyState !== WebSocket.OPEN) return;

  const message = {
    event: "media",
    stream_sid: streamSid,
    media: {
      payload,
    },
  };

  console.log("[EXOTEL OUTGOING]", JSON.stringify(message));

  ws.send(JSON.stringify(message));
}

/** Tell Exotel to immediately stop playing any buffered audio */
export function sendExotelClear(ws: WebSocket, streamSid: string): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ event: "clear", stream_sid: streamSid }));
}

// ─── Campaign Loader ──────────────────────────────────────────────────────────

/** Load campaign from DB by ID, fall back to first available if not found */
export async function loadCampaignData(campaignId?: string): Promise<CampaignData> {
  let campaign: any = campaignId ? await storage.getCampaign(campaignId) : null;
  if (!campaign)    campaign = await storage.getAnyCampaign();
  if (!campaign)    return { goal: "sales" };

  return {
    name:                campaign.name,
    goal:                campaign.goal,
    additionalContext:   campaign.additionalContext   || "",
    ai_generated_script: campaign.ai_generated_script || campaign.script || "",
    knowledge_base: [
      ...(campaign.knowledgeBaseTexts || []),
      ...(campaign.knowledgeBaseFiles || []).map((f: any) => f.extractedText).filter(Boolean),
    ].join("\n\n"),
  };
}

// ─── Per-connection Session ───────────────────────────────────────────────────

interface ExotelSession {
  streamSid:           string;
  campaignId?:         string;
  campaignCache?:      CampaignData;  // cached once per session to avoid repeated DB reads
  mediaChunks:         Buffer[];
  conversationHistory: ConversationMessage[];
  silenceTimer:        ReturnType<typeof setTimeout> | null;
  forceTimer:          ReturnType<typeof setTimeout> | null;
  firstChunkAt:        number | null;
  processing:          boolean;
  isSpeaking:          boolean;   // true while AI TTS is being sent — suppress echo
  bargeInCount:        number;    // consecutive high-energy chunks during AI speech
  voicedChunks:        number;    // voiced chunks seen in current utterance
  // Pre-generated pitch: computed during greeting so the first "Yes" response is instant
  preparedPitchChunks?: string[];  // TTS-encoded chunks ready to stream
  preparedPitchText?:   string;    // text version (added to conversation history)
  pitchReady:           boolean;   // true once preparedPitchChunks is populated
  // Post-speech echo suppression: ignore inbound audio until this epoch ms
  // Prevents our own TTS audio (buffered in Exotel) from being echoed back and
  // re-processed as caller speech — which causes a "You're welcome" spiral.
  postSpeechCooldownUntil: number;
  ttsPlaybackMs:           number;  // estimated playback duration of last TTS response
  // Audio buffered during the post-speech cooldown window (high-energy only).
  // If the caller speaks right as TTS finishes (e.g. a quick "Yes"), their audio
  // arrives during the cooldown and would normally be discarded. We save it here
  // and prepend it to mediaChunks once the cooldown expires so it isn't lost.
  cooldownBuffer:          Buffer[];
  // Set to true once sendGreeting has finished — blocks processAudio and audio
  // collection until the opening greeting has played. Prevents a race between
  // the 800 ms greeting timer and the 800 ms silence-timer (both fire together
  // at call start) from causing processAudio to run before the AI has greeted.
  greetingDone:            boolean;
}

// ── VAD & timing constants ────────────────────────────────────────────────────

// How long silence after voiced speech before triggering STT (ms).
// 800 ms is tight enough to feel responsive while still allowing natural pauses.
const SILENCE_TIMEOUT_MS = 800;

// Absolute fallback: process whatever was collected this many ms after first chunk.
// 5 s covers the longest natural sentence without making the call feel laggy.
const FORCE_PROCESS_MS = 5000;

// RMS energy below this → silence / background noise (flat PCM).
const VAD_THRESHOLD = 200;

// Minimum consecutive voiced chunks before the silence timer starts.
// Prevents a single noise pop from triggering a processing cycle.
const MIN_VOICED_BEFORE_TIMER = 2;

// ── Barge-in constants ────────────────────────────────────────────────────────

// RMS threshold to consider caller is speaking while AI is talking.
// Higher than VAD_THRESHOLD to avoid false positives from echo/noise.
const BARGE_IN_THRESHOLD = 700;

// How many consecutive high-energy chunks must arrive before we accept a barge-in.
// 3 chunks × ~100 ms/chunk ≈ 300 ms of sustained speech.
// Kept at 3 (not 2) because the AI's own TTS echo can produce 2 consecutive
// high-energy chunks at 8kHz — reverting to 2 made the echo trigger barge-in,
// which cut off the AI's speech, collected echo as audio, and fed it to Whisper,
// creating a 30-iteration "Yes. Yes. Yes." loop (call 3 recording).
// The no_speech_prob filter in transcribeAudio is the primary echo defence.
const BARGE_IN_MIN_CHUNKS = 3;

// ── Filler acknowledgments ────────────────────────────────────────────────────
//
// Fillers bridge the STT→GPT→TTS latency gap so callers don't hear dead air.
// They are played only ~40% of turns (randomised) to prevent them sounding
// repetitive and robotic — a real agent doesn't say "Got it." before every reply.
//
// Two pools: questions vs. statements, chosen by whether user text ends with "?".
// All phrases are short (≤4 words) so they play in under a second and don't
// clash with the actual response that follows immediately after.
const FILLER_QUESTION  = [
  "One moment.",
  "Let me check that.",
  "Good question.",
];
const FILLER_STATEMENT = [
  "Understood.",
  "Of course.",
  "Sure thing.",
  "Got it.",
];

// Play a filler on most turns so callers always hear something while GPT + TTS warm up.
// 0.85 = 85% of turns get an immediate acknowledgement; the remaining 15% feel more
// direct for very short affirmatives where any filler would sound odd.
const FILLER_PROBABILITY = 0.85;

/** Calculate RMS energy of a PCM16 LE buffer — used for voice activity detection */
function rmsLevel(buf: Buffer): number {
  if (buf.length < 2) return 0;
  let sumSq = 0;
  for (let i = 0; i + 1 < buf.length; i += 2) {
    const sample = buf.readInt16LE(i);
    sumSq += sample * sample;
  }
  return Math.sqrt(sumSq / (buf.length / 2));
}

/** Reset all per-turn state after AI finishes speaking.
 *  Does NOT touch postSpeechCooldownUntil — that is set by the TTS sender. */
function resetTurn(session: ExotelSession): void {
  session.isSpeaking   = false;
  session.bargeInCount = 0;
  session.voicedChunks = 0;
  session.mediaChunks  = [];
  session.firstChunkAt = null;
  if (session.silenceTimer) { clearTimeout(session.silenceTimer); session.silenceTimer = null; }
  if (session.forceTimer)   { clearTimeout(session.forceTimer);   session.forceTimer   = null; }
}

/**
 * Echo guard: returns true if the STT transcript looks like a reflection of
 * something the AI already said.  This happens when Exotel loops our outbound
 * TTS audio back as inbound before the post-speech cooldown clears it.
 *
 * Algorithm: significant word-overlap (>45 %) between the transcript and any
 * of the last 3 AI messages → almost certainly our own voice coming back.
 */
function isLikelyEcho(transcript: string, history: ConversationMessage[]): boolean {
  const recentAI = history.filter(m => m.role === "assistant").slice(-3);
  if (recentAI.length === 0) return false;

  const normalize = (t: string) =>
    new Set(t.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 2));

  const tWords = normalize(transcript);
  if (tWords.size < 2) return false;

  for (const msg of recentAI) {
    const mWords = normalize(msg.content);
    const overlap = [...tWords].filter(w => mWords.has(w)).length;
    const ratio   = overlap / tWords.size;
    if (ratio > 0.45) return true;
  }
  return false;
}

/** Estimate playback duration (ms) for a PCM-16 LE audio buffer at 8 kHz */
function pcm8kPlaybackMs(pcmBytes: number): number {
  return Math.ceil((pcmBytes / 2 / EXOTEL_SAMPLE_RATE) * 1000);
}

async function processAudio(ws: WebSocket, session: ExotelSession): Promise<void> {
  // Never run before the greeting has finished — conversationHistory would be
  // empty and the AI would generate a random/goodbye response with no context.
  if (!session.greetingDone) return;
  if (session.processing || session.mediaChunks.length === 0) return;
  session.processing = true;

  const chunks     = session.mediaChunks.splice(0);
  const totalBytes = chunks.reduce((s, b) => s + b.length, 0);
  log(`[exotel:${session.streamSid}] ▶ processAudio — ${chunks.length} chunks, ${totalBytes} B`, "ws");

  try {
    // ── Step 1: Transcribe caller audio (Whisper) ─────────────────────────────
    const userText = await transcribeAudio(chunks);
    log(`[exotel:${session.streamSid}] ▶ STT: "${userText}"`, "ws");
    if (!userText) {
      log(`[exotel:${session.streamSid}] ▶ Empty STT — skipping`, "ws");
      return;
    }

    // ── Echo guard ────────────────────────────────────────────────────────────
    // If the transcript has >45 % word overlap with a recent AI message, it is
    // almost certainly our own TTS echoing back (Exotel phone loopback).
    // Drop it silently rather than feeding it back to GPT.
    if (isLikelyEcho(userText, session.conversationHistory)) {
      log(`[exotel:${session.streamSid}] ▶ Echo detected ("${userText}") — discarded`, "ws");
      return;
    }

    // ── Step 2: Parallel — optional filler TTS + GPT response ───────────────
    // Fire GPT immediately.  Only generate + play a filler phrase on ~40% of
    // turns — and NEVER for very short inputs (Yes/No/OK/Sure) where the
    // caller expects an immediate response and a filler just adds dead air.
    const campaignData = await loadCampaignData(session.campaignId);
    session.conversationHistory.push({ role: "user", content: userText });

    const isShortInput = userText.trim().split(/\s+/).length <= 3; // "Yes", "Sure", "Go ahead", etc.
    const useFiller = !isShortInput && Math.random() < FILLER_PROBABILITY;
    const fillerPool = userText.trim().endsWith("?") ? FILLER_QUESTION : FILLER_STATEMENT;
    const filler = fillerPool[Math.floor(Math.random() * fillerPool.length)];

    // Always start the AI response immediately — run filler in parallel if needed
    const aiResponsePromise = generateAIResponse(
      session.conversationHistory,
      userText,
      campaignData
    );
    const fillerTtsPromise = useFiller ? encodeReplyForExotel(filler) : null;

    // ── Step 3: Play filler (if chosen) while waiting for GPT ────────────────
    if (fillerTtsPromise) {
      const fillerChunks = await fillerTtsPromise;
      session.isSpeaking = true;
      sendExotelClear(ws, session.streamSid);
      for (const chunk of fillerChunks) {
        if (ws.readyState !== WebSocket.OPEN) break;
        sendExotelMedia(ws, session.streamSid, chunk);
      }
      // Brief cooldown so filler audio doesn't echo back during GPT wait time
      const fillerPlayMs = pcm8kPlaybackMs(fillerChunks.length * EXOTEL_CHUNK_BYTES);
      session.postSpeechCooldownUntil = Date.now() + fillerPlayMs + 400;
      log(`[exotel:${session.streamSid}] ▶ Filler sent: "${filler}"`, "ws");
    }

    // ── Step 4: Await GPT result (usually ready by now) ───────────────────────
    const { reply } = await aiResponsePromise;
    session.conversationHistory.push({ role: "assistant", content: reply });
    log(`[exotel:${session.streamSid}] ▶ AI: "${reply}"`, "ws");

    // ── Step 5: Stream TTS response directly to Exotel ────────────────────────
    // isSpeaking = true BEFORE the TTS request so barge-in detection works
    // during the streaming and the guard inside streamTTSToExotel fires correctly.
    session.isSpeaking = true;
    if (!fillerTtsPromise) {
      // Only send Clear if filler didn't already clear; avoids double-clear glitch.
      sendExotelClear(ws, session.streamSid);
    }

    log(`[exotel:${session.streamSid}] ▶ Streaming TTS: "${reply}"`, "ws");
    // streamTTSToExotel sets session.postSpeechCooldownUntil before returning
    await streamTTSToExotel(reply, ws, session);
    log(`[exotel:${session.streamSid}] ▶ Response streamed`, "ws");

  } catch (err: any) {
    log(`[exotel:${session.streamSid}] ✖ processAudio error: ${err.message}`, "ws");
  } finally {
    resetTurn(session);
    session.processing = false;
  }
}

// ─── Greeting ─────────────────────────────────────────────────────────────────

/**
 * Speak the opening greeting immediately when the call connects.
 * Fired once from the "start" event handler (fire-and-forget via setTimeout).
 */
async function sendGreeting(ws: WebSocket, session: ExotelSession): Promise<void> {
  if (session.isSpeaking || session.processing) {
    // Already mid-turn — can't send greeting. Open the gate anyway so inbound
    // audio can flow; the call would be unusable otherwise.
    session.greetingDone = true;
    return;
  }
  try {
    const campaignData = await loadCampaignData(session.campaignId);
    const greeting     = await generateGreeting(campaignData);

    log(`[exotel:${session.streamSid}] ▶ Greeting: "${greeting}"`, "ws");

    session.isSpeaking = true;
    const chunks = await encodeReplyForExotel(greeting);
    for (const chunk of chunks) {
      if (ws.readyState !== WebSocket.OPEN) break;
      sendExotelMedia(ws, session.streamSid, chunk);
    }
    // Add greeting to history so AI knows not to repeat it
    session.conversationHistory.push({ role: "assistant", content: greeting });

    // Set post-speech cooldown so the greeting audio playing on the phone
    // doesn't echo back and get mistaken for the caller's first response.
    // Each chunk = EXOTEL_CHUNK_BYTES bytes of PCM16 @ 8kHz = 200 ms
    const greetingPlaybackMs = pcm8kPlaybackMs(chunks.length * EXOTEL_CHUNK_BYTES);
    session.ttsPlaybackMs           = greetingPlaybackMs;
    session.postSpeechCooldownUntil = Date.now() + greetingPlaybackMs + 900;
    log(`[exotel:${session.streamSid}] ▶ Greeting sent (${chunks.length} chunks, ~${greetingPlaybackMs} ms)`, "ws");

    // Open the gate: media handler and processAudio can now run.
    // This must be set AFTER the cooldown window is set so the media handler
    // still drops echo during greeting playback.
    session.greetingDone = true;
  } catch (err: any) {
    log(`[exotel] Greeting error: ${err?.message ?? err}`, "ws");
    // Even on error, open the gate so the call doesn't get permanently stuck.
    session.greetingDone = true;
  } finally {
    // Full reset: clears timers, buffers, and speaking state so any audio the
    // caller said before/during the greeting doesn't leak into the first turn.
    resetTurn(session);
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

/**
 * Handle the full lifecycle of one Exotel bidirectional voicebot stream.
 * Wire this to the /exotel-stream WebSocket path in wsServer.ts.
 *
 * Uses safe JSON parsing and defensive mediaFormat extraction so a missing
 * or differently-shaped Start payload never crashes the handler.
 *
 * @param ws                The raw WebSocket connection from Exotel
 * @param initialCampaignId Optional — pulled from URL query param ?campaignId=...
 */
export async function handleExotelStream(
  ws: any,
  initialCampaignId?: string
): Promise<void> {
  const session: ExotelSession = {
    streamSid:               "",
    campaignId:              initialCampaignId,
    campaignCache:           undefined,
    mediaChunks:             [],
    conversationHistory:     [],
    silenceTimer:            null,
    forceTimer:              null,
    firstChunkAt:            null,
    processing:              false,
    isSpeaking:              false,
    bargeInCount:            0,
    voicedChunks:            0,
    pitchReady:              false,
    postSpeechCooldownUntil: 0,   // no cooldown at call start
    ttsPlaybackMs:           0,
    cooldownBuffer:          [],
    greetingDone:            false,  // set true once sendGreeting finishes
  };

  log(`[exotel] session started campaignId=${session.campaignId ?? "none"}`, "ws");

  ws.on("message", async (raw: Buffer | string) => {
    const rawText = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);

    // Safe parse — never crash on non-JSON (plain text, empty frames, etc.)
    const payload = safeJsonParse(rawText);
    if (!payload) {
      log("[exotel] non-JSON message ignored", "ws");
      return;
    }

    // Flexible event name — works with event / type / message_type / action fields
    const eventName = getEventName(payload).toLowerCase();

    // Log all non-media events in full; media events get a compact log below
    if (eventName !== "media") {
      log(`[exotel] raw message: ${rawText}`, "ws");
    }

    try {
      switch (eventName) {

        case "connected":
          log(`[exotel] Connected — payload: ${JSON.stringify(payload, null, 2)}`, "ws");
          break;

        case "start": {
          // Log the full Start payload so we can diagnose any shape variations
          log(`[exotel] Start payload: ${JSON.stringify(payload, null, 2)}`, "ws");

          // streamSid may be at the top level or nested under payload.start
          session.streamSid =
            payload?.streamSid ??
            payload?.stream_sid ??
            payload?.start?.streamSid ??
            payload?.start?.stream_sid ??
            session.streamSid;

          // ── Resolve campaignId (three layers, most → least reliable) ────────

          // 1. Payload fields (rare — only if ExoML passes it as a parameter)
          const payloadCampaignId =
            payload?.campaignId ??
            payload?.start?.campaignId ??
            payload?.start?.custom_parameters?.campaignId ??
            payload?.params?.campaignId;

          if (payloadCampaignId) {
            session.campaignId = payloadCampaignId;
            log(`[exotel] campaignId from payload: ${session.campaignId}`, "ws");
          }

          // 2. CallSid map (primary — set by /test-call right after Exotel API call)
          if (!session.campaignId) {
            const callSid: string =
              payload?.start?.call_sid ??
              payload?.start?.CallSid ??
              payload?.call_sid ??
              "";
            if (callSid) {
              const mapped = callSidMap.get(callSid);
              if (mapped) {
                session.campaignId = mapped;
                callSidMap.delete(callSid);
                log(`[exotel] campaignId from callSid (${callSid}): ${session.campaignId}`, "ws");
              } else {
                log(`[exotel] callSid=${callSid} not in callSidMap (keys: ${[...callSidMap.keys()].join(", ") || "empty"})`, "ws");
              }
            }
          }

          // 3. Phone number map (fallback — normalised last-10-digits match)
          if (!session.campaignId) {
            const fromRaw: string =
              payload?.start?.from ??
              payload?.start?.From ??
              payload?.from ??
              payload?.From ??
              "";
            if (fromRaw) {
              const key = normalizePhone(fromRaw);
              const mapped = phoneCallMap.get(key);
              if (mapped) {
                session.campaignId = mapped;
                phoneCallMap.delete(key);
                log(`[exotel] campaignId from phone key=${key}: ${session.campaignId}`, "ws");
              } else {
                log(`[exotel] phone key=${key} not in phoneCallMap (keys: ${[...phoneCallMap.keys()].join(", ") || "empty"})`, "ws");
              }
            }
          }

          log(`[exotel:${session.streamSid}] campaignId resolved → ${session.campaignId ?? "none (will use first campaign)"}`, "ws");

          // Defensive mediaFormat extraction — never crashes if the field is
          // missing, differently named, or partially populated; falls back to
          // encoding="pcm", sampleRate=8000, channels=1
          const mf = normalizeMediaFormat(payload);
          log(
            `[exotel:${session.streamSid}] Start — encoding=${mf.encoding} sampleRate=${mf.sampleRate} channels=${mf.channels}`,
            "ws"
          );

          // ── Send the AI greeting ~800 ms after the call connects ─────────────
          // Fire-and-forget: greet the caller with the campaign's opening line.
          setTimeout(() => { void sendGreeting(ws, session); }, 800);
          break;
        }

        case "media": {
          // ── Greeting gate ─────────────────────────────────────────────────
          // Never collect audio until the opening greeting has finished playing.
          // Without this gate, the 800 ms silence timer and the 800 ms greeting
          // timer race each other at call start: connection noise ("Hello. Hello.")
          // can trigger processAudio with an empty conversationHistory, causing
          // the AI to generate a random/goodbye response before introducing itself.
          if (!session.greetingDone) break;

          // Safely extract base64 payload from any known field layout
          const encoded = getMediaPayload(payload);
          if (!encoded) {
            log(`[exotel:${session.streamSid}] Media event had no payload`, "ws");
            break;
          }

          // Accept caller audio; skip only explicitly outbound (echo of our own TTS).
          // Exotel may label inbound as "inbound" OR "inbound_track" depending on
          // how the App Builder is configured — accept both and only block "outbound".
          const track: string = (payload?.media?.track ?? "").toLowerCase();
          if (track === "outbound" || track === "outbound_track") {
            break; // echo of our own audio — discard silently
          }

          // Decode the audio buffer early (needed for both the cooldown buffer
          // and the main processing path below).
          let audioBuf: Buffer;
          try {
            audioBuf = Buffer.from(encoded, "base64");
          } catch (e) {
            log(`[exotel:${session.streamSid}] Failed to decode media payload: ${e}`, "ws");
            break;
          }

          const rms = rmsLevel(audioBuf);

          // ── Post-speech cooldown gate ─────────────────────────────────────
          // After we finish streaming TTS audio, Exotel is still PLAYING the
          // buffered chunks.  During that playback, the phone's own speaker
          // echoes our voice back as "inbound" audio.
          //
          // We ignore most audio in this window, BUT if the caller speaks at
          // high energy right as TTS ends (e.g. a quick "Yes") we save it to
          // cooldownBuffer so it isn't permanently lost.  On the next packet
          // that arrives after the cooldown expires we prepend those saved
          // chunks so the caller's response is still processed.
          //
          // Threshold is set ABOVE typical echo energy (measured 300-500 RMS at
          // 8 kHz) so that phone echo does NOT enter the buffer — only genuine
          // caller speech (typically 600+ RMS) qualifies.  Using VAD_THRESHOLD
          // (200) here caused the call-3 "Yes. Yes. Yes." loop: echo chunks filled
          // the buffer, were flushed at cooldown expiry, and cycled back through
          // Whisper which hallucinated 30 consecutive "Yes." segments.
          const COOLDOWN_BUFFER_MIN_RMS = 600;
          if (Date.now() < session.postSpeechCooldownUntil) {
            if (rms > COOLDOWN_BUFFER_MIN_RMS) {
              session.cooldownBuffer.push(audioBuf);
            }
            break;
          }

          // Cooldown just expired — prepend any high-energy audio we saved
          if (session.cooldownBuffer.length > 0) {
            session.mediaChunks.unshift(...session.cooldownBuffer);
            log(`[exotel:${session.streamSid}] ▶ Replaying ${session.cooldownBuffer.length} cooldown-buffered chunks`, "ws");
            session.cooldownBuffer = [];
          }

          // ── Barge-in: caller speaks while AI is talking ───────────────────
          if (session.isSpeaking) {
            if (rms > BARGE_IN_THRESHOLD) {
              session.bargeInCount++;
              if (session.bargeInCount >= BARGE_IN_MIN_CHUNKS) {
                log(`[exotel:${session.streamSid}] BARGE-IN detected (${session.bargeInCount} high-energy chunks) — interrupting AI`, "ws");
                sendExotelClear(ws, session.streamSid);
                session.isSpeaking   = false;
                session.bargeInCount = 0;
                session.voicedChunks = 0;
                // Fall through to start collecting caller's audio below
              } else {
                break; // accumulating evidence — not yet confirmed
              }
            } else {
              session.bargeInCount = 0;
              break; // low-energy during AI speech — ignore
            }
          }

          // ── Collect inbound audio ─────────────────────────────────────────
          session.mediaChunks.push(audioBuf);
          log(
            `[exotel:${session.streamSid}] chunk size=${audioBuf.length}B rms=${rms.toFixed(0)} buf=${session.mediaChunks.length}`,
            "ws"
          );

          // ── VAD: only start/reset silence timer on voiced chunks ──────────
          // Exotel streams flat PCM even during silence, so we ignore low-energy
          // chunks to avoid resetting the silence timer on background noise.
          if (rms > VAD_THRESHOLD) {
            session.voicedChunks++;
            // Require MIN_VOICED_BEFORE_TIMER sustained voiced chunks before
            // starting the silence countdown — prevents noise pops triggering STT.
            if (session.voicedChunks >= MIN_VOICED_BEFORE_TIMER) {
              if (session.silenceTimer) clearTimeout(session.silenceTimer);
              session.silenceTimer = setTimeout(() => {
                log(`[exotel:${session.streamSid}] silence detected (${SILENCE_TIMEOUT_MS} ms) → STT`, "ws");
                if (session.forceTimer) { clearTimeout(session.forceTimer); session.forceTimer = null; }
                session.firstChunkAt = null;
                session.voicedChunks = 0;
                processAudio(ws, session);
              }, SILENCE_TIMEOUT_MS);
            }
          }

          // ── Force timer: fires FORCE_PROCESS_MS after the first chunk ─────
          if (!session.firstChunkAt) {
            session.firstChunkAt = Date.now();
            session.forceTimer = setTimeout(() => {
              log(`[exotel:${session.streamSid}] force-process after ${FORCE_PROCESS_MS} ms`, "ws");
              if (session.silenceTimer) { clearTimeout(session.silenceTimer); session.silenceTimer = null; }
              session.firstChunkAt = null;
              session.forceTimer   = null;
              session.voicedChunks = 0;
              processAudio(ws, session);
            }, FORCE_PROCESS_MS);
          }
          break;
        }

        case "dtmf":
          log(`[exotel:${session.streamSid}] DTMF: ${JSON.stringify(payload)}`, "ws");
          break;

        case "stop":
          log(`[exotel:${session.streamSid}] Stop: ${JSON.stringify(payload)}`, "ws");
          if (session.silenceTimer) { clearTimeout(session.silenceTimer); session.silenceTimer = null; }
          if (session.forceTimer)   { clearTimeout(session.forceTimer);   session.forceTimer   = null; }
          session.firstChunkAt = null;
          await processAudio(ws, session);
          break;

        case "clear":
          session.mediaChunks = [];
          log(`[exotel:${session.streamSid}] Clear — audio buffer reset`, "ws");
          break;

        default:
          log(
            `[exotel] Unhandled event "${eventName || "unknown"}": ${JSON.stringify(payload)}`,
            "ws"
          );
      }
    } catch (err: any) {
      // Catch-all: log but never crash the WebSocket connection
      log(`[exotel] handler error: ${err?.message || err}`, "ws");
    }
  });

  ws.on("close", () => {
    if (session.silenceTimer) clearTimeout(session.silenceTimer);
    if (session.forceTimer)   clearTimeout(session.forceTimer);
    log(
      `[exotel:${session.streamSid || "unknown"}] session closed campaignId=${session.campaignId ?? "none"}`,
      "ws"
    );
  });

  ws.on("error", (err: any) => {
    log(`[exotel] websocket error: ${err?.message || err}`, "ws");
  });
}

// --- PATCH END: Exotel stream handling safety patch ---
