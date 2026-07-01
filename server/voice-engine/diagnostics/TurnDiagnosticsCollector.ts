/**
 * @module TurnDiagnosticsCollector
 *
 * Observes an `IOpenAIRealtimeSession` and emits one `TurnDiagnosticsLog`
 * for every completed conversation turn.
 *
 * ## Design
 * - Pure observer — subscribes to the session's existing event bus via
 *   `session.on()`.  Zero behaviour changes to the session or provider.
 * - Reads `session.conversationContext` (when present) once at turn START and
 *   once at turn END to diff stage, objections, and memory.
 * - Call `attach(session)` right after `session.connect()`.
 * - Call `detach()` (or let GC collect) after `session.close()`.
 *
 * ## Turn lifecycle
 * ```
 * speech_started  → mark start, snapshot conversation state
 * speech_stopped  → mark end + sttStartMs + sentToOpenAiMs
 * response_started→ (no extra timing needed; sttStart already captured)
 * audio_received  → track first/last chunk, count
 * transcript_done → capture agent transcript, mark sttCompletedMs
 * response_done   → diff state, build log, fire onTurnComplete, reset
 * error           → accumulate errors for current turn
 * ```
 *
 * ## Thread Safety
 * Node.js is single-threaded.  All handlers execute sequentially on the event
 * loop.  No locks are needed.
 *
 * ## No behaviour imports
 * Does NOT import from conversation/, conversation-state/ or any OpenAI logic.
 * All conversation state is read through the opaque `session.conversationContext`
 * reference.
 */

import type { IOpenAIRealtimeSession } from '../providers/openai/OpenAIRealtimeSession.js';
import type {
  RealtimeSpeechStartedEvent,
  RealtimeSpeechStoppedEvent,
  RealtimeResponseStartedEvent,
  RealtimeAudioReceivedEvent,
  RealtimeTranscriptCompletedEvent,
  RealtimeResponseCompletedEvent,
  RealtimeErrorEvent,
} from '../providers/openai/OpenAIRealtimeEvents.js';
import type { ILogger } from '../logger/index.js';
import {
  type TurnDiagnosticsLog,
  computeEstimatedCost,
  formatTurnDiagnosticsLog,
} from './TurnDiagnosticsLog.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TurnCompleteCallback = (log: TurnDiagnosticsLog) => void;

export interface TurnDiagnosticsCollectorOptions {
  readonly session: IOpenAIRealtimeSession;
  readonly logger: ILogger;
  /**
   * Called synchronously after every completed turn with the finished log.
   * Defaults to `formatTurnDiagnosticsLog` printed via `logger.info`.
   */
  readonly onTurnComplete?: TurnCompleteCallback;
  /**
   * Whether to print the formatted box to the logger automatically.
   * Default: true.
   */
  readonly printLogs?: boolean;
}

// ─── Mutable per-turn accumulator ─────────────────────────────────────────────

interface TurnAccumulator {
  turnIndex: number;
  turnStartedAt: number;                // wall-clock ms when speech_started fired

  // Speech window
  customerSpeechStartMs: number | null;
  customerSpeechEndMs: number | null;

  // STT pipeline
  sttStartMs: number | null;

  // OpenAI timing
  sentToOpenAiMs: number | null;
  firstTokenMs: number | null;
  firstAudioChunkMs: number | null;
  lastAudioChunkMs: number | null;
  audioChunksCount: number;
  audioStreamedToExotelAt: number | null;

  // Transcript
  agentTranscript: string | null;
  sttCompletedMs: number | null;

  // Turn outcome
  interruptionOccurred: boolean;
  responseActive: boolean;

  // Errors
  errors: string[];

  // Conversation state snapshot at turn START (for diffing at turn END)
  stageAtStart: string;
  objectionCountAtStart: number;
  memoryHashAtStart: string;

  // Prompt size captured at speech_stopped (latest instruction size)
  promptSizeChars: number;
}

function freshAccumulator(turnIndex: number): TurnAccumulator {
  return {
    turnIndex,
    turnStartedAt: Date.now(),
    customerSpeechStartMs: null,
    customerSpeechEndMs: null,
    sttStartMs: null,
    sentToOpenAiMs: null,
    firstTokenMs: null,
    firstAudioChunkMs: null,
    lastAudioChunkMs: null,
    audioChunksCount: 0,
    audioStreamedToExotelAt: null,
    agentTranscript: null,
    sttCompletedMs: null,
    interruptionOccurred: false,
    responseActive: false,
    errors: [],
    stageAtStart: 'Unknown',
    objectionCountAtStart: 0,
    memoryHashAtStart: '',
    promptSizeChars: 0,
  };
}

