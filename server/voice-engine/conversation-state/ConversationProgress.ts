/**
 * @module ConversationProgress
 *
 * Tracks quantitative progress metrics for the current conversation.
 *
 * ## Purpose
 * Maintains per-stage and overall counters — agent turns, questions asked,
 * interruptions, and time spent — so the evaluator and state machine can
 * make data-driven decisions (e.g. "has the minimum turn count been met?").
 *
 * ## Ownership
 * Created alongside `ConversationState` and mutated by the state machine
 * as turns arrive.  Read-only outside the state machine.
 *
 * ## No AI imports
 * Pure metrics container — no OpenAI, Exotel, or prompt logic.
 */

import type { ConversationStage } from './ConversationStage.js';

// ─── Per-Stage Stats ──────────────────────────────────────────────────────────

export interface StageStats {
  /** Number of completed agent turns in this stage. */
  agentTurns: number;
  /** Number of questions the agent asked in this stage. */
  questionsAsked: number;
  /** Number of times the customer interrupted the agent in this stage. */
  interruptions: number;
  /** Epoch ms when this stage was entered. */
  enteredAt: number;
  /** Epoch ms when this stage was exited, or null if still active. */
  exitedAt: number | null;
}

// ─── ConversationProgress ─────────────────────────────────────────────────────

export class ConversationProgress {
  private readonly _stageStats: Map<ConversationStage, StageStats> = new Map();

  /** Wall-clock epoch ms when the entire conversation started. */
  readonly conversationStartedAt: number;

  /** Total agent turns across all stages. */
  private _totalAgentTurns = 0;

  /** Total questions asked across all stages. */
  private _totalQuestionsAsked = 0;

  /** Total interruptions across all stages. */
  private _totalInterruptions = 0;

  constructor(startedAt: number = Date.now()) {
    this.conversationStartedAt = startedAt;
  }

  // ─── Stage Lifecycle ────────────────────────────────────────────────────────

  /**
   * Records entry into a stage — initialises its stats block.
   * Safe to call multiple times for the same stage (re-entry after objection
   * handling will accumulate rather than reset).
   */
  enterStage(stage: ConversationStage, now: number = Date.now()): void {
    if (!this._stageStats.has(stage)) {
      this._stageStats.set(stage, {
        agentTurns: 0,
        questionsAsked: 0,
        interruptions: 0,
        enteredAt: now,
        exitedAt: null,
      });
    }
  }

  /**
   * Records exit from a stage, sealing its elapsed time.
   */
  exitStage(stage: ConversationStage, now: number = Date.now()): void {
    const stats = this._stageStats.get(stage);
    if (stats) {
      stats.exitedAt = now;
    }
  }

  // ─── Turn & Event Recording ─────────────────────────────────────────────────

  /**
   * Records one completed agent turn in the given stage.
   */
  recordAgentTurn(stage: ConversationStage): void {
    const stats = this._ensureStage(stage);
    stats.agentTurns += 1;
    this._totalAgentTurns += 1;
  }

  /**
   * Records a question asked by the agent in the given stage.
   */
  recordQuestion(stage: ConversationStage): void {
    const stats = this._ensureStage(stage);
    stats.questionsAsked += 1;
    this._totalQuestionsAsked += 1;
  }

  /**
   * Records a customer interruption in the given stage.
   */
  recordInterruption(stage: ConversationStage): void {
    const stats = this._ensureStage(stage);
    stats.interruptions += 1;
    this._totalInterruptions += 1;
  }

  // ─── Readers ────────────────────────────────────────────────────────────────

  get totalAgentTurns(): number { return this._totalAgentTurns; }
  get totalQuestionsAsked(): number { return this._totalQuestionsAsked; }
  get totalInterruptions(): number { return this._totalInterruptions; }

  /**
   * Stats for a specific stage, or null if that stage has not been entered.
   */
  getStageStats(stage: ConversationStage): Readonly<StageStats> | null {
    return this._stageStats.get(stage) ?? null;
  }

  /**
   * Number of completed agent turns in a specific stage.
   */
  turnsInStage(stage: ConversationStage): number {
    return this._stageStats.get(stage)?.agentTurns ?? 0;
  }

  /**
   * Number of questions asked in a specific stage.
   */
  questionsInStage(stage: ConversationStage): number {
    return this._stageStats.get(stage)?.questionsAsked ?? 0;
  }

  /**
   * Milliseconds elapsed in a specific stage.
   * Returns elapsed-to-now if the stage has not yet exited.
   */
  timeInStage(stage: ConversationStage, now: number = Date.now()): number {
    const stats = this._stageStats.get(stage);
    if (!stats) return 0;
    return (stats.exitedAt ?? now) - stats.enteredAt;
  }

  /**
   * Total elapsed milliseconds since the conversation started.
   */
  totalElapsedMs(now: number = Date.now()): number {
    return now - this.conversationStartedAt;
  }

  /**
   * Ordered list of stages that have been entered (in entry order).
   */
  get visitedStages(): readonly ConversationStage[] {
    return Array.from(this._stageStats.keys());
  }

  /**
   * Serialises all progress metrics to a plain object for logging.
   */
  toSnapshot(now: number = Date.now()): Readonly<Record<string, unknown>> {
    const stageBreakdown: Record<string, unknown> = {};
    for (const [stage, stats] of Array.from(this._stageStats)) {
      stageBreakdown[stage] = {
        ...stats,
        elapsedMs: (stats.exitedAt ?? now) - stats.enteredAt,
      };
    }
    return Object.freeze({
      conversationStartedAt: this.conversationStartedAt,
      totalElapsedMs: this.totalElapsedMs(now),
      totalAgentTurns: this._totalAgentTurns,
      totalQuestionsAsked: this._totalQuestionsAsked,
      totalInterruptions: this._totalInterruptions,
      stages: stageBreakdown,
    });
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private _ensureStage(stage: ConversationStage): StageStats {
    if (!this._stageStats.has(stage)) {
      this.enterStage(stage);
    }
    return this._stageStats.get(stage)!;
  }
}
