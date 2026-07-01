/**
 * @module TurnDiagnosticsLog
 *
 * Immutable data model for one complete conversation turn's diagnostics,
 * plus a structured console formatter.
 *
 * ## Coverage (all 20 fields)
 *  1  customerSpeechStartMs      — VAD speech_started timestamp
 *  2  customerSpeechEndMs        — VAD speech_stopped timestamp
 *  3  sttStartMs                 — transcription pipeline start (≈ speech_stopped)
 *  4  sttCompletedMs             — agent transcript complete (audio_transcript.done)
 *  5  agentTranscript            — full agent response text
 *  6  conversationStage          — stage label at turn end
 *  7  promptSizeChars            — instruction character count sent to OpenAI
 *  8  sentToOpenAiMs             — when VAD committed audio (≈ response.created)
 *  9  firstTokenMs               — timestamp of first audio.delta from OpenAI
 * 10  firstAudioChunkMs          — same as firstTokenMs (audio session)
 * 11  lastAudioChunkMs           — timestamp of last audio.delta (response done)
 * 12  audioChunksStreamedCount   — count of audio deltas forwarded to Exotel
 * 13  totalLatencyMs             — speech_started → last audio delta
 * 14  interruptionOccurred       — barge-in detected this turn
 * 15  stageAdvanced              — conversation stage changed during this turn
 * 16  objectionDetected          — new objection added during this turn
 * 17  memoryUpdated              — customer facts added/changed during this turn
 * 18  totalTokens / inputTokens / outputTokens — from response.done usage block
 * 19  estimatedCostUsd           — GPT-4o Realtime blended rate estimate
 * 20  errors                     — any error events observed during this turn
 *
 * ## No behavioural imports
 * This module imports nothing from conversation/, conversation-state/, or the
 * OpenAI provider — it is pure data.
 */

// ─── Cost constants (GPT-4o Realtime, June 2026) ─────────────────────────────
// Input audio tokens:  $6.00 / 1M  = $0.000006 / token
// Output audio tokens: $24.00 / 1M = $0.000024 / token
// These are blended across audio + text tokens in the session.
const COST_PER_INPUT_TOKEN  = 0.000006;
const COST_PER_OUTPUT_TOKEN = 0.000024;

// ─── Data Model ───────────────────────────────────────────────────────────────

export interface TurnDiagnosticsLog {
  // ── Identity
  readonly sessionId: string;
  readonly turnIndex: number;
  readonly isoTimestamp: string;

  // ── 1 & 2: Customer speech window
  readonly customerSpeechStartMs: number | null;
  readonly customerSpeechEndMs: number | null;
  readonly customerSpeechDurationMs: number | null;

  // ── 3 & 4: STT pipeline (server-side, VAD → transcription)
  readonly sttStartMs: number | null;    // ≈ speech_stopped (when audio is committed)
  readonly sttCompletedMs: number | null; // ≈ response.audio_transcript.done
  readonly sttLatencyMs: number | null;

  // ── 5: Transcript (agent's spoken output this turn)
  readonly agentTranscript: string | null;
  readonly agentTranscriptChars: number;

  // ── 6: Conversation stage at turn end
  readonly conversationStage: string;

  // ── 7: Prompt size sent to OpenAI
  readonly promptSizeChars: number;

  // ── 8: Time audio committed to OpenAI (server VAD: same moment as speech_stopped)
  readonly sentToOpenAiMs: number | null;

  // ── 9: First token received (first audio.delta from OpenAI)
  readonly firstTokenMs: number | null;
  readonly timeToFirstTokenMs: number | null; // firstTokenMs - sentToOpenAiMs

  // ── 10 & 11: First / last audio chunk timestamps
  readonly firstAudioChunkMs: number | null;
  readonly lastAudioChunkMs: number | null;
  readonly audioOutputDurationMs: number | null; // lastAudioChunkMs - firstAudioChunkMs

  // ── 12: Audio streamed to Exotel
  readonly audioChunksStreamedCount: number;
  readonly audioStreamedToExotelAt: number | null; // timestamp of first chunk forwarded

  // ── 13: Total E2E latency (speech_started → last audio chunk)
  readonly totalLatencyMs: number | null;

  // ── 14–17: Turn outcome signals
  readonly interruptionOccurred: boolean;
  readonly stageAdvanced: boolean;
  readonly objectionDetected: boolean;
  readonly memoryUpdated: boolean;

  // ── 18: Token counts from response.done
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;

  // ── 19: Cost estimate
  readonly estimatedCostUsd: number;

  // ── 20: Errors
  readonly errors: readonly string[];
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function computeEstimatedCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * COST_PER_INPUT_TOKEN) + (outputTokens * COST_PER_OUTPUT_TOKEN);
}

// ─── Formatter ────────────────────────────────────────────────────────────────

const W = 68; // box width (inner)

