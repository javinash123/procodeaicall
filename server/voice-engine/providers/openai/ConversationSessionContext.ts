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
function renderDynamicStateSection(state: ConversationState, ctx: PolicyConversationContext): string {
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

  // ── DO NOT ASK AGAIN block ──────────────────────────────────────────────────
  const doNotAskLines: string[] = [];
  if (mem.customerName) doNotAskLines.push(`  • Their name (it's ${mem.customerName})`);
  if (mem.company) doNotAskLines.push(`  • Their company (it's ${mem.company})`);
  if (mem.intent) doNotAskLines.push(`  • Their intent (already stated)`);
  if (mem.painPoints.length > 0) {
    mem.painPoints.forEach((p) => doNotAskLines.push(`  • Pain point already given: "${p}"`));
  }
  if (mem.budget) doNotAskLines.push(`  • Their budget (it's ${mem.budget})`);
  if (mem.timeline) doNotAskLines.push(`  • Their timeline (it's ${mem.timeline})`);
  if (mem.isDecisionMaker !== undefined) {
    doNotAskLines.push(
      `  • Whether they're the decision-maker (answer: ${mem.isDecisionMaker ? 'Yes' : 'No'})`
    );
  }
  const doNotAskSection =
    doNotAskLines.length > 0
      ? `⛔ DO NOT ASK AGAIN — the caller already provided:\n${doNotAskLines.join('\n')}`
      : '  (no facts captured yet — nothing to guard)';

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
  const customerTurnsStage = state.customerTurnsInCurrentStage;
  const customerHasResponded = state.customerHasRespondedThisStage;

  // ── Build section ───────────────────────────────────────────────────────────
  return [
    `\n${bar}`,
    `## LIVE CONVERSATION STATE  [updated ${ts}]`,
    bar,
    `Current Stage:         ${stageLabel}`,
    `Previous Stage:        ${prevLabel}`,
    `Stage History:         ${historyStr}`,
    `Time in Stage:         ${timeInStage}s`,
    `Agent Turns:           ${turnsTotal} total, ${turnsStage} this stage`,
    `Customer Turns:        ${customerTurnsStage} this stage`,
    `Customer Responded:    ${customerHasResponded ? 'YES — customer has spoken this stage' : 'NO — customer has NOT spoken yet this stage'}`,
    `Questions Asked:       ${questionsStage} this stage`,
    `Min Turns Met:         ${state.hasMetMinimumTurns ? 'Yes' : 'No'}`,
    ``,
    `Known Customer Facts:`,
    knownFacts,
    ``,
    doNotAskSection,
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
    _renderNextGoal(state, ctx),
    bar,
  ].join('\n');
}

/**
 * Renders a campaign-specific, actionable instruction for the AI's very next
 * response.  This is the single most important line the model reads on every
 * turn — it must be concrete, refer to the actual campaign, and end with
 * a hard "STOP and wait" reminder so the model never fills silence itself.
 */
