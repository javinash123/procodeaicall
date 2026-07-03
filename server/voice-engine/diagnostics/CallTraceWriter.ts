/**
 * @module CallTraceWriter
 *
 * Writes a structured per-call execution trace to:
 *   logs/openai-trace/<sessionId>.json
 *   logs/openai-trace/<sessionId>-summary.json
 *
 * ## Rules
 * - No raw audio (no base64, no PCM buffers).
 * - No full transcripts.
 * - Always-on (not gated on any env var).
 * - Non-fatal: all I/O errors are swallowed.
 * - Accumulates in memory; flushes on end().
 */

import fs from 'node:fs';
import path from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TraceEntry {
  timestamp: number;
  sequence: number;
  component: string;
  event: string;
  payloadSummary: Record<string, unknown>;
  success: boolean;
  skipped: boolean;
  skipReason?: string;
}

export interface TraceSummary {
  sessionId: string;
  firstMissingStep: { event: string; skipReason?: string; sequence: number } | null;
  lastSuccessfulStep: { event: string; sequence: number } | null;
  responseCreated: boolean;
  audioReceived: boolean;
  audioForwarded: boolean;
  audioSentToExotel: boolean;
  totalEvents: number;
  totalErrors: number;
}

// ─── Internal State ───────────────────────────────────────────────────────────

interface ActiveTrace {
  sessionId: string;
  sequence: number;
  entries: TraceEntry[];
}

const _traces = new Map<string, ActiveTrace>();
const TRACE_DIR = path.join(process.cwd(), 'logs', 'openai-trace');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureDir(): void {
  try { fs.mkdirSync(TRACE_DIR, { recursive: true }); } catch { /* ok */ }
}

function safeWrite(filePath: string, data: unknown): void {
  try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8'); } catch { /* non-fatal */ }
}

function buildSummary(trace: ActiveTrace): TraceSummary {
  const { entries, sessionId } = trace;

  const firstMissing = entries.find(e => e.skipped || !e.success) ?? null;
  const successes = entries.filter(e => e.success && !e.skipped);
  const lastSuccess = successes.length > 0 ? successes[successes.length - 1] : null;

  return {
    sessionId,
    firstMissingStep: firstMissing
      ? { event: firstMissing.event, skipReason: firstMissing.skipReason, sequence: firstMissing.sequence }
      : null,
    lastSuccessfulStep: lastSuccess
      ? { event: lastSuccess.event, sequence: lastSuccess.sequence }
      : null,
    responseCreated:    entries.some(e => e.event === 'response.created'            && e.success),
    audioReceived:      entries.some(e => e.event === 'response.audio.delta'        && e.success),
    audioForwarded:     entries.some(e => e.event === 'bridge.audio_ready'          && e.success),
    audioSentToExotel:  entries.some(e => e.event === 'ExotelAdapter.sendMedia'     && e.success),
    totalEvents:        entries.length,
    totalErrors:        entries.filter(e => !e.success && !e.skipped).length,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Starts a new trace for `sessionId`.
 * Must be called before any `record()` calls for this session.
 */
export function startTrace(sessionId: string): void {
  ensureDir();
  _traces.set(sessionId, { sessionId, sequence: 0, entries: [] });
}

/**
 * Records one event into the active trace for `sessionId`.
 * Silently ignored if no active trace exists for the session.
 */
export function recordTrace(
  sessionId: string,
  entry: Omit<TraceEntry, 'timestamp' | 'sequence'>
): void {
  const trace = _traces.get(sessionId);
  if (!trace) return;
  trace.entries.push({
    timestamp: Date.now(),
    sequence:  trace.sequence++,
    ...entry,
  });
}

/**
 * Ends the trace, writes both the full event log and summary to disk,
 * then removes the session from the active map.
 */
export function endTrace(sessionId: string): void {
  const trace = _traces.get(sessionId);
  if (!trace) return;
  _traces.delete(sessionId);

  ensureDir();
  safeWrite(path.join(TRACE_DIR, `${sessionId}.json`),         trace.entries);
  safeWrite(path.join(TRACE_DIR, `${sessionId}-summary.json`), buildSummary(trace));
}
