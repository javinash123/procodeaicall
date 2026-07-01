/**
 * @module ConversationSessionContext
 *
 * Glue layer that connects the Conversation Policy Engine and the
 * Conversation State Engine to a single OpenAI Realtime session.
 *
 * ## Purpose
 * Owns one `ConversationStateBundle` and one `ConversationPolicyBuilder`
 * for the lifetime of a call.  Provides:
 *
 * 1. `buildInstruction()` — merges the static policy instruction with a live
 *    dynamic state section so the AI always knows its current stage, facts,
 *    objections, and its immediate next goal.
 *
 * 2. `onAgentTurnCompleted(transcript)` — auto-dispatches the appropriate
 *    signal after every agent response and returns the new instruction string
 *    only when the conversation state actually changed (avoiding no-op updates).
 *
 * 3. `onCustomerInterrupted()` — records an interruption in the state machine.
 *
 * 4. `dispatchSignal(signal)` — pass-through for callers to inject any signal
 *    (objections, pain points, qualification data, etc.) at any time.
 *
 * ## Rules
 * - No OpenAI SDK imports.
 * - No Exotel imports.
 * - No Transport or Audio Engine imports.
 * - Pure integration between Policy Engine and State Engine.
 *
 * ## Ownership
 * Created by `OpenAIRealtimeProvider.openSession()` when a `policyContext`
 * is provided.  Stored inside `OpenAIRealtimeSession` and consulted after
 * every server-side event that represents a completed agent turn or customer
 * interruption.
 */

import {
  ConversationPolicyBuilder,
  SalesConversationPolicy,
} from '../../conversation/index.js';
import type { PolicyConversationContext } from '../../conversation/index.js';

import {
  ConversationStateFactory,
  ConversationStage,
  Signals,
  STAGE_METADATA,
} from '../../conversation-state/index.js';
import type {
  ConversationStateBundle,
  ConversationSignal,
  ConversationState,
} from '../../conversation-state/index.js';

// ─── Dynamic State Renderer ───────────────────────────────────────────────────

/**
 * Renders the live conversation state as a formatted instruction section.
 * Appended to the base policy instruction so OpenAI always has an up-to-date
 * view of stage, facts, objections, and next goal.
 */
function renderDynamicStateSection(state: ConversationState): string {
  const now = Date.now();
  const ts = new Date(now).toISOString().slice(11, 19); // HH:MM:SS
  const mem = state.memory;
  const prog = state.progress;

  const bar = '─'.repeat(60);

  // ── Stage info ──────────────────────────────────────────────────────────────
  const stageLabel = STAGE_METADATA[state.currentStage].label;
  const prevLabel = state.previousStage
    ? STAGE_METADATA[state.previousStage].label
    : 'none';
  const historyStr = state.stageHistory
    .map((s) => STAGE_METADATA[s].label)
    .join(' → ');
  const timeInStage = Math.round(state.timeInCurrentStage(now) / 1000);

  // ── Memory section ──────────────────────────────────────────────────────────
  const memLines: string[] = [];
  if (mem.customerName) memLines.push(`  • Name:     ${mem.customerName}`);
  if (mem.company) memLines.push(`  • Company:  ${mem.company}`);
  if (mem.intent) memLines.push(`  • Intent:   ${mem.intent}`);
  if (mem.painPoints.length > 0) {
    memLines.push(`  • Pain Points:`);
    mem.painPoints.forEach((p) => memLines.push(`      – ${p}`));
  }
  if (mem.budget) memLines.push(`  • Budget:   ${mem.budget}`);
  if (mem.timeline) memLines.push(`  • Timeline: ${mem.timeline}`);
  if (mem.isDecisionMaker !== undefined) {
    memLines.push(`  • Decision Maker: ${mem.isDecisionMaker ? 'Yes' : 'No'}`);
  }
  const knownFacts =
    memLines.length > 0 ? memLines.join('\n') : '  (nothing captured yet)';

  // ── Objections ──────────────────────────────────────────────────────────────
  const unresolvedObjLines = mem.unresolvedObjections.map(
    (o) => `  • [UNRESOLVED] ${o.topic}${o.verbatim ? ` — "${o.verbatim}"` : ''}`
  );
  const resolvedObjLines = mem.objections
    .filter((o) => o.resolved)
    .map((o) => `  • [resolved]   ${o.topic}`);
  const objSection =
    [...unresolvedObjLines, ...resolvedObjLines].join('\n') ||
    '  none';

  // ── Commitments ─────────────────────────────────────────────────────────────
  const commitSection =
    mem.commitments.length > 0
      ? mem.commitments.map((c) => `  • ${c.description}`).join('\n')
      : '  none';

  // ── Next action ─────────────────────────────────────────────────────────────
  const nextAction = mem.nextAction ?? 'not yet determined';

  // ── Progress ────────────────────────────────────────────────────────────────
  const turnsTotal = prog.totalAgentTurns;
  const turnsStage = state.turnsInCurrentStage;
  const questionsStage = state.questionsInCurrentStage;

  // ── Build section ───────────────────────────────────────────────────────────
  return [
    `\n${bar}`,
    `## LIVE CONVERSATION STATE  [updated ${ts}]`,
    bar,
    `Current Stage:    ${stageLabel}`,
    `Previous Stage:   ${prevLabel}`,
    `Stage History:    ${historyStr}`,
    `Time in Stage:    ${timeInStage}s`,
    `Agent Turns:      ${turnsTotal} total, ${turnsStage} this stage`,
    `Questions Asked:  ${questionsStage} this stage`,
    `Min Turns Met:    ${state.hasMetMinimumTurns ? 'Yes' : 'No'}`,
    ``,
    `Known Customer Facts:`,
    knownFacts,
    ``,
    `Objections:`,
    objSection,
    ``,
    `Commitments:`,
    commitSection,
    ``,
    `Agreed Next Action: ${nextAction}`,
    ``,
    `## YOUR IMMEDIATE NEXT GOAL`,
    bar,
    _renderNextGoal(state),
    bar,
  ].join('\n');
}

