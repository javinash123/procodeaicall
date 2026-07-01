/**
 * @module ConversationEvaluator
 *
 * Determines what the AI agent should do next given the current state.
 *
 * ## Purpose
 * The evaluator is the decision-making layer above the state machine.  It
 * reads the current `ConversationState` and returns an `AgentAction` — a
 * pure recommendation with no side effects.  The caller (orchestrator) is
 * responsible for acting on the recommendation.
 *
 * ## What it decides
 * - Should the agent ask another question?
 * - Should the agent explain / clarify?
 * - Should the agent summarise what has been learned?
 * - Should the agent attempt to close?
 * - Should the agent handle an objection?
 * - Should the agent advance to the next stage?
 *
 * ## Design principle
 * Pure function — no mutations, no I/O, no AI imports.
 * `evaluate()` is deterministic given the same state.
 */

import { ConversationStage, STAGE_METADATA } from './ConversationStage.js';
import type { ConversationState } from './ConversationState.js';

// ─── Agent Action Types ───────────────────────────────────────────────────────

export type AgentActionType =
  | 'ASK_QUESTION'
  | 'EXPLAIN'
  | 'SUMMARIZE'
  | 'HANDLE_OBJECTION'
  | 'ATTEMPT_CLOSE'
  | 'ADVANCE_STAGE'
  | 'RE_ENGAGE'    // customer silent / disengaged
  | 'WRAP_UP';     // call about to complete

/**
 * A structured recommendation produced by the evaluator.
 */
export interface AgentAction {
  /** The recommended next action type. */
  readonly action: AgentActionType;
  /** Confidence level for this recommendation (0–1). */
  readonly confidence: number;
  /** Human-readable rationale for the recommendation. */
  readonly rationale: string;
  /** Whether the state machine should advance stage after this action. */
  readonly shouldAdvanceStage: boolean;
}

// ─── Evaluation Config ────────────────────────────────────────────────────────

export interface EvaluatorConfig {
  /**
   * Maximum questions to ask in a single stage before forcing an advance.
   * @default 4
   */
  maxQuestionsPerStage: number;
  /**
   * Maximum milliseconds to spend in a single stage before forcing an advance.
   * @default 120_000 (2 minutes)
   */
  maxMsPerStage: number;
  /**
   * Minimum pain points needed before PRESENTATION is allowed.
   * @default 1
   */
  minPainPointsForPresentation: number;
}

export const DEFAULT_EVALUATOR_CONFIG: Readonly<EvaluatorConfig> = {
  maxQuestionsPerStage: 4,
  maxMsPerStage: 120_000,
  minPainPointsForPresentation: 1,
};

// ─── ConversationEvaluator ────────────────────────────────────────────────────

export class ConversationEvaluator {
  private readonly config: Readonly<EvaluatorConfig>;

  constructor(config: Partial<EvaluatorConfig> = {}) {
    this.config = Object.freeze({ ...DEFAULT_EVALUATOR_CONFIG, ...config });
  }

  /**
   * Evaluates the current conversation state and returns a recommended action.
   * Pure — no mutations, no async.
   */
  evaluate(state: ConversationState, now: number = Date.now()): AgentAction {
    // ── Terminal — wrap up ────────────────────────────────────────────────────
    if (state.isTerminal) {
      return this._action('WRAP_UP', 1, 'Conversation is in a terminal stage.', false);
    }

    // ── Unresolved objection — must handle before anything else ───────────────
    if (state.hasUnresolvedObjections && state.currentStage !== ConversationStage.OBJECTION_HANDLING) {
      return this._action(
        'HANDLE_OBJECTION',
        0.95,
        `There are ${state.memory.unresolvedObjections.length} unresolved objection(s). Transition to objection handling.`,
        true
      );
    }

    const timeInStage = state.timeInCurrentStage(now);
    const questionsInStage = state.questionsInCurrentStage;
    const minTurns = STAGE_METADATA[state.currentStage].minTurns;

    // ── Stage-specific evaluation ─────────────────────────────────────────────
    switch (state.currentStage) {
      case ConversationStage.GREETING:
        return this._evaluateGreeting(state);

      case ConversationStage.RAPPORT:
        return this._evaluateRapport(state, timeInStage, questionsInStage);

      case ConversationStage.DISCOVERY:
        return this._evaluateDiscovery(state, questionsInStage);

      case ConversationStage.QUALIFICATION:
        return this._evaluateQualification(state, questionsInStage);

      case ConversationStage.PRESENTATION:
        return this._evaluatePresentation(state, questionsInStage);

      case ConversationStage.OBJECTION_HANDLING:
        return this._evaluateObjectionHandling(state);

      case ConversationStage.CLOSING:
        return this._evaluateClosing(state);

      case ConversationStage.CALL_COMPLETED:
        return this._action('WRAP_UP', 1, 'Call is complete.', false);
    }

    // Exhaustive default
    return this._action('ASK_QUESTION', 0.5, 'Unknown stage — default to asking a question.', false);
  }

