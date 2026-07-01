/**
 * @module conversation-state
 *
 * Public API for the NIJVOX Conversation State Engine.
 *
 * ## Quick Start
 *
 * ```ts
 * import {
 *   ConversationStateFactory,
 *   ConversationStage,
 *   Signals,
 * } from './conversation-state/index.js';
 *
 * // 1. Create a bundle for a new call
 * const { machine, evaluator } = ConversationStateFactory.create({
 *   preloadedMemory: { customerName: 'Sarah', company: 'Acme Corp' },
 * });
 *
 * // 2. Dispatch signals as events arrive
 * let state = machine.dispatch(Signals.agentTurnCompleted(true));
 *
 * // 3. Ask the evaluator what to do next
 * const recommendation = evaluator.evaluate(state);
 * // → { action: 'ASK_QUESTION', confidence: 1, shouldAdvanceStage: false, ... }
 *
 * // 4. Customer raises an objection → auto-routes to OBJECTION_HANDLING
 * state = machine.dispatch(Signals.objectionRaised('price', "It seems expensive."));
 * // state.currentStage === ConversationStage.OBJECTION_HANDLING
 *
 * // 5. Advance when ready
 * state = machine.dispatch(Signals.advanceStage());
 * ```
 */

// ─── Stages ───────────────────────────────────────────────────────────────────
export {
  ConversationStage,
  STAGE_METADATA,
  ALLOWED_TRANSITIONS,
  FUNNEL_ORDER,
  isTransitionAllowed,
  getReachableStages,
  isTerminalStage,
} from './ConversationStage.js';
export type { StageMetadata } from './ConversationStage.js';

// ─── Memory ───────────────────────────────────────────────────────────────────
export { ConversationMemory } from './ConversationMemory.js';
export type { CustomerObjection, CallCommitment } from './ConversationMemory.js';

// ─── Progress ─────────────────────────────────────────────────────────────────
export { ConversationProgress } from './ConversationProgress.js';
export type { StageStats } from './ConversationProgress.js';

// ─── Signals ──────────────────────────────────────────────────────────────────
export { Signals } from './ConversationSignals.js';
export type {
  ConversationSignal,
  SignalType,
  AgentTurnCompletedSignal,
  QuestionAskedSignal,
  CustomerRespondedSignal,
  CustomerInterruptedSignal,
  CustomerSilentSignal,
  ObjectionRaisedSignal,
  ObjectionResolvedSignal,
  PainPointIdentifiedSignal,
  QualificationDataGatheredSignal,
  CommitmentMadeSignal,
  AdvanceStageSignal,
  ForceStageSignal,
  CallEndedSignal,
} from './ConversationSignals.js';

// ─── State ────────────────────────────────────────────────────────────────────
export { ConversationState } from './ConversationState.js';

// ─── State Machine ────────────────────────────────────────────────────────────
export { ConversationStateMachine, TransitionError } from './ConversationStateMachine.js';
export type { TransitionRecord } from './ConversationStateMachine.js';

// ─── Evaluator ────────────────────────────────────────────────────────────────
export { ConversationEvaluator, DEFAULT_EVALUATOR_CONFIG } from './ConversationEvaluator.js';
export type {
  AgentAction,
  AgentActionType,
  EvaluatorConfig,
} from './ConversationEvaluator.js';

// ─── Factory ──────────────────────────────────────────────────────────────────
export { ConversationStateFactory } from './ConversationStateFactory.js';
export type {
  ConversationStateFactoryOptions,
  ConversationStateBundle,
} from './ConversationStateFactory.js';