function _renderNextGoal(state: ConversationState): string {
  const stage = state.currentStage;
  const mem = state.memory;

  switch (stage) {
    case ConversationStage.GREETING:
      return 'Greet the caller warmly, introduce yourself, and ask one open question to break the ice.';

    case ConversationStage.RAPPORT:
      return 'Build a genuine human connection. Show interest in the caller before any business discussion.';

    case ConversationStage.DISCOVERY:
      return mem.painPoints.length === 0
        ? 'Ask open-ended questions to understand the caller\'s current challenges. Do NOT pitch yet.'
        : `You have identified ${mem.painPoints.length} pain point(s). Continue exploring or advance to Qualification when ready.`;

    case ConversationStage.QUALIFICATION:
      const missing: string[] = [];
      if (mem.isDecisionMaker === undefined) missing.push('decision-making authority');
      if (!mem.budget) missing.push('budget');
      if (!mem.timeline) missing.push('timeline');
      return missing.length > 0
        ? `Qualify the caller — still need: ${missing.join(', ')}.`
        : 'Qualification complete — you may advance to Presentation.';

    case ConversationStage.PRESENTATION:
      return 'Present the solution that directly addresses the pain points you discovered. Keep it concise and tied to their specific needs.';

    case ConversationStage.OBJECTION_HANDLING:
      const unresolved = mem.unresolvedObjections;
      return unresolved.length > 0
        ? `Address the objection: "${unresolved[0].topic}". Acknowledge → reframe → ask if resolved.`
        : 'All objections resolved — advance to Closing or return to Presentation.';

    case ConversationStage.CLOSING:
      return !mem.nextAction
        ? 'Summarise the conversation and propose a concrete next step (e.g. demo date, follow-up call).'
        : `Confirm the agreed next step: "${mem.nextAction}" and thank the caller.`;

    case ConversationStage.CALL_COMPLETED:
      return 'The conversation has ended. Wrap up gracefully.';

    default:
      return 'Continue the conversation following the sales funnel.';
  }
}

// ─── ConversationSessionContext ───────────────────────────────────────────────

export interface ConversationSessionContextOptions {
  /** The policy context for this session. */
  readonly policyContext: PolicyConversationContext;
  /**
   * Optional pre-loaded caller memory (e.g. from CRM before the call starts).
   */
  readonly preloadedMemory?: {
    customerName?: string;
    company?: string;
    intent?: string;
    painPoints?: string[];
    isDecisionMaker?: boolean;
    budget?: string;
    timeline?: string;
  };
}

/**
 * Result returned by `onAgentTurnCompleted()` and `dispatchSignal()`.
 */
export interface StateUpdateResult {
  /** Whether the conversation state changed as a result of the signal. */
  readonly stateChanged: boolean;
  /** The newly generated instruction, or null if no update is needed. */
  readonly updatedInstruction: string | null;
  /** The current stage label after the update. */
  readonly currentStageLabel: string;
}

/**
 * Connects the Policy Engine and State Engine to one OpenAI Realtime session.
 */
export class ConversationSessionContext {
  private readonly _policyContext: PolicyConversationContext;
  private readonly _builder: ConversationPolicyBuilder;
  private readonly _bundle: ConversationStateBundle;