  // ─── Stage Evaluators ──────────────────────────────────────────────────────

  private _evaluateGreeting(state: ConversationState): AgentAction {
    if (state.turnsInCurrentStage === 0) {
      return this._action('ASK_QUESTION', 1, 'No turns yet — open with greeting and ice-breaker question.', false);
    }
    if (state.hasMetMinimumTurns) {
      return this._action('ADVANCE_STAGE', 0.9, 'Greeting complete — advance to rapport.', true);
    }
    return this._action('ASK_QUESTION', 0.8, 'Continue greeting — minimum turns not yet met.', false);
  }

  private _evaluateRapport(
    state: ConversationState,
    timeInStage: number,
    questionsInStage: number
  ): AgentAction {
    if (questionsInStage >= 2 || timeInStage > 30_000) {
      return this._action('ADVANCE_STAGE', 0.85, 'Rapport established — transition to discovery.', true);
    }
    return this._action('ASK_QUESTION', 0.9, 'Build rapport with an open question about the customer.', false);
  }

  private _evaluateDiscovery(
    state: ConversationState,
    questionsInStage: number
  ): AgentAction {
    const painPoints = state.memory.painPoints.length;
    const atLimit = questionsInStage >= this.config.maxQuestionsPerStage;

    if (painPoints >= this.config.minPainPointsForPresentation && state.hasMetMinimumTurns) {
      return this._action('ADVANCE_STAGE', 0.88, `${painPoints} pain point(s) found — ready for qualification.`, true);
    }
    if (atLimit) {
      return this._action(
        'SUMMARIZE',
        0.75,
        'Question limit reached in discovery — summarise findings before advancing.',
        true
      );
    }
    return this._action('ASK_QUESTION', 0.92, 'Continue discovering pain points.', false);
  }

  private _evaluateQualification(
    state: ConversationState,
    questionsInStage: number
  ): AgentAction {
    const { budget, timeline, isDecisionMaker } = state.memory;
    const qualified = budget !== undefined && timeline !== undefined && isDecisionMaker !== undefined;
    const atLimit = questionsInStage >= this.config.maxQuestionsPerStage;

    if (qualified) {
      return this._action('ADVANCE_STAGE', 0.9, 'All qualification data gathered — advance to presentation.', true);
    }
    if (atLimit) {
      return this._action(
        'SUMMARIZE',
        0.7,
        'Question limit reached in qualification — advance with partial data.',
        true
      );
    }
    // Determine which field to qualify next
    if (isDecisionMaker === undefined) {
      return this._action('ASK_QUESTION', 0.95, 'Decision-maker not confirmed — ask about authority.', false);
    }
    if (budget === undefined) {
      return this._action('ASK_QUESTION', 0.9, 'Budget not captured — ask about investment capacity.', false);
    }
    return this._action('ASK_QUESTION', 0.85, 'Timeline not captured — ask about urgency.', false);
  }

  private _evaluatePresentation(
    state: ConversationState,
    questionsInStage: number
  ): AgentAction {
    if (state.turnsInCurrentStage === 0) {
      return this._action('EXPLAIN', 0.95, 'Present the solution tied to the discovered pain.', false);
    }
    if (questionsInStage >= 1 && state.hasMetMinimumTurns) {
      return this._action('ATTEMPT_CLOSE', 0.8, 'Presentation delivered and reaction gauged — attempt close.', true);
    }
    return this._action('ASK_QUESTION', 0.85, 'Check reaction to presentation with a probing question.', false);
  }

  private _evaluateObjectionHandling(state: ConversationState): AgentAction {
    const unresolved = state.memory.unresolvedObjections;
    if (unresolved.length === 0) {
      return this._action('ADVANCE_STAGE', 0.9, 'All objections resolved — return to funnel.', true);
    }
    if (state.turnsInCurrentStage === 0) {
      return this._action('EXPLAIN', 0.95, `Address objection: "${unresolved[0].topic}".`, false);
    }
    return this._action('ASK_QUESTION', 0.8, 'Check whether the objection has been resolved to the customer\'s satisfaction.', false);
  }

  private _evaluateClosing(state: ConversationState): AgentAction {
    if (!state.memory.hasNextAction) {
      return this._action('SUMMARIZE', 0.9, 'Summarise conversation and propose a concrete next step.', false);
    }
    if (state.memory.commitments.length > 0) {
      return this._action('WRAP_UP', 0.95, 'Commitment made and next action confirmed — wrap up gracefully.', true);
    }
    return this._action('ATTEMPT_CLOSE', 0.85, 'Next action set but commitment not yet confirmed — solidify.', false);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private _action(
    action: AgentActionType,
    confidence: number,
    rationale: string,
    shouldAdvanceStage: boolean
  ): AgentAction {
    return Object.freeze({ action, confidence, rationale, shouldAdvanceStage });
  }
}
