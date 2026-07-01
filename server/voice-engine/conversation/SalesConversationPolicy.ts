/**
 * @module SalesConversationPolicy
 *
 * Concrete sales-optimised policy that assembles all section policies in the
 * correct priority order for an outbound sales conversation.
 *
 * ## Purpose
 * Wires together all individual section policies (GreetingPolicy,
 * QuestionStrategy, etc.) and returns them as a prioritised list to the
 * ConversationPolicyBuilder.  Also injects a SALES FUNNEL section that
 * enforces the Greeting → Rapport → Discovery → Qualify → Present →
 * Objections → Close flow.
 *
 * ## Ownership
 * The canonical policy for NIJVOX outbound calling campaigns.  Alternative
 * policies (e.g. CustomerSupportPolicy, SurveyPolicy) would implement the
 * same ConversationPolicy interface.
 */

import type { ConversationPolicy } from './ConversationPolicy.js';
import type { WeightedPolicySection } from './ConversationRules.js';
import { formatSectionHeading, formatRuleList } from './ConversationRules.js';
import type { PolicyConversationContext } from './ConversationContext.js';
import {
  IdentityPolicy,
  SpeakingStylePolicy,
  ActiveListeningPolicy,
  InterruptionPolicy,
} from './ResponsePolicy.js';
import { GreetingPolicy } from './GreetingPolicy.js';
import { QuestionStrategy } from './QuestionStrategy.js';
import { RecoveryPolicy } from './RecoveryPolicy.js';
import { ClosingPolicy } from './ClosingPolicy.js';

// ─── Sales Funnel Section ─────────────────────────────────────────────────────

/**
 * Inline section that enforces the ordered sales conversation funnel.
 * Defined here rather than in a separate file because it is specific to
 * SalesConversationPolicy and tightly coupled to its stage ordering.
 */
const salesFunnelSection = {
  sectionTitle: 'SALES CONVERSATION FLOW',
  render(ctx: PolicyConversationContext) {
    const stages = [
      '1. GREETING   — Warm introduction; establish who you are and why you called.',
      '2. RAPPORT     — Small talk; show genuine interest in the caller as a person.',
      '3. DISCOVERY   — Understand their current situation and pain points.',
      '4. QUALIFY     — Confirm they are the right decision-maker and have a real need.',
      '5. PRESENT     — Introduce the relevant solution concisely; tie it to their pain.',
      '6. OBJECTIONS  — Acknowledge concerns, address them with evidence, reframe positively.',
      '7. CLOSE       — Summarise, confirm next step, thank caller.',
    ];

    const rules: string[] = [
      'Follow this order strictly — never skip stages.',
      'Do not pitch the product before completing DISCOVERY and QUALIFY.',
      `Campaign objective for this call: ${ctx.campaignGoal}.`,
      ctx.existingScript
        ? 'A pre-written script has been provided below — use it as a guide, not a script to read verbatim. Adapt it conversationally.'
        : 'No pre-written script — use the funnel and your knowledge of the product to guide the conversation.',
    ];

    const scriptBlock = ctx.existingScript
      ? `\n[REFERENCE SCRIPT — adapt naturally, do not read verbatim]\n${ctx.existingScript}`
      : '';

    return [
      formatSectionHeading('SALES CONVERSATION FLOW'),
      stages.join('\n'),
      '',
      formatRuleList(rules),
      scriptBlock,
    ].join('\n');
  },
};

// ─── SalesConversationPolicy ──────────────────────────────────────────────────

export class SalesConversationPolicy implements ConversationPolicy {
  readonly policyName = 'SalesConversationPolicy';

  getSections(
    context: PolicyConversationContext
  ): readonly WeightedPolicySection[] {
    return [
      // Critical — identity must be first
      { priority: 'critical', section: new IdentityPolicy() },

      // High — core conversation behaviour
      { priority: 'high', section: salesFunnelSection },
      { priority: 'high', section: new ActiveListeningPolicy() },
      { priority: 'high', section: new InterruptionPolicy() },
      { priority: 'high', section: new RecoveryPolicy() },

      // Medium — style and question strategy
      { priority: 'medium', section: new SpeakingStylePolicy() },
      { priority: 'medium', section: new QuestionStrategy() },
      { priority: 'medium', section: new GreetingPolicy() },

      // Low — closing courtesies
      { priority: 'low', section: new ClosingPolicy() },
    ];
  }
}
