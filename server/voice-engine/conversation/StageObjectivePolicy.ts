/**
 * @module StageObjectivePolicy
 *
 * Defines exactly ONE objective per conversation stage.
 *
 * ## Purpose
 * Removes ambiguity about what the agent should achieve before advancing.
 * The agent must satisfy the current stage's single objective before moving
 * to the next stage.  Every response in a stage should drive toward that one
 * goal — nothing else.
 *
 * ## Design principle
 * One stage = one objective.  The agent should not attempt to complete two
 * stage objectives simultaneously.  Advancing to the next stage is gated on
 * the objective being met, not on a fixed turn count.
 */

import type { PolicyConversationContext } from './ConversationContext.js';
import type { PolicySection } from './ConversationRules.js';
import { formatSectionHeading } from './ConversationRules.js';

// ─── Stage objective definitions ──────────────────────────────────────────────

interface StageObjective {
  readonly stage: string;
  readonly objective: string;
  readonly doneLooksLike: string;
  readonly doNotAdvanceUntil: string;
}

const STAGE_OBJECTIVES: readonly StageObjective[] = [
  {
    stage: 'GREETING',
    objective: 'Establish warm contact and obtain permission to continue.',
    doneLooksLike: 'The caller has acknowledged the greeting and said yes (or equivalent) to continuing.',
    doNotAdvanceUntil: 'The caller has explicitly given permission — not just failed to hang up.',
  },
  {
    stage: 'RAPPORT',
    objective: 'Make the caller feel at ease as a person, not a prospect.',
    doneLooksLike: 'The caller has responded naturally — a comment, a laugh, or an open answer about themselves.',
    doNotAdvanceUntil: 'There has been at least one human exchange that is not about the product.',
  },
  {
    stage: 'DISCOVERY',
    objective: 'Identify at least one genuine pain point the caller wants solved.',
    doneLooksLike: 'The caller has described a problem, frustration, or unmet need in their own words.',
    doNotAdvanceUntil: 'At least one specific pain point is captured — do not advance on vague answers.',
  },
  {
    stage: 'QUALIFICATION',
    objective: 'Confirm the caller has the authority and intent to make a decision.',
    doneLooksLike: 'You know whether they are the decision-maker and whether there is a real need and a rough timeline.',
    doNotAdvanceUntil: 'Decision-maker status is confirmed. Do not present to someone who cannot decide.',
  },
  {
    stage: 'PRESENTATION',
    objective: 'Connect exactly one product capability to the caller\'s stated pain point.',
    doneLooksLike: 'You have tied a specific feature or outcome directly to what the caller said they need.',
    doNotAdvanceUntil: 'The caller has reacted — positively, with a question, or with an objection.  Silence is not a reaction.',
  },
  {
    stage: 'OBJECTION_HANDLING',
    objective: 'Resolve the caller\'s current objection so they feel heard and the concern is addressed.',
    doneLooksLike: 'The caller has acknowledged the response and the objection no longer blocks the conversation.',
    doNotAdvanceUntil: 'All active objections are resolved or explicitly deferred by the caller.  Never leave an objection unanswered.',
  },
  {
    stage: 'CLOSING',
    objective: 'Secure one concrete next step and thank the caller by name.',
    doneLooksLike: 'A specific action has been agreed — a demo, a callback, a follow-up email, or a clear "not interested" with a door left open.',
    doNotAdvanceUntil: 'The next step is named and confirmed.  "I\'ll think about it" is not a confirmed next step — clarify timing.',
  },
];

// ─── StageObjectivePolicy ─────────────────────────────────────────────────────

export class StageObjectivePolicy implements PolicySection {
  readonly sectionTitle = 'STAGE OBJECTIVES';

  render(_ctx: PolicyConversationContext): string {
    const header = [
      formatSectionHeading(this.sectionTitle),
      'Each stage has exactly ONE objective.  Do not advance until it is satisfied.',
      'Your current active objective is shown in the CURRENT STATE block below.',
      '',
    ].join('\n');

    const objectiveLines = STAGE_OBJECTIVES.map((o) =>
      [
        `[${o.stage}]`,
        `  Objective    : ${o.objective}`,
        `  Done when    : ${o.doneLooksLike}`,
        `  Do not leave : ${o.doNotAdvanceUntil}`,
      ].join('\n')
    );

    return [header, objectiveLines.join('\n\n')].join('\n');
  }
}