function box(lines: string[]): string {
  const top    = '╔' + '═'.repeat(W) + '╗';
  const bottom = '╚' + '═'.repeat(W) + '╝';
  const sep    = '╠' + '═'.repeat(W) + '╣';
  const rows = lines.map((l) => {
    const content = l.startsWith('---') ? sep : '║  ' + l.padEnd(W - 2) + '║';
    return l.startsWith('---') ? content : content;
  });
  return [top, ...rows, bottom].join('\n');
}

function fmt(ms: number | null, label = 'ms'): string {
  if (ms === null) return '—';
  if (label === 'ms') return ms.toFixed(0) + ' ms';
  if (label === 's')  return (ms / 1000).toFixed(3) + ' s';
  return String(ms);
}

function fmtTs(ms: number | null): string {
  if (ms === null) return '—';
  return new Date(ms).toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function bool(v: boolean): string {
  return v ? '✓  YES' : '✗  no';
}

/**
 * Formats a `TurnDiagnosticsLog` as a pretty ASCII box printed to `console.log`.
 * This is the ONLY output mechanism — no file I/O, no structured JSON side-effects.
 */
export function formatTurnDiagnosticsLog(log: TurnDiagnosticsLog): string {
  const stageArrow = log.stageAdvanced
    ? `${log.conversationStage}  ← advanced`
    : log.conversationStage;

  const lines: string[] = [
    // Header
    `TURN #${log.turnIndex}  │  session: ${log.sessionId.slice(0, 20)}  │  ${log.isoTimestamp}`,
    '---',

    // ── 1 & 2: Speech window ──────────────────────────────────────────
    `SPEECH     start:    ${fmtTs(log.customerSpeechStartMs)}`,
    `           end:      ${fmtTs(log.customerSpeechEndMs)}`,
    `           duration: ${fmt(log.customerSpeechDurationMs, 'ms')}`,
    '---',

    // ── 3 & 4: STT ────────────────────────────────────────────────────
    `STT        start:    ${fmtTs(log.sttStartMs)}`,
    `           done:     ${fmtTs(log.sttCompletedMs)}`,
    `           latency:  ${fmt(log.sttLatencyMs, 'ms')}`,
    '---',

    // ── 5: Transcript ─────────────────────────────────────────────────
    `TRANSCRIPT (${log.agentTranscriptChars} chars)`,
    `           ${(log.agentTranscript ?? '—').slice(0, 60)}${(log.agentTranscript?.length ?? 0) > 60 ? '…' : ''}`,
    '---',

    // ── 6 & 7: Stage + Prompt ─────────────────────────────────────────
    `STAGE      ${stageArrow}`,
    `PROMPT     ${log.promptSizeChars.toLocaleString()} chars`,
    '---',

    // ── 8 & 9: OpenAI timing ──────────────────────────────────────────
    `OPENAI     sent:     ${fmtTs(log.sentToOpenAiMs)}`,
    `           1st tok:  ${fmtTs(log.firstTokenMs)}   (TTFT: ${fmt(log.timeToFirstTokenMs, 'ms')})`,
    '---',

    // ── 10 & 11: Audio output ─────────────────────────────────────────
    `AUDIO OUT  1st chunk: ${fmtTs(log.firstAudioChunkMs)}`,
    `           last chunk: ${fmtTs(log.lastAudioChunkMs)}`,
    `           output dur: ${fmt(log.audioOutputDurationMs, 'ms')}`,
    '---',

    // ── 12: Exotel ────────────────────────────────────────────────────
    `EXOTEL     chunks streamed: ${log.audioChunksStreamedCount}   first at: ${fmtTs(log.audioStreamedToExotelAt)}`,
    '---',

    // ── 13: Total latency ─────────────────────────────────────────────
    `LATENCY    E2E (speech start → last audio): ${fmt(log.totalLatencyMs, 'ms')}`,
    '---',

    // ── 14–17: Signals ────────────────────────────────────────────────
    `SIGNALS    interruption:    ${bool(log.interruptionOccurred)}`,
    `           stage advanced:  ${bool(log.stageAdvanced)}`,
    `           objection:       ${bool(log.objectionDetected)}`,
    `           memory updated:  ${bool(log.memoryUpdated)}`,
    '---',

    // ── 18 & 19: Tokens + cost ────────────────────────────────────────
    `TOKENS     in: ${log.inputTokens.toLocaleString()}   out: ${log.outputTokens.toLocaleString()}   total: ${log.totalTokens.toLocaleString()}`,
    `COST       $${log.estimatedCostUsd.toFixed(5)}  (GPT-4o Realtime blended)`,
    '---',

    // ── 20: Errors ────────────────────────────────────────────────────
    `ERRORS     ${log.errors.length === 0 ? 'none' : log.errors.join(' | ').slice(0, 60)}`,
  ];

  return box(lines);
}
