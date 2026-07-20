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
      'PRIORITY 2 — Knowledge Base: When the caller asks a product-specific or company-specific question, answer directly from the knowledge base below. Do not use general knowledge if the KB covers it.',
      'PRIORITY 3 — General knowledge questions (not in KB): If a caller asks something general (how does X technology work, what is Y industry term, a common-sense question), answer briefly and naturally as a knowledgeable human would — then bridge back to the campaign goal.',
      'PRIORITY 4 — Unknown / uncertain: If you genuinely do not know and the KB does not cover it, say warmly: "I don\'t have that specific detail in front of me — I can make sure someone from our team gets that to you." Never make up facts.',
      'Never hallucinate specific numbers, pricing, features, timelines, or availability. If it is not in the KB, say you\'ll follow up.',
      'After answering any knowledge question, bridge naturally back to the campaign goal — do not let the call become a general Q&A session.',
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