function _renderNextGoal(state: ConversationState, ctx: PolicyConversationContext): string {
  const stage = state.currentStage;
  const mem   = state.memory;

  // Short name for the person being called — personalises instructions
  const callerName = mem.customerName || ctx.caller?.firstName || 'the caller';
  // What we're selling / what the company does
  const product    = ctx.productDescription || ctx.companyName || 'our solution';
  // The overall campaign mission
  const goal       = ctx.campaignGoal || 'complete the call objective';

  switch (stage) {

    // ── GREETING ──────────────────────────────────────────────────────────────
    // Rule: one sentence intro, then permission question, then STOP.
    case ConversationStage.GREETING: {
      const nameFragment = ctx.caller?.firstName ? ` ${ctx.caller.firstName}` : '';
      return [
        `Say: "Hi${nameFragment}! This is ${ctx.agentName} from ${ctx.companyName}.`,
        `Is this a good time for a quick call?"`,
        `Then STOP immediately. Do not say another word.`,
        `Wait for the caller to answer — DO NOT generate their reply.`,
      ].join(' ');
    }

    // ── RAPPORT ───────────────────────────────────────────────────────────────
    // Rule: one human question — NOT about the product or campaign goal yet.
    case ConversationStage.RAPPORT:
      return [
        `Build a genuine human connection with ${callerName} before any business talk.`,
        `Ask ONE light, personal question — about their day, their role, or something they mentioned.`,
        `Do NOT mention ${product} or the campaign goal ("${goal}") at this stage.`,
        `After asking — STOP and wait for their answer.`,
      ].join(' ');

    // ── DISCOVERY ─────────────────────────────────────────────────────────────
    // Rule: ask campaign-specific open questions to uncover real pain points.
    case ConversationStage.DISCOVERY: {
      if (mem.painPoints.length === 0) {
        return [
          `Ask ${callerName} ONE open question to understand their current challenges`,
          `as they relate to: "${goal}".`,
          `The question must be about THEIR situation — not about ${product}.`,
          `Example angles: how they currently handle the relevant process,`,
          `what frustrates them about it, what they wish were different.`,
          `After asking — STOP. Do not answer the question yourself.`,
        ].join(' ');
      }
      const painList = mem.painPoints.map((p, i) => `${i + 1}. "${p}"`).join('; ');
      return [
        `You have captured ${mem.painPoints.length} pain point(s): ${painList}.`,
        `Either dig deeper with a follow-up question, or confirm understanding and`,
        `move to Qualification when you are confident you understand their real need.`,
      ].join(' ');
    }

    // ── QUALIFICATION ─────────────────────────────────────────────────────────
    // Rule: one qualifying question at a time — confirm authority, budget, timeline.
    case ConversationStage.QUALIFICATION: {
      const missingQuestions: string[] = [];
      if (mem.isDecisionMaker === undefined)
        missingQuestions.push(`"Are you the right person to decide on something like this, or would others be involved?"`);
      if (!mem.budget)
        missingQuestions.push(`"Do you have a budget in mind for solving this?"`);
      if (!mem.timeline)
        missingQuestions.push(`"What's your timeline — is this something you're looking to solve soon?"`);

      if (missingQuestions.length === 0) {
        return `Qualification complete. Advance to Presentation when ready.`;
      }
      return [
        `Ask the SINGLE most important qualifying question:`,
        missingQuestions[0],
        `After asking — STOP and wait for ${callerName} to answer.`,
        `Do not ask multiple questions at once.`,
      ].join(' ');
    }

    // ── PRESENTATION ──────────────────────────────────────────────────────────
    // Rule: tie the product directly to their stated pain — one capability, not a feature list.
    case ConversationStage.PRESENTATION: {
      const topPain = mem.painPoints[0] ?? 'their stated challenge';
      return [
        `Present ${product} as the direct answer to: "${topPain}".`,
        `ONE sentence: what it does — then link it to exactly what ${callerName} told you.`,
        `Do NOT list features. Connect ONE capability to their specific pain.`,
        `Then ask a confirming question: "Does that sound like it would help you?"`,
        `— then STOP and wait for their reaction.`,
      ].join(' ');
    }

    // ── OBJECTION HANDLING ────────────────────────────────────────────────────
    case ConversationStage.OBJECTION_HANDLING: {
      const unresolved = mem.unresolvedObjections;
      if (unresolved.length > 0) {
        return [
          `Address objection: "${unresolved[0].topic}".`,
          `Pattern: Acknowledge ("I understand...") → Reframe with evidence → Ask "Does that make sense?"`,
          `Then STOP and wait.`,
        ].join(' ');
      }
      return `All objections resolved — advance to Closing.`;
    }

    // ── CLOSING ───────────────────────────────────────────────────────────────
    case ConversationStage.CLOSING: {
      if (!mem.nextAction) {
        // Make the next-step suggestion specific to the campaign goal
        const demoAngle  = /demo|product|platform|tool|software|app|system/i.test(goal);
        const callAngle  = /speak|call|discuss|chat|connect/i.test(goal);
        const nextStepQ  = demoAngle
          ? `"Would you like to schedule a quick demo so you can see it for yourself?"`
          : callAngle
            ? `"Can we schedule a follow-up call at a time that suits you?"`
            : `"What would be the right next step from here?"`;
        return [
          `Wrap up by proposing a concrete next step: ${nextStepQ}`,
          `After asking — STOP and wait for ${callerName}'s answer.`,
        ].join(' ');
      }
      return `Confirm: "${mem.nextAction}". Thank ${callerName} by name and close warmly.`;
    }

    case ConversationStage.CALL_COMPLETED:
      return `Say a warm goodbye to ${callerName} and end the call.`;

    default:
      return `Continue following the campaign goal: "${goal}".`;
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
    const full = baseInstruction + renderDynamicStateSection(state, this._policyContext);
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
   * Called when the server VAD has committed the customer's audio buffer —
   * meaning the customer has finished a complete turn.
   *
   * This is the authoritative signal that a real customer response was received
   * and is used to gate stage advancement.  Without this, the evaluator would
   * advance stages based purely on agent turns, causing the AI to race through
   * the conversation funnel while talking to itself.
   *
   * When the customer speaks for the first time in a stage, we force a
   * session.update so the model's live state section changes from
   * "Customer Responded: NO" to "Customer Responded: YES" before the model
   * generates its next response.
   */
  onCustomerTurnCompleted(): StateUpdateResult {
    const stageBeforeDispatch = this._bundle.machine.currentStage;
    const customerTurnsBefore = this._bundle.machine.getState().customerTurnsInCurrentStage;

    const state = this._bundle.machine.dispatch(
      Signals.customerTurnCompleted()
    );

    const customerTurnsAfter = state.customerTurnsInCurrentStage;
    const isFirstCustomerTurn = customerTurnsBefore === 0 && customerTurnsAfter === 1;

    // Force a session.update on the first customer turn in each stage so the
    // model immediately sees "Customer Responded: YES" in its live state section.
    if (isFirstCustomerTurn) {
      const updatedInstruction = this._builder.build(this._policyContext) + renderDynamicStateSection(state, this._policyContext);
      this._lastInstructionSizeChars = updatedInstruction.length;
      return {
        stateChanged: true,
        updatedInstruction,
        currentStageLabel: STAGE_METADATA[state.currentStage].label,
      };
    }

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
      updatedInstruction = this._builder.build(this._policyContext) + renderDynamicStateSection(state, this._policyContext);
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
