/**
 * @module ConversationStateMachine
 *
 * Manages conversation stage transitions, enforcing the allowed-transition
 * graph defined in ConversationStage and updating progress metrics.
 *
 * ## Purpose
 * The single authoritative controller for conversation progression.  All
 * stage changes flow through `dispatch()`.  Consumers never mutate stage
 * directly.
 *
 * ## Guarantees
 * - Transitions are validated against `ALLOWED_TRANSITIONS` before applying.
 * - Progress and memory are updated atomically with state transitions.
 * - Every transition is appended to an immutable audit log.
 * - Terminal stages reject all further transitions gracefully.
 *
 * ## No AI imports
 * Pure state machine — no OpenAI, Exotel, or prompt logic.
 */

import {
  ConversationStage,
  isTransitionAllowed,
  isTerminalStage,
  FUNNEL_ORDER,
} from './ConversationStage.js';
import type { ConversationSignal } from './ConversationSignals.js';
import { ConversationState } from './ConversationState.js';
import type { ConversationMemory } from './ConversationMemory.js';
import type { ConversationProgress } from './ConversationProgress.js';

// ─── Transition Record ────────────────────────────────────────────────────────

export interface TransitionRecord {
  readonly from: ConversationStage;
  readonly to: ConversationStage;
  readonly signal: ConversationSignal;
  readonly occurredAt: number;
}

// ─── Transition Error ─────────────────────────────────────────────────────────

export class TransitionError extends Error {
  constructor(
    from: ConversationStage,
    to: ConversationStage,
    reason: string
  ) {
    super(`Invalid transition ${from} → ${to}: ${reason}`);
    this.name = 'TransitionError';
  }
}

// ─── ConversationStateMachine ─────────────────────────────────────────────────

export class ConversationStateMachine {
  private _currentStage: ConversationStage;
  private _previousStage: ConversationStage | null = null;
  private _stageHistory: ConversationStage[] = [];
  private _stageEnteredAt: number;
  private readonly _transitionLog: TransitionRecord[] = [];

  private readonly _memory: ConversationMemory;
  private readonly _progress: ConversationProgress;

