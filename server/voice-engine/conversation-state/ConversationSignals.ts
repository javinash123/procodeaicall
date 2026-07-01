/**
 * @module ConversationSignals
 *
 * Defines the typed signals (inputs) that drive state machine transitions.
 *
 * ## Purpose
 * Every event that can change conversation state — a customer utterance, an
 * agent turn completing, silence timeout, call drop, etc. — is modelled as a
 * typed `ConversationSignal`.  The state machine accepts only these signals;
 * it never reads raw audio or network events directly.
 *
 * ## Design principle
 * Signals are the boundary between the outside world and the state engine.
 * They carry only the semantic payload needed for a transition decision.
 * No AI imports, no transport types.
 */

import type { ConversationStage } from './ConversationStage.js';

// ─── Signal Discriminant ──────────────────────────────────────────────────────

export type SignalType =
  | 'AGENT_TURN_COMPLETED'
  | 'QUESTION_ASKED'
  | 'CUSTOMER_RESPONDED'
  | 'CUSTOMER_INTERRUPTED'
  | 'CUSTOMER_SILENT'
  | 'OBJECTION_RAISED'
  | 'OBJECTION_RESOLVED'
  | 'PAIN_POINT_IDENTIFIED'
  | 'QUALIFICATION_DATA_GATHERED'
  | 'COMMITMENT_MADE'
  | 'ADVANCE_STAGE'
  | 'FORCE_STAGE'
  | 'CALL_ENDED';

// ─── Signal Payloads ──────────────────────────────────────────────────────────

/** Agent finished speaking a response turn. */
export interface AgentTurnCompletedSignal {
  type: 'AGENT_TURN_COMPLETED';
  /** Whether the agent's turn included a question. */
  containedQuestion: boolean;
}

/** Agent explicitly asked a question. */
export interface QuestionAskedSignal {
  type: 'QUESTION_ASKED';
}

/** Customer produced a meaningful utterance. */
export interface CustomerRespondedSignal {
  type: 'CUSTOMER_RESPONDED';
  /** Approximate sentiment of the response. */
  sentiment?: 'positive' | 'neutral' | 'negative';
  /** True if the response indicated readiness to advance. */
  showedIntent?: boolean;
}

/** Customer interrupted the agent mid-response. */
export interface CustomerInterruptedSignal {
  type: 'CUSTOMER_INTERRUPTED';
}

/** Customer was silent past the configured threshold. */
export interface CustomerSilentSignal {
  type: 'CUSTOMER_SILENT';
  /** Duration of silence in milliseconds. */
  durationMs: number;
}

/** Customer raised an objection. */
export interface ObjectionRaisedSignal {
  type: 'OBJECTION_RAISED';
  topic: string;
  verbatim?: string;
}

/** An objection was successfully addressed. */
export interface ObjectionResolvedSignal {
  type: 'OBJECTION_RESOLVED';
  topic: string;
}

/** A customer pain point was identified. */
export interface PainPointIdentifiedSignal {
  type: 'PAIN_POINT_IDENTIFIED';
  description: string;
}

/** Qualification data was gathered (budget, timeline, decision-maker). */
export interface QualificationDataGatheredSignal {
  type: 'QUALIFICATION_DATA_GATHERED';
  field: 'budget' | 'timeline' | 'decisionMaker';
  value: string | boolean;
}

/** Customer made a commitment (e.g. agreed to demo). */
export interface CommitmentMadeSignal {
  type: 'COMMITMENT_MADE';
  description: string;
}

/**
 * Requests an automatic advance to the next logical stage in the funnel.
 * The state machine will validate the transition before allowing it.
 */
export interface AdvanceStageSignal {
  type: 'ADVANCE_STAGE';
}

/**
 * Forces a transition to a specific stage.
 * The state machine still validates that the target is reachable.
 */
export interface ForceStageSignal {
  type: 'FORCE_STAGE';
  targetStage: ConversationStage;
  reason: string;
}

/** Call ended — moves to CALL_COMPLETED regardless of current stage. */
export interface CallEndedSignal {
  type: 'CALL_ENDED';
  reason: 'customer_hangup' | 'agent_closed' | 'timeout' | 'error';
}

// ─── Union Type ───────────────────────────────────────────────────────────────

export type ConversationSignal =
  | AgentTurnCompletedSignal
  | QuestionAskedSignal
  | CustomerRespondedSignal
  | CustomerInterruptedSignal
  | CustomerSilentSignal
  | ObjectionRaisedSignal
  | ObjectionResolvedSignal
  | PainPointIdentifiedSignal
  | QualificationDataGatheredSignal
  | CommitmentMadeSignal
  | AdvanceStageSignal
  | ForceStageSignal
  | CallEndedSignal;

// ─── Signal Factories (convenience constructors) ──────────────────────────────

export const Signals = {
  agentTurnCompleted: (containedQuestion: boolean): AgentTurnCompletedSignal => ({
    type: 'AGENT_TURN_COMPLETED',
    containedQuestion,
  }),
  questionAsked: (): QuestionAskedSignal => ({ type: 'QUESTION_ASKED' }),
  customerResponded: (
    sentiment?: CustomerRespondedSignal['sentiment'],
    showedIntent?: boolean
  ): CustomerRespondedSignal => ({
    type: 'CUSTOMER_RESPONDED',
    sentiment,
    showedIntent,
  }),
  customerInterrupted: (): CustomerInterruptedSignal => ({ type: 'CUSTOMER_INTERRUPTED' }),
  customerSilent: (durationMs: number): CustomerSilentSignal => ({ type: 'CUSTOMER_SILENT', durationMs }),
  objectionRaised: (topic: string, verbatim?: string): ObjectionRaisedSignal => ({
    type: 'OBJECTION_RAISED', topic, verbatim,
  }),
  objectionResolved: (topic: string): ObjectionResolvedSignal => ({ type: 'OBJECTION_RESOLVED', topic }),
  painPointIdentified: (description: string): PainPointIdentifiedSignal => ({
    type: 'PAIN_POINT_IDENTIFIED', description,
  }),
  qualificationData: (
    field: QualificationDataGatheredSignal['field'],
    value: string | boolean
  ): QualificationDataGatheredSignal => ({
    type: 'QUALIFICATION_DATA_GATHERED', field, value,
  }),
  commitmentMade: (description: string): CommitmentMadeSignal => ({
    type: 'COMMITMENT_MADE', description,
  }),
  advanceStage: (): AdvanceStageSignal => ({ type: 'ADVANCE_STAGE' }),
  forceStage: (targetStage: ConversationStage, reason: string): ForceStageSignal => ({
    type: 'FORCE_STAGE', targetStage, reason,
  }),
  callEnded: (reason: CallEndedSignal['reason']): CallEndedSignal => ({
    type: 'CALL_ENDED', reason,
  }),
} as const;
