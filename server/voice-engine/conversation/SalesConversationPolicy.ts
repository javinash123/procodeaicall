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
  LanguagePolicy,
  SpeakingStylePolicy,
  ActiveListeningPolicy,
  InterruptionPolicy,
  RepetitionPolicy,
  EmotionalAdaptationPolicy,
} from './ResponsePolicy.js';
import { GreetingPolicy } from './GreetingPolicy.js';
import { QuestionStrategy } from './QuestionStrategy.js';
import { RecoveryPolicy } from './RecoveryPolicy.js';
import { ClosingPolicy } from './ClosingPolicy.js';
import { StageObjectivePolicy } from './StageObjectivePolicy.js';
import { KnowledgeBasePolicy } from './KnowledgeBasePolicy.js';
import { TurnControlPolicy } from './TurnControlPolicy.js';

// ─── Sales Funnel Section ─────────────────────────────────────────────────────

/**
 * Inline section that enforces the ordered sales conversation funnel.
 * Defined here rather than in a separate file because it is specific to
 * SalesConversationPolicy and tightly coupled to its stage ordering.
 */
/**
 * Strips dialogue lines that belong to the customer/caller from a raw script.
 *
 * Many scripts are written in play-style format:
 *   Agent: Hello, is this...
 *   Customer: Yes, who is this?
 *   Agent: Great, I'm calling because...
 *
 * Embedding these verbatim causes the model to see a "Customer:" label and
 * try to continue the dialogue — generating hypothetical customer responses
 * instead of stopping to wait for the real caller to speak.
 *
 * This function keeps only the AGENT lines and converts them to plain prose
 * so the model treats the script as talking-points, not a full conversation.
 */
function sanitizeScriptForPrompt(script: string): string {
  const lines = script.split('\n');
  const sanitized: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      sanitized.push('');
      continue;
    }
    // Drop any line whose label belongs to the other party.
    // Matches: "Customer:", "Caller:", "User:", "Client:", "Prospect:", "Lead:"
    // — case-insensitive, with or without leading whitespace.
    if (/^(customer|caller|user|client|prospect|lead)\s*:/i.test(trimmed)) {
      continue;
    }
    // Strip "Agent:" / "You:" prefix and keep just the text.
    const agentStripped = trimmed.replace(/^(agent|you|rep|sales\s*rep|ai)\s*:\s*/i, '');
    sanitized.push(agentStripped);
  }

  return sanitized
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // collapse multiple blank lines
    .trim();
}

const salesFunnelSection = {
  sectionTitle: 'SALES CONVERSATION FLOW',
  render(ctx: PolicyConversationContext) {
    const stages = [
      '1. GREETING   — Warm intro → ask permission → state WHY you called (one sentence) → transition to rapport.',
      '2. RAPPORT     — Build genuine connection; show interest in the caller as a person.',
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
        ? 'Talking-points from the reference script are provided below — use them as inspiration, not a script to recite. Speak naturally.'
        : 'No pre-written script — use the funnel and your knowledge of the product to guide the conversation.',
    ];

    // Sanitize the script before embedding: remove any Customer:/Caller: lines
    // so the model never sees a "Customer says X" pattern and tries to replicate it.
    const rawScript = ctx.existingScript?.trim() ?? '';
    const cleanScript = rawScript ? sanitizeScriptForPrompt(rawScript) : '';

    const scriptBlock = cleanScript
      ? `\n[TALKING-POINTS — agent lines only; customer dialogue has been removed]\n${cleanScript}`
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
      // Critical — turn control must be the very first thing the model reads
      { priority: 'critical', section: new TurnControlPolicy() },

      // Critical — identity and language constraints must come first
      { priority: 'critical', section: new IdentityPolicy() },
      { priority: 'critical', section: new LanguagePolicy() },

      // Critical — knowledge base and answer priority (must be near-top)
      { priority: 'critical', section: new KnowledgeBasePolicy() },

      // Critical — greeting rules must override any script reference
      { priority: 'critical', section: new GreetingPolicy() },

      // High — core conversation behaviour
      { priority: 'high', section: salesFunnelSection },
      { priority: 'high', section: new StageObjectivePolicy() },
      { priority: 'high', section: new ActiveListeningPolicy() },
      { priority: 'high', section: new InterruptionPolicy() },
      { priority: 'high', section: new RepetitionPolicy() },
      { priority: 'high', section: new EmotionalAdaptationPolicy() },
      { priority: 'high', section: new RecoveryPolicy() },

      // Medium — style and question strategy
      { priority: 'medium', section: new SpeakingStylePolicy() },
      { priority: 'medium', section: new QuestionStrategy() },

      // Low — closing courtesies
      { priority: 'low', section: new ClosingPolicy() },
    ];
  }
}