  constructor(
    initialStage: ConversationStage,
    memory: ConversationMemory,
    progress: ConversationProgress,
    now: number = Date.now()
  ) {
    this._currentStage = initialStage;
    this._stageHistory.push(initialStage);
    this._stageEnteredAt = now;
    this._memory = memory;
    this._progress = progress;
    this._progress.enterStage(initialStage, now);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** The current conversation stage. */
  get currentStage(): ConversationStage { return this._currentStage; }

  /** The previous conversation stage, or null if still in the first stage. */
  get previousStage(): ConversationStage | null { return this._previousStage; }

  /** Ordered list of every stage visited (may include re-visits). */
  get stageHistory(): readonly ConversationStage[] { return this._stageHistory; }

  /** Immutable audit log of every transition. */
  get transitionLog(): readonly TransitionRecord[] { return this._transitionLog; }

  /** True if the machine is in a terminal stage. */
  get isTerminal(): boolean { return isTerminalStage(this._currentStage); }

  /**
   * Returns a frozen snapshot of the current state.
   */
  getState(now: number = Date.now()): ConversationState {
    return new ConversationState({
      currentStage: this._currentStage,
      previousStage: this._previousStage,
      stageHistory: [...this._stageHistory],
      stageEnteredAt: this._stageEnteredAt,
      snapshotAt: now,
      memory: this._memory,
      progress: this._progress,
    });
  }

  /**
   * Dispatches a signal to the state machine.
   *
   * The machine:
   * 1. Updates progress/memory from the signal payload.
   * 2. Determines whether a stage transition is needed.
   * 3. Validates and applies the transition.
   * 4. Returns the new state snapshot.
   *
   * @throws {TransitionError} if a ForceStageSignal targets an invalid stage.
   */
  dispatch(signal: ConversationSignal, now: number = Date.now()): ConversationState {
    // Apply side effects from the signal to memory and progress
    this._applySignalSideEffects(signal, now);

    // Determine if the signal requests a stage transition
    const targetStage = this._resolveTargetStage(signal);
    if (targetStage !== null) {
      this._transition(targetStage, signal, now);
    }

    return this.getState(now);
  }

  /**
   * Attempts to transition to a specific stage.
   * Returns true if the transition succeeded, false if rejected.
   */
  tryTransitionTo(
    stage: ConversationStage,
    signal: ConversationSignal,
    now: number = Date.now()
  ): boolean {
    if (!isTransitionAllowed(this._currentStage, stage)) return false;
    this._transition(stage, signal, now);
    return true;
  }

  // ─── Signal Side Effects ────────────────────────────────────────────────────

  private _applySignalSideEffects(signal: ConversationSignal, _now: number): void {
    switch (signal.type) {
      case 'AGENT_TURN_COMPLETED':
        this._progress.recordAgentTurn(this._currentStage);
        if (signal.containedQuestion) {
          this._progress.recordQuestion(this._currentStage);
        }
        break;

      case 'QUESTION_ASKED':
        this._progress.recordQuestion(this._currentStage);
        break;

      case 'CUSTOMER_INTERRUPTED':
        this._progress.recordInterruption(this._currentStage);
        break;

      case 'OBJECTION_RAISED':
        this._memory.addObjection(signal.topic, signal.verbatim);
        break;

      case 'OBJECTION_RESOLVED':
        this._memory.resolveObjection(signal.topic);
        break;

      case 'PAIN_POINT_IDENTIFIED':
        this._memory.addPainPoint(signal.description);
        break;

      case 'QUALIFICATION_DATA_GATHERED':
        if (signal.field === 'budget') this._memory.setBudget(signal.value as string);
        if (signal.field === 'timeline') this._memory.setTimeline(signal.value as string);
        if (signal.field === 'decisionMaker') this._memory.setIsDecisionMaker(signal.value as boolean);
        break;

      case 'COMMITMENT_MADE':
        this._memory.addCommitment(signal.description);
        break;

      // Signals that are pure transition triggers — no side effects on data
      case 'CUSTOMER_RESPONDED':
      case 'CUSTOMER_SILENT':
      case 'ADVANCE_STAGE':
      case 'FORCE_STAGE':
      case 'CALL_ENDED':
        break;
    }
  }

  // ─── Target Stage Resolution ────────────────────────────────────────────────

  private _resolveTargetStage(signal: ConversationSignal): ConversationStage | null {
    switch (signal.type) {
      case 'CALL_ENDED':
        return ConversationStage.CALL_COMPLETED;

      case 'FORCE_STAGE':
        return signal.targetStage;

      case 'ADVANCE_STAGE':
        return this._nextFunnelStage();

      case 'OBJECTION_RAISED':
        // Only auto-route if not already in objection handling
        if (this._currentStage !== ConversationStage.OBJECTION_HANDLING) {
          return ConversationStage.OBJECTION_HANDLING;
        }
        return null;

      default:
        return null;
    }
  }

  // ─── Transition Application ─────────────────────────────────────────────────

  private _transition(
    to: ConversationStage,
    signal: ConversationSignal,
    now: number
  ): void {
    if (isTerminalStage(this._currentStage)) {
      // Silently ignore — terminal stages never transition
      return;
    }

    // CALL_COMPLETED is always reachable as an emergency exit
    if (to !== ConversationStage.CALL_COMPLETED && !isTransitionAllowed(this._currentStage, to)) {
      throw new TransitionError(
        this._currentStage,
        to,
        `Not in the allowed transition set for stage ${this._currentStage}`
      );
    }

    const record: TransitionRecord = {
      from: this._currentStage,
      to,
      signal,
      occurredAt: now,
    };

    this._progress.exitStage(this._currentStage, now);
    this._previousStage = this._currentStage;
    this._currentStage = to;
    this._stageHistory.push(to);
    this._stageEnteredAt = now;
    this._transitionLog.push(record);
    this._progress.enterStage(to, now);
  }

  // ─── Funnel Advancement ─────────────────────────────────────────────────────

  /**
   * Returns the next stage in the canonical funnel order, or
   * CALL_COMPLETED if we are at the end.
   */
  private _nextFunnelStage(): ConversationStage {
    const currentIndex = FUNNEL_ORDER.indexOf(this._currentStage);
    if (currentIndex === -1 || currentIndex >= FUNNEL_ORDER.length - 1) {
      return ConversationStage.CALL_COMPLETED;
    }
    // Find the next stage in the funnel that is actually allowed
    for (let i = currentIndex + 1; i < FUNNEL_ORDER.length; i++) {
      const candidate = FUNNEL_ORDER[i];
      if (isTransitionAllowed(this._currentStage, candidate)) {
        return candidate;
      }
    }
    return ConversationStage.CALL_COMPLETED;
  }
}
