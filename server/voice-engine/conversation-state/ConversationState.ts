/**
 * @module ConversationState
 *
 * Immutable snapshot of the conversation's current state at any point in time.
 *
 * ## Purpose
 * Represents the full observable state of one conversation — stage, history,
 * progress metrics, and memory — at a single instant.  The state machine
 * produces a new `ConversationState` on every transition; the previous
 * snapshot is never mutated.
 *
 * ## Ownership
 * Only `ConversationStateMachine` may produce `ConversationState` instances.
 * Consumers (orchestrator, evaluator) always read via the state machine's
 * `currentState` property.
 *
 * ## No AI imports
 * Pure state data — no OpenAI, Exotel, or prompt logic.
 */

import type { ConversationStage } from './ConversationStage.js';
import { STAGE_METADATA, isTerminalStage, ALLOWED_TRANSITIONS } from './ConversationStage.js';
import type { ConversationMemory } from './ConversationMemory.js';
import type { ConversationProgress } from './ConversationProgress.js';

// ─── ConversationState ────────────────────────────────────────────────────────

export class ConversationState {
  /** The stage the conversation is currently in. */
  readonly currentStage: ConversationStage;

  /** The stage the conversation was in immediately before the current one. */
  readonly previousStage: ConversationStage | null;

  /** Full ordered history of every stage visited (including re-visits). */
  readonly stageHistory: readonly ConversationStage[];

  /** Epoch ms when the current stage was entered. */
  readonly stageEnteredAt: number;

  /** Epoch ms when this state snapshot was created. */
  readonly snapshotAt: number;

  /** Reference to the live memory object (read-only from state consumers). */
  readonly memory: Readonly<ConversationMemory>;

  /** Reference to the live progress tracker (read-only from state consumers). */
  readonly progress: Readonly<ConversationProgress>;

  constructor(params: {
    currentStage: ConversationStage;
    previousStage: ConversationStage | null;
    stageHistory: readonly ConversationStage[];
    stageEnteredAt: number;
    snapshotAt: number;
    memory: ConversationMemory;
    progress: ConversationProgress;
  }) {
    this.currentStage = params.currentStage;
    this.previousStage = params.previousStage;
    this.stageHistory = params.stageHistory;
    this.stageEnteredAt = params.stageEnteredAt;
    this.snapshotAt = params.snapshotAt;
    this.memory = params.memory;
    this.progress = params.progress;
  }

  // ─── Derived Properties ────────────────────────────────────────────────────

  /** True if the conversation has reached a terminal stage. */
  get isTerminal(): boolean {
    return isTerminalStage(this.currentStage);
  }

  /** Human-readable label for the current stage. */
  get currentStageLabel(): string {
    return STAGE_METADATA[this.currentStage].label;
  }

  /** Stages that can be transitioned to from the current stage. */
  get reachableStages(): readonly ConversationStage[] {
    return ALLOWED_TRANSITIONS[this.currentStage];
  }

  /** Whether any forward transition is possible. */
  get canAdvance(): boolean {
    return this.reachableStages.length > 0;
  }

  /**
   * Milliseconds spent in the current stage up to `now`.
   */
  timeInCurrentStage(now: number = Date.now()): number {
    return now - this.stageEnteredAt;
  }

  /**
   * Number of completed agent turns in the current stage.
   */
  get turnsInCurrentStage(): number {
    return this.progress.turnsInStage(this.currentStage);
  }

  /**
   * Number of questions asked in the current stage.
   */
  get questionsInCurrentStage(): number {
    return this.progress.questionsInStage(this.currentStage);
  }

  /**
   * Whether the minimum turn count for the current stage has been met.
   */
  get hasMetMinimumTurns(): boolean {
    const min = STAGE_METADATA[this.currentStage].minTurns;
    return this.turnsInCurrentStage >= min;
  }

  /**
   * Whether there are any unresolved customer objections.
   */
  get hasUnresolvedObjections(): boolean {
    return this.memory.hasUnresolvedObjections;
  }

  /**
   * Serialises the state snapshot to a plain object for logging.
   */
  toSnapshot(): Readonly<Record<string, unknown>> {
    return Object.freeze({
      currentStage: this.currentStage,
      previousStage: this.previousStage,
      stageHistory: [...this.stageHistory],
      stageEnteredAt: this.stageEnteredAt,
      snapshotAt: this.snapshotAt,
      isTerminal: this.isTerminal,
      turnsInCurrentStage: this.turnsInCurrentStage,
      questionsInCurrentStage: this.questionsInCurrentStage,
      hasMetMinimumTurns: this.hasMetMinimumTurns,
      hasUnresolvedObjections: this.hasUnresolvedObjections,
      memory: this.memory.toSnapshot(),
      progress: this.progress.toSnapshot(),
    });
  }
}
