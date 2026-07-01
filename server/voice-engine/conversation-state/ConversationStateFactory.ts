/**
 * @module ConversationStateFactory
 *
 * Creates fully-initialised `ConversationStateMachine` instances.
 *
 * ## Purpose
 * Centralises construction so that every session gets a consistent, valid
 * initial state without callers having to manually wire together the
 * memory, progress tracker, and state machine.
 *
 * ## Usage
 * ```ts
 * const machine = ConversationStateFactory.create({
 *   customerName: 'Sarah',
 *   company: 'Acme Corp',
 * });
 * ```
 *
 * ## No AI imports
 * Pure factory — no OpenAI, Exotel, or prompt logic.
 */

import { ConversationStage } from './ConversationStage.js';
import { ConversationMemory } from './ConversationMemory.js';
import { ConversationProgress } from './ConversationProgress.js';
import { ConversationStateMachine } from './ConversationStateMachine.js';
import { ConversationEvaluator } from './ConversationEvaluator.js';
import type { EvaluatorConfig } from './ConversationEvaluator.js';

// ─── Factory Options ──────────────────────────────────────────────────────────

export interface ConversationStateFactoryOptions {
  /**
   * Stage to begin from.
   * @default ConversationStage.GREETING
   */
  initialStage?: ConversationStage;

  /**
   * Pre-populate memory with caller information known before the call.
   */
  preloadedMemory?: {
    customerName?: string;
    company?: string;
    intent?: string;
    painPoints?: string[];
    isDecisionMaker?: boolean;
    budget?: string;
    timeline?: string;
  };

  /**
   * Wall-clock epoch ms to use as the conversation start time.
   * Defaults to Date.now().
   */
  startedAt?: number;

  /**
   * Optional overrides for the evaluator configuration.
   */
  evaluatorConfig?: Partial<EvaluatorConfig>;
}

// ─── Factory Result ───────────────────────────────────────────────────────────

export interface ConversationStateBundle {
  /** The live state machine — call `dispatch()` on every signal. */
  readonly machine: ConversationStateMachine;
  /** The memory object shared with the machine. */
  readonly memory: ConversationMemory;
  /** The progress tracker shared with the machine. */
  readonly progress: ConversationProgress;
  /** The evaluator configured for this session. */
  readonly evaluator: ConversationEvaluator;
}

// ─── ConversationStateFactory ─────────────────────────────────────────────────

export class ConversationStateFactory {
  /**
   * Creates and returns a fully-wired conversation state bundle.
   */
  static create(options: ConversationStateFactoryOptions = {}): ConversationStateBundle {
    const now = options.startedAt ?? Date.now();
    const initialStage = options.initialStage ?? ConversationStage.GREETING;

    // Build memory — optionally pre-seeded with caller data
    const memory = new ConversationMemory();
    if (options.preloadedMemory) {
      const pm = options.preloadedMemory;
      if (pm.customerName) memory.setCustomerName(pm.customerName);
      if (pm.company) memory.setCompany(pm.company);
      if (pm.intent) memory.setIntent(pm.intent);
      if (pm.painPoints) pm.painPoints.forEach((p) => memory.addPainPoint(p));
      if (pm.isDecisionMaker !== undefined) memory.setIsDecisionMaker(pm.isDecisionMaker);
      if (pm.budget) memory.setBudget(pm.budget);
      if (pm.timeline) memory.setTimeline(pm.timeline);
    }

    // Build progress tracker
    const progress = new ConversationProgress(now);

    // Build state machine
    const machine = new ConversationStateMachine(initialStage, memory, progress, now);

    // Build evaluator
    const evaluator = new ConversationEvaluator(options.evaluatorConfig);

    return Object.freeze({ machine, memory, progress, evaluator });
  }
}