// ─── Collector ────────────────────────────────────────────────────────────────

export class TurnDiagnosticsCollector {
  private readonly _logger: ILogger;
  private readonly _onTurnComplete: TurnCompleteCallback;
  private readonly _printLogs: boolean;

  private _session: IOpenAIRealtimeSession | null = null;
  private _turn: TurnAccumulator;
  private _globalTurnIndex = 0;

  // Bound handlers kept for `off()` deregistration
  private readonly _onSpeechStarted: (e: RealtimeSpeechStartedEvent) => void;
  private readonly _onSpeechStopped: (e: RealtimeSpeechStoppedEvent) => void;
  private readonly _onResponseStarted: (e: RealtimeResponseStartedEvent) => void;
  private readonly _onAudioReceived: (e: RealtimeAudioReceivedEvent) => void;
  private readonly _onTranscriptCompleted: (e: RealtimeTranscriptCompletedEvent) => void;
  private readonly _onResponseCompleted: (e: RealtimeResponseCompletedEvent) => void;
  private readonly _onError: (e: RealtimeErrorEvent) => void;

  constructor(opts: TurnDiagnosticsCollectorOptions) {
    this._logger = opts.logger.child({ component: 'TurnDiagnosticsCollector' });
    this._printLogs = opts.printLogs ?? true;
    this._turn = freshAccumulator(0);

    // Default: print the formatted box
    this._onTurnComplete = opts.onTurnComplete ?? ((log) => {
      if (this._printLogs) {
        this._logger.info('\n' + formatTurnDiagnosticsLog(log));
      }
    });

    // Pre-bind all handlers so they can be deregistered later
    this._onSpeechStarted     = this._handleSpeechStarted.bind(this);
    this._onSpeechStopped     = this._handleSpeechStopped.bind(this);
    this._onResponseStarted   = this._handleResponseStarted.bind(this);
    this._onAudioReceived     = this._handleAudioReceived.bind(this);
    this._onTranscriptCompleted = this._handleTranscriptCompleted.bind(this);
    this._onResponseCompleted = this._handleResponseCompleted.bind(this);
    this._onError             = this._handleError.bind(this);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Attaches this collector to a session.  Must be called after `session.connect()`.
   * Safe to call only once.
   */
  attach(session: IOpenAIRealtimeSession): void {
    if (this._session) {
      this._logger.warn('TurnDiagnosticsCollector.attach() called more than once — ignoring');
      return;
    }
    this._session = session;

    session.on('realtime.speech_started',      this._onSpeechStarted);
    session.on('realtime.speech_stopped',      this._onSpeechStopped);
    session.on('realtime.response_started',    this._onResponseStarted);
    session.on('realtime.audio_received',      this._onAudioReceived);
    session.on('realtime.transcript_completed', this._onTranscriptCompleted);
    session.on('realtime.response_completed',  this._onResponseCompleted);
    session.on('realtime.error',               this._onError);

    this._logger.debug('TurnDiagnosticsCollector attached', {
      sessionId: session.sessionId ?? 'pending',
    });
  }

  /**
   * Detaches all event handlers from the session.
   * Safe to call even if `attach()` was never called.
   */
  detach(): void {
    if (!this._session) return;
    const s = this._session;

    s.off('realtime.speech_started',      this._onSpeechStarted);
    s.off('realtime.speech_stopped',      this._onSpeechStopped);
    s.off('realtime.response_started',    this._onResponseStarted);
    s.off('realtime.audio_received',      this._onAudioReceived);
    s.off('realtime.transcript_completed', this._onTranscriptCompleted);
    s.off('realtime.response_completed',  this._onResponseCompleted);
    s.off('realtime.error',               this._onError);

    this._session = null;
    this._logger.debug('TurnDiagnosticsCollector detached');
  }

  /** How many complete turns have been logged so far. */
  get completedTurnCount(): number {
    return this._globalTurnIndex;
  }

  // ─── Event Handlers ────────────────────────────────────────────────────────

  /** 1 & 2 — Customer speech window start */
  private _handleSpeechStarted(e: RealtimeSpeechStartedEvent): void {
    // If a response is active, this is a barge-in interruption
    if (this._turn.responseActive) {
      this._turn.interruptionOccurred = true;
      return; // Don't reset the accumulator — response_completed will close it
    }

    // New turn — reset accumulator
    this._turn = freshAccumulator(this._globalTurnIndex + 1);
    this._turn.customerSpeechStartMs = e.timestamp;

    // Snapshot conversation state at turn start for later diffing
    const ctx = this._session?.conversationContext;
    if (ctx) {
      try {
        const state = ctx.getState();
        this._turn.stageAtStart = state.currentStageLabel;
        this._turn.objectionCountAtStart = state.memory.objections?.length ?? 0;
        this._turn.memoryHashAtStart = this._hashMemory(state.memory);
        this._turn.promptSizeChars = ctx.lastInstructionSizeChars;
      } catch {
        // Defensive: never let diagnostics crash a call
      }
    }
  }

  /** 2 — Customer speech window end / STT start / sent to OpenAI */
  private _handleSpeechStopped(e: RealtimeSpeechStoppedEvent): void {
    this._turn.customerSpeechEndMs = e.timestamp;
    // With server VAD, speech_stopped means audio is committed — OpenAI starts
    // processing immediately. STT start and "sent to OpenAI" are the same instant.
    this._turn.sttStartMs    = e.timestamp;
    this._turn.sentToOpenAiMs = e.timestamp;

    // Also refresh prompt size at this point (most recent instruction)
    const ctx = this._session?.conversationContext;
    if (ctx) {
      try {
        this._turn.promptSizeChars = ctx.lastInstructionSizeChars;
      } catch {
        // Defensive
      }
    }
  }

  /** response.created — OpenAI begins generating a response */
  private _handleResponseStarted(_e: RealtimeResponseStartedEvent): void {
    this._turn.responseActive = true;
    // sentToOpenAiMs already set at speech_stopped for server-VAD sessions.
    // For text-injected turns (sendText) there is no speech window; capture now.
    if (this._turn.sentToOpenAiMs === null) {
      this._turn.sentToOpenAiMs = _e.timestamp;
    }
  }

  /** 9, 10, 11, 12 — Each audio chunk from OpenAI (also streamed to Exotel) */
  private _handleAudioReceived(e: RealtimeAudioReceivedEvent): void {
    if (this._turn.firstTokenMs === null) {
      // First token = first audio delta = first audio chunk
      this._turn.firstTokenMs      = e.timestamp;
      this._turn.firstAudioChunkMs = e.timestamp;
      // The first chunk is also the moment Exotel starts receiving audio
      this._turn.audioStreamedToExotelAt = e.timestamp;
    }
    this._turn.lastAudioChunkMs = e.timestamp;
    this._turn.audioChunksCount++;
  }

  /** 4 & 5 — Agent transcript complete */
  private _handleTranscriptCompleted(e: RealtimeTranscriptCompletedEvent): void {
    this._turn.agentTranscript = e.transcript;
    this._turn.sttCompletedMs  = e.timestamp;
  }

  /** 13–20 — Turn complete: diff state, build log, emit */
  private _handleResponseCompleted(e: RealtimeResponseCompletedEvent): void {
    this._turn.responseActive = false;

    // ── Diff conversation state ──────────────────────────────────────────────
    let stageAtEnd          = this._turn.stageAtStart;
    let objectionCountAtEnd = this._turn.objectionCountAtStart;
    let memoryHashAtEnd     = this._turn.memoryHashAtStart;

    const ctx = this._session?.conversationContext;
    if (ctx) {
      try {
        const state = ctx.getState();
        stageAtEnd          = state.currentStageLabel;
        objectionCountAtEnd = state.memory.objections?.length ?? 0;
        memoryHashAtEnd     = this._hashMemory(state.memory);
      } catch {
        // Defensive
      }
    }

    const stageAdvanced     = stageAtEnd !== this._turn.stageAtStart;
    const objectionDetected = objectionCountAtEnd > this._turn.objectionCountAtStart;
    const memoryUpdated     = memoryHashAtEnd !== this._turn.memoryHashAtStart;

    // ── Derived timings ──────────────────────────────────────────────────────
    const customerSpeechDurationMs =
      this._turn.customerSpeechStartMs !== null && this._turn.customerSpeechEndMs !== null
        ? this._turn.customerSpeechEndMs - this._turn.customerSpeechStartMs
        : null;

    const sttLatencyMs =
      this._turn.sttStartMs !== null && this._turn.sttCompletedMs !== null
        ? this._turn.sttCompletedMs - this._turn.sttStartMs
        : null;

    const timeToFirstTokenMs =
      this._turn.sentToOpenAiMs !== null && this._turn.firstTokenMs !== null
        ? this._turn.firstTokenMs - this._turn.sentToOpenAiMs
        : null;

    const audioOutputDurationMs =
      this._turn.firstAudioChunkMs !== null && this._turn.lastAudioChunkMs !== null
        ? this._turn.lastAudioChunkMs - this._turn.firstAudioChunkMs
        : null;

    const totalLatencyMs =
      this._turn.customerSpeechStartMs !== null && this._turn.lastAudioChunkMs !== null
        ? this._turn.lastAudioChunkMs - this._turn.customerSpeechStartMs
        : null;

    const estimatedCostUsd = computeEstimatedCost(e.inputTokens, e.outputTokens);

    // ── Build the immutable log ──────────────────────────────────────────────
    const log: TurnDiagnosticsLog = {
      sessionId:    this._session?.sessionId ?? 'unknown',
      turnIndex:    this._turn.turnIndex,
      isoTimestamp: new Date().toISOString(),

      customerSpeechStartMs:   this._turn.customerSpeechStartMs,
      customerSpeechEndMs:     this._turn.customerSpeechEndMs,
      customerSpeechDurationMs,

      sttStartMs:    this._turn.sttStartMs,
      sttCompletedMs: this._turn.sttCompletedMs,
      sttLatencyMs,

      agentTranscript:      this._turn.agentTranscript,
      agentTranscriptChars: this._turn.agentTranscript?.length ?? 0,

      conversationStage: stageAtEnd,
      promptSizeChars:   this._turn.promptSizeChars,

      sentToOpenAiMs:    this._turn.sentToOpenAiMs,
      firstTokenMs:      this._turn.firstTokenMs,
      timeToFirstTokenMs,

      firstAudioChunkMs:    this._turn.firstAudioChunkMs,
      lastAudioChunkMs:     this._turn.lastAudioChunkMs,
      audioOutputDurationMs,

      audioChunksStreamedCount: this._turn.audioChunksCount,
      audioStreamedToExotelAt:  this._turn.audioStreamedToExotelAt,

      totalLatencyMs,

      interruptionOccurred: this._turn.interruptionOccurred,
      stageAdvanced,
      objectionDetected,
      memoryUpdated,

      inputTokens:       e.inputTokens,
      outputTokens:      e.outputTokens,
      totalTokens:       e.totalTokens,
      estimatedCostUsd,

      errors: [...this._turn.errors],
    };

    // Advance global counter before calling user callback
    this._globalTurnIndex++;

    // Reset accumulator for next turn
    this._turn = freshAccumulator(this._globalTurnIndex + 1);

    // Fire callback (default: print formatted box)
    try {
      this._onTurnComplete(log);
    } catch (err) {
      this._logger.warn('TurnDiagnosticsCollector onTurnComplete threw', { error: String(err) });
    }
  }

  /** 20 — Accumulate errors for the current turn */
  private _handleError(e: RealtimeErrorEvent): void {
    this._turn.errors.push(`[${e.errorType}] ${e.message}`);
    this._logger.debug('TurnDiagnostics: error accumulated', {
      turn: this._turn.turnIndex,
      error: e.message,
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Produces a lightweight hash of the parts of memory we care about for
   * "memory updated" detection.  Uses JSON serialisation — fast enough for
   * post-turn diffing (not on the hot path).
   */
  private _hashMemory(memory: Record<string, unknown>): string {
    try {
      // Extract stable fields: customerName, company, painPoints, objections
      const snapshot = {
        n: (memory as { customerName?: unknown }).customerName ?? null,
        c: (memory as { company?: unknown }).company ?? null,
        p: (memory as { painPoints?: unknown }).painPoints ?? [],
        o: (memory as { objections?: unknown }).objections ?? [],
        b: (memory as { budget?: unknown }).budget ?? null,
        t: (memory as { timeline?: unknown }).timeline ?? null,
      };
      return JSON.stringify(snapshot);
    } catch {
      return '';
    }
  }
}
