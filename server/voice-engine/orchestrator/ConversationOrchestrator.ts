/**
 * @module ConversationOrchestrator
 *
 * The heart of Voice Engine V2 — coordinates every live conversation.
 *
 * ## Purpose
 * `ConversationOrchestrator` is the single owner of a conversation's lifecycle.
 * It drives the runtime state machine, schedules turns, handles barge-ins, and
 * routes events between the runtime, provider session, and turn infrastructure.
 *
 * It contains NO provider-specific logic. It does NOT import OpenAI, Exotel,
 * or any transport library. All AI and telephony concerns are hidden behind
 * the abstract `IRealtimeProviderSession` interface and the provider resolver.
 *
 * ## Ownership
 * One `ConversationOrchestrator` is created per live call by `OrchestratorFactory`.
 * The caller is responsible for calling `stop()` and `destroy()` when the call ends.
 *
 * ## Thread Safety
 * Lifecycle methods (`start`, `stop`, `handleAudioChunk`, `interrupt`) must be
 * called sequentially. The orchestrator does not acquire locks internally.
 *
 * ## Lifecycle
 * ```
 * createConversationOrchestrator()
 *   └─► start()           — initialise runtime, connect session, begin first turn
 *         └─► [turn loop]  — LISTENING → PROCESSING → RESPONDING → LISTENING
 *               ├─► handleAudioChunk()  — deliver audio during LISTENING
 *               └─► interrupt()         — barge-in during RESPONDING
 *   └─► stop(reason)      — gracefully complete the conversation
 *   └─► destroy()         — forced teardown; always safe to call
 * ```
 */

import type { ConversationRuntime } from '../runtime/ConversationRuntime.js';
import type { RuntimeContext } from '../runtime/RuntimeContext.js';
import type { IProviderResolver } from '../bootstrap/ProviderResolver.js';
import type { ILogger } from '../logger/index.js';
import type { IMetricsCollector } from '../metrics/index.js';
import type { Timestamp, Nullable, SessionId } from '../types/index.js';
import type { TurnPolicy } from './TurnPolicy.js';
import type { ConversationTurn } from './ConversationTurn.js';
import { ConversationContext } from './ConversationContext.js';
import { InterruptManager } from './InterruptManager.js';
import { TurnScheduler } from './TurnScheduler.js';
import { TurnState } from './TurnState.js';
import {
  createTurn,
  patchTurn,
  completeTurn,
  failTurn,
  recordInterruption,
} from './ConversationTurn.js';
import type { TurnInterruption } from './ConversationTurn.js';
import { VoiceEngineError, ErrorCode } from '../errors/index.js';

// ─── Realtime Session Abstraction ─────────────────────────────────────────────

/**
 * Abstract interface for a real-time AI provider session.
 *
 * Implemented by provider-specific sessions (e.g. `OpenAIRealtimeSession`).
 * The orchestrator depends ONLY on this interface — no OpenAI SDK is imported here.
 */
export interface IRealtimeProviderSession {
  /** Whether the session's connection is currently open. */
  readonly isConnected: boolean;

  /** Opens the session connection. Must be called before any send methods. */
  connect(): Promise<void>;

  /**
   * Appends a base64-encoded audio chunk to the provider's input buffer.
   * Fire-and-forget — does not await server acknowledgement.
   */
  sendAudio(base64Chunk: string): void;

  /**
   * Sends a text message into the conversation and triggers a response.
   */
  sendText(text: string): Promise<void>;

  /**
   * Cancels the current in-progress response (barge-in handling).
   */
  interrupt(): Promise<void>;

  /**
   * Updates the active system instructions without closing the session.
   */
  updateInstructions(instructions: string): Promise<void>;

  /** Gracefully closes the session connection. */
  close(): Promise<void>;

  /** Registers a typed event handler on the session. */
  on(type: string, handler: (event: unknown) => void): void;

  /** Removes a previously registered event handler. */
  off(type: string, handler: (event: unknown) => void): void;
}

// ─── Orchestrator State ───────────────────────────────────────────────────────

/**
 * Lifecycle states of the `ConversationOrchestrator` itself.
 * Distinct from `TurnState` (per-turn) and `RuntimeState` (low-level).
 */
export enum OrchestratorState {
  IDLE        = 'IDLE',
  STARTING    = 'STARTING',
  RUNNING     = 'RUNNING',
  STOPPING    = 'STOPPING',
  COMPLETED   = 'COMPLETED',
  FAILED      = 'FAILED',
  DESTROYED   = 'DESTROYED',
}