  /** Snapshot of the previous state — used to detect changes. */
  private _lastStage: ConversationStage;
  /** Tracks whether the current response is being interrupted. */
  private _responseInProgress = false;
  /**
   * Character count of the most recently generated instruction string.
   * Updated by `buildInitialInstruction()` and `_buildResult()`.
   * Exposed as a read-only getter for diagnostics — no behaviour change.
   */
  private _lastInstructionSizeChars = 0;

  constructor(options: ConversationSessionContextOptions) {
    this._policyContext = options.policyContext;
    this._builder = new ConversationPolicyBuilder(new SalesConversationPolicy());

    this._bundle = ConversationStateFactory.create({
      preloadedMemory: options.preloadedMemory ?? {
        customerName: options.policyContext.caller?.firstName,
        company: options.policyContext.caller?.company,
      },
    });

    this._lastStage = this._bundle.machine.currentStage;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Generates the full initial system instruction for this session.
   * Call once at session creation time and pass the result to OpenAI.
   */
  buildInitialInstruction(): string {
    const baseInstruction = this._builder.build(this._policyContext);
    const state = this._bundle.machine.getState();
    const full = baseInstruction + renderDynamicStateSection(state);
    this._lastInstructionSizeChars = full.length;
    return full;
  }

  /**
   * Character count of the last instruction string sent to OpenAI.
   * Updated whenever `buildInitialInstruction()` is called or a state change
   * triggers a new instruction via `_buildResult()`.
   * Read by diagnostics — read-only, no behaviour change.
   */
  get lastInstructionSizeChars(): number {
    return this._lastInstructionSizeChars;
  }

  /**
   * Called after every completed agent response turn.
   *
   * Automatically:
   * - Records the agent turn in the state machine.
   * - Detects whether the agent's transcript contained a question.
   * - Evaluates whether the stage should advance.
   * - Returns a new instruction if state changed, or null if unchanged.
   *
   * @param transcript  The completed agent audio transcript (optional).
   */
  onAgentTurnCompleted(transcript?: string): StateUpdateResult {
    this._responseInProgress = false;
    const containedQuestion = transcript
      ? /\?/.test(transcript)
      : false;

    const stageBeforeDispatch = this._bundle.machine.currentStage;

    // Record the agent turn
    let state = this._bundle.machine.dispatch(
      Signals.agentTurnCompleted(containedQuestion)
    );

    // Ask the evaluator whether we should advance stage
    const recommendation = this._bundle.evaluator.evaluate(state);
    if (recommendation.shouldAdvanceStage) {
      state = this._bundle.machine.dispatch(Signals.advanceStage());
    }

    return this._buildResult(stageBeforeDispatch, state);
  }

  /**
   * Called when the server VAD detects customer speech while the agent
   * is responding — this is a barge-in / interruption.
   */
  onCustomerInterrupted(): StateUpdateResult {
    const stageBeforeDispatch = this._bundle.machine.currentStage;
    this._responseInProgress = true;

    const state = this._bundle.machine.dispatch(
      Signals.customerInterrupted()
    );

    return this._buildResult(stageBeforeDispatch, state);
  }

  /**
   * Dispatches any signal directly to the state machine.
   * Use this to inject objections, pain points, qualification data, etc.
   * Returns an updated instruction if the state changed.
   */
  dispatchSignal(signal: ConversationSignal): StateUpdateResult {
    const stageBeforeDispatch = this._bundle.machine.currentStage;
    const state = this._bundle.machine.dispatch(signal);
    return this._buildResult(stageBeforeDispatch, state);
  }

  /**
   * Returns the live `ConversationStateBundle` for direct access.
   * Useful for callers that need to read memory or progress directly.
   */
  get bundle(): Readonly<ConversationStateBundle> {
    return this._bundle;
  }

  /**
   * Returns the current state snapshot.
   */
  getState(): ConversationState {
    return this._bundle.machine.getState();
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private _buildResult(
    stageBeforeDispatch: ConversationStage,
    state: ConversationState
  ): StateUpdateResult {
    const stageChanged = state.currentStage !== stageBeforeDispatch;
    const memChanged = state.currentStage !== this._lastStage;

    if (stageChanged) {
      this._lastStage = state.currentStage;
    }

    // Regenerate instruction on any stage change or when memory is updated
    const stateChanged = stageChanged || memChanged;
    let updatedInstruction: string | null = null;
    if (stateChanged) {
      updatedInstruction = this._builder.build(this._policyContext) + renderDynamicStateSection(state);
      // Track size for diagnostics — no behaviour change
      this._lastInstructionSizeChars = updatedInstruction.length;
    }

    return {
      stateChanged,
      updatedInstruction,
      currentStageLabel: STAGE_METADATA[state.currentStage].label,
    };
  }
}
