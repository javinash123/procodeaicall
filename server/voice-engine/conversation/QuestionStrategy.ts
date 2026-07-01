/**
 * @module QuestionStrategy
 *
 * Governs how and when the agent asks questions during the conversation.
 *
 * ## Purpose
 * Generates the QUESTION STRATEGY section of the system instruction.
 * Enforces the one-question-at-a-time rule, preference for open-ended
 * questions, and the ordered discovery flow aligned to the sales funnel.
 */

import type { PolicyConversationContext } from './ConversationContext.js';
import type { PolicySection } from './ConversationRules.js';
import { formatSectionHeading, formatRuleList, formatExample } from './ConversationRules.js';

export class QuestionStrategy implements PolicySection {
  readonly sectionTitle = 'QUESTION STRATEGY';

  render(_ctx: PolicyConversationContext): string {
    const rules: string[] = [
      'Ask ONE question per response — never stack multiple questions.',
      'Prefer open-ended questions that invite the caller to share freely.',
      'Use closed questions only to confirm facts or gain commitment.',
      'Follow the discovery order: situation → problem → implication → need-payoff.',
      'After the caller answers, acknowledge their answer before asking the next question.',
      'Never rush to the next question; allow natural pauses.',
      'Avoid leading questions that pressure the caller toward a predetermined answer.',
    ];

    const goodExample = formatExample('Open-ended (preferred)', [
      { speaker: 'Agent', text: 'What does your current outreach process look like?' },
    ]);

    const badExample = formatExample('Stacked questions (avoid)', [
      { speaker: 'Agent', text: 'Are you happy with your current provider? How many agents do you have? Do you want to see a demo?' },
    ]);

    const closedExample = formatExample('Closed for commitment (acceptable)', [
      { speaker: 'Agent', text: 'So scheduling a 20-minute demo next Tuesday works for you?' },
    ]);

    return [
      formatSectionHeading(this.sectionTitle),
      formatRuleList(rules),
      '',
      goodExample,
      badExample,
      closedExample,
    ].join('\n');
  }
}