// ─── Orchestrator Events ──────────────────────────────────────────────────────

export type OrchestratorEventType =
  | 'orchestrator.started'
  | 'orchestrator.turn_started'
  | 'orchestrator.turn_completed'
  | 'orchestrator.turn_failed'
  | 'orchestrator.interrupted'
  | 'orchestrator.completed'
  | 'orchestrator.failed'
  | 'orchestrator.destroyed';

export interface OrchestratorEvent {
  readonly type: OrchestratorEventType;
  readonly timestamp: Timestamp;
  readonly sessionId: SessionId;
  readonly payload: Readonly<Record<string, unknown>>;
}

export type OrchestratorEventHandler = (event: OrchestratorEvent) => void;

// ─── Orchestrator Interface ───────────────────────────────────────────────────

/**
 * Public contract for a single conversation orchestrator instance.
 */
export interface IConversationOrchestrator {
  /** Current lifecycle state of the orchestrator. */
  readonly state: OrchestratorState;

  /**
   * Initialises and connects all resources, then begins the first turn.
   * Transitions: IDLE → STARTING → RUNNING.
   *
   * @throws {VoiceEngineError} if startup fails.
   */
  start(): Promise<void>;

  /**
   * Gracefully ends the conversation.
   * Transitions: RUNNING → STOPPING → COMPLETED.
   *
   * @param reason - Human-readable reason for stopping.
   */
  stop(reason?: string): Promise<void>;

  /**
   * Delivers a base64-encoded audio chunk to the provider session.
   * Only has effect while the orchestrator is RUNNING.
   */
  handleAudioChunk(base64Chunk: string, now: Timestamp): void;

  /**
   * Signals a barge-in. The orchestrator will cancel the current response
   * and return to LISTENING if policy allows.
   */
  interrupt(now: Timestamp): Promise<void>;

  /**
   * Returns the current conversation context (read-only view).
   */
  getContext(): Readonly<ConversationContext>;

  /** Subscribes to orchestrator lifecycle events. */
  on(type: OrchestratorEventType, handler: OrchestratorEventHandler): void;

  /** Unsubscribes from orchestrator lifecycle events. */
  off(type: OrchestratorEventType, handler: OrchestratorEventHandler): void;

  /**
   * Forces an immediate teardown from any state.
   * Safe to call multiple times; subsequent calls are no-ops.
   */
  destroy(): void;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Production implementation of `IConversationOrchestrator`.
 */
export class ConversationOrchestrator implements IConversationOrchestrator {
  private readonly _runtime: ConversationRuntime;
  private readonly _session: IRealtimeProviderSession;
  private readonly _resolver: IProviderResolver;
  private readonly _context: ConversationContext;
  private readonly _interruptManager: InterruptManager;
  private readonly _scheduler: TurnScheduler;
  private readonly _policy: TurnPolicy;
  private readonly _logger: ILogger;
  private readonly _metrics: IMetricsCollector;
  private readonly _clock: RuntimeContext['clock'];

  private _state: OrchestratorState = OrchestratorState.IDLE;
  private _turnIndex = 0;
  private _nextTurnId = 1;

  private readonly _handlers = new Map<OrchestratorEventType, Set<OrchestratorEventHandler>>();

