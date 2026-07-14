/**
 * @module KnowledgeBasePolicy
 *
 * Injects campaign knowledge base content into the system instruction and
 * enforces the knowledge priority hierarchy.
 *
 * ## Priority hierarchy (enforced by this policy)
 *   1. Campaign Goal   — always the primary objective
 *   2. Knowledge Base  — answer product questions from here first
 *   3. General LLM     — last resort; agent must flag uncertainty
 *
 * ## Purpose
 * Without this policy the agent answers product-specific questions from its
 * general training data, which may be wrong for this product.  With this
 * policy the agent has the actual KB content in-context and knows to use it
 * before falling back to generic knowledge.
 */

import type { PolicyConversationContext } from './ConversationContext.js';
import type { PolicySection } from './ConversationRules.js';
import { formatSectionHeading, formatRuleList } from './ConversationRules.js';

export class KnowledgeBasePolicy implements PolicySection {
  readonly sectionTitle = 'KNOWLEDGE BASE & ANSWER PRIORITY';

  render(ctx: PolicyConversationContext): string {
    const priorityRules: string[] = [
      `PRIORITY 1 — Campaign Goal: Every response must serve the campaign objective: "${ctx.campaignGoal}". Never drift from it.`,
      'PRIORITY 2 — Knowledge Base: When the caller asks a product-specific question, answer from the knowledge base below. Do not use general knowledge if the KB covers it.',
      'PRIORITY 3 — General LLM knowledge: Only use this as a last resort. If you are not certain, say: "I don\'t want to give you incorrect information — let me have our team confirm that." Then steer back to the campaign goal.',
      'Never hallucinate facts, pricing, features, or availability. If it is not in the KB, say so.',
      'Never let answering a knowledge question pull you permanently away from the campaign goal — always bridge back.',
    ];

    const hasKB = ctx.knowledgeBase && ctx.knowledgeBase.length > 0;

    const kbBlock = hasKB
      ? [
          '',
          '[KNOWLEDGE BASE CONTENT — use this to answer product questions]',
          '─'.repeat(60),
          ctx.knowledgeBase!.map((chunk, i) => `[KB ${i + 1}]\n${chunk.trim()}`).join('\n\n'),
          '─'.repeat(60),
          '[END KNOWLEDGE BASE]',
        ].join('\n')
      : '\n[KNOWLEDGE BASE] No knowledge base content has been loaded for this campaign.';

    return [
      formatSectionHeading(this.sectionTitle),
      formatRuleList(priorityRules),
      kbBlock,
    ].join('\n');
  }
}