  constructor(deps: {
    runtime: ConversationRuntime;
    session: IRealtimeProviderSession;
    resolver: IProviderResolver;
    context: ConversationContext;
    policy: TurnPolicy;
    logger: ILogger;
    metrics: IMetricsCollector;
    clock: RuntimeContext['clock'];
  }) {
    this._runtime = deps.runtime;
    this._session = deps.session;
    this._resolver = deps.resolver;
    this._context = deps.context;
    this._policy = deps.policy;
    this._logger = deps.logger.child({ component: 'ConversationOrchestrator', sessionId: deps.context.sessionId });
    this._metrics = deps.metrics;
    this._clock = deps.clock;
    this._interruptManager = new InterruptManager(deps.policy);
    this._scheduler = new TurnScheduler(deps.policy);
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  get state(): OrchestratorState {
    return this._state;
  }

  async start(): Promise<void> {
    this._assertState(OrchestratorState.IDLE, 'start');
    this._setState(OrchestratorState.STARTING);
    this._logger.info('ConversationOrchestrator starting');

    try {
      await this._runtime.initialize();
      await this._runtime.connect();
      await this._session.connect();
      this._registerSessionHandlers();

      this._setState(OrchestratorState.RUNNING);
      this._emit('orchestrator.started', {});

      await this._beginNextTurn();
    } catch (err) {
      this._setState(OrchestratorState.FAILED);
      this._emit('orchestrator.failed', { reason: String(err) });
      throw err;
    }
  }

  async stop(reason: string = 'requested'): Promise<void> {
    if (this._state !== OrchestratorState.RUNNING) return;
    this._setState(OrchestratorState.STOPPING);
    this._logger.info('ConversationOrchestrator stopping', { reason });

    await this._runtime.complete(reason);
    await this._session.close();
    await this._runtime.close();

    this._setState(OrchestratorState.COMPLETED);
    this._emit('orchestrator.completed', { reason, totalTurns: this._context.completedTurnCount });
  }

  handleAudioChunk(base64Chunk: string, now: Timestamp): void {
    if (this._state !== OrchestratorState.RUNNING) return;
    this._context.touch(now);
    this._session.sendAudio(base64Chunk);
  }

  async interrupt(now: Timestamp): Promise<void> {
    if (this._state !== OrchestratorState.RUNNING) return;

    const accepted = this._interruptManager.request(now);
    if (!accepted) {
      this._logger.debug('Interrupt request rejected by InterruptManager');
      return;
    }

    this._logger.info('Barge-in accepted — interrupting response');

    const current = this._context.currentTurn;
    if (current) {
      const interruption: TurnInterruption = {
        detectedAt: now,
        responseOffsetMs: current.responseStartedAt ? now - current.responseStartedAt : 0,
      };
      this._context.setCurrentTurn(recordInterruption(current, interruption));
    }

    await this._runtime.interrupt();
    await this._session.interrupt();
    this._interruptManager.acknowledge(now);

    this._emit('orchestrator.interrupted', { turnIndex: this._turnIndex });

    const interrupted = this._context.currentTurn;
    if (interrupted) {
      this._context.archiveTurn(interrupted, now);
    }
    this._interruptManager.clear();

    await this._beginNextTurn();
  }

  getContext(): Readonly<ConversationContext> {
    return this._context;
  }

  on(type: OrchestratorEventType, handler: OrchestratorEventHandler): void {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type)!.add(handler);
  }

  off(type: OrchestratorEventType, handler: OrchestratorEventHandler): void {
    this._handlers.get(type)?.delete(handler);
  }

  destroy(): void {
    if (this._state === OrchestratorState.DESTROYED) return;
    this._logger.info('ConversationOrchestrator destroying');
    this._runtime.destroy();
    this._session.close().catch(() => undefined);
    this._setState(OrchestratorState.DESTROYED);
    this._emit('orchestrator.destroyed', {});
    this._handlers.clear();
  }

  // ─── Turn Lifecycle ──────────────────────────────────────────────────────

  private async _beginNextTurn(): Promise<void> {
    if (this._state !== OrchestratorState.RUNNING) return;

    const now = this._clock.now();
    const decision = this._scheduler.decide({
      currentTurn: this._context.currentTurn,
      previousTurn: this._context.previousTurn,
      completedTurnCount: this._context.completedTurnCount,
      interruptPending: this._interruptManager.isPending,
      silenceTimeout: false,
      responseTimeout: false,
      sessionTimeout: false,
      now,
    });

    this._logger.debug('Scheduling decision', { action: decision.action, reason: decision.reason });

    if (decision.action === 'complete') {
      await this.stop(decision.reason);
      return;
    }

    if (decision.action === 'fail') {
      this._setState(OrchestratorState.FAILED);
      this._emit('orchestrator.failed', { reason: decision.reason });
      return;
    }

    if (decision.action === 'start_listening') {
      const turn = createTurn(
        `turn_${this._nextTurnId++}`,
        this._turnIndex++,
        'user',
        now
      );
      this._context.setCurrentTurn(turn);
      this._emit('orchestrator.turn_started', { turnId: turn.turnId, turnIndex: turn.turnIndex });
      await this._runtime.startListening();
      this._context.setCurrentTurn(patchTurn(turn, { state: TurnState.LISTENING, listeningStartedAt: now }));
    }
  }

  private async _onUtteranceCompleted(transcript: string): Promise<void> {
    if (this._state !== OrchestratorState.RUNNING) return;
    const now = this._clock.now();
    let turn = this._context.currentTurn;
    if (!turn) return;

    turn = patchTurn(turn, {
      state: TurnState.PROCESSING,
      transcript,
      utteranceCommittedAt: now,
      latency: { ...turn.latency, sttLatencyMs: now - (turn.listeningStartedAt ?? now) },
    });
    this._context.setCurrentTurn(turn);
    await this._runtime.startThinking(transcript);
  }

  private async _onResponseCompleted(response: string): Promise<void> {
    if (this._state !== OrchestratorState.RUNNING) return;
    const now = this._clock.now();
    const turn = this._context.currentTurn;
    if (!turn) return;

    const completed = completeTurn(turn, response, now);
    this._context.archiveTurn(completed, now);
    this._emit('orchestrator.turn_completed', { turnId: turn.turnId, turnIndex: turn.turnIndex });

    await this._beginNextTurn();
  }

  private async _onResponseStarted(responseId: string): Promise<void> {
    if (this._state !== OrchestratorState.RUNNING) return;
    const now = this._clock.now();
    const turn = this._context.currentTurn;
    if (!turn) return;

    const withLatency = patchTurn(turn, {
      state: TurnState.RESPONDING,
      responseStartedAt: now,
      latency: {
        ...turn.latency,
        llmLatencyMs: turn.utteranceCommittedAt ? now - turn.utteranceCommittedAt : null,
      },
    });
    this._context.setCurrentTurn(withLatency);
    await this._runtime.startSpeaking(responseId);
  }

  private async _onProviderError(message: string): Promise<void> {
    const now = this._clock.now();
    const turn = this._context.currentTurn;
    if (turn) {
      const failed = failTurn(turn, message, now);
      this._context.archiveTurn(failed, now);
      this._emit('orchestrator.turn_failed', { turnId: turn.turnId, reason: message });
    }

    const decision = this._scheduler.decide({
      currentTurn: this._context.currentTurn,
      previousTurn: this._context.previousTurn,
      completedTurnCount: this._context.completedTurnCount,
      interruptPending: false,
      silenceTimeout: false,
      responseTimeout: false,
      sessionTimeout: false,
      now,
    });

    if (decision.action === 'fail') {
      this._setState(OrchestratorState.FAILED);
      this._emit('orchestrator.failed', { reason: message });
    } else {
      await this._beginNextTurn();
    }
  }

  // ─── Session Event Wiring ────────────────────────────────────────────────

  private _registerSessionHandlers(): void {
    this._session.on('realtime.transcript_completed', async (raw: unknown) => {
      const event = raw as { transcript: string };
      await this._onUtteranceCompleted(event.transcript ?? '').catch((err) => {
        this._logger.error('Error handling transcript_completed', { error: String(err) });
      });
    });

    this._session.on('realtime.response_started', async (raw: unknown) => {
      const event = raw as { responseId: string };
      await this._onResponseStarted(event.responseId ?? '').catch((err) => {
        this._logger.error('Error handling response_started', { error: String(err) });
      });
    });

    this._session.on('realtime.response_completed', async (raw: unknown) => {
      const event = raw as { status: string; responseId: string };
      if (event.status === 'completed') {
        const turn = this._context.currentTurn;
        await this._onResponseCompleted(turn?.response ?? '').catch((err) => {
          this._logger.error('Error handling response_completed', { error: String(err) });
        });
      }
    });

    this._session.on('realtime.error', async (raw: unknown) => {
      const event = raw as { message: string; fatal: boolean };
      this._logger.error('Provider session error', { message: event.message, fatal: event.fatal });
      if (event.fatal) {
        await this._onProviderError(event.message).catch(() => undefined);
      }
    });
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private _setState(state: OrchestratorState): void {
    this._logger.debug('OrchestratorState', { from: this._state, to: state });
    this._state = state;
  }

  private _assertState(expected: OrchestratorState, method: string): void {
    if (this._state !== expected) {
      throw new VoiceEngineError(
        `ConversationOrchestrator.${method}() called in state ${this._state}, expected ${expected}`,
        ErrorCode.PIPELINE_ABORTED,
        false
      );
    }
  }

  private _emit(type: OrchestratorEventType, payload: Record<string, unknown>): void {
    const event: OrchestratorEvent = {
      type,
      timestamp: this._clock.now(),
      sessionId: this._context.sessionId,
      payload: Object.freeze(payload),
    };
    const handlers = this._handlers.get(type);
    if (!handlers) return;
    Array.from(handlers).forEach((handler) => {
      try { handler(event); } catch { /* swallow — event delivery must not crash the orchestrator */ }
    });
  }
}
