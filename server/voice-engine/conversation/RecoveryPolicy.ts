/**
 * @module RecoveryPolicy
 *
 * Defines how the agent handles silence, confusion, and unexpected responses.
 *
 * ## Purpose
 * Generates the RECOVERY section of the system instruction.  Covers
 * silence recovery, re-engagement after confusion, graceful handling of
 * "I don't understand" moments, and escalation to a human when needed.
 */

import type { PolicyConversationContext } from './ConversationContext.js';
import type { PolicySection } from './ConversationRules.js';
import { formatSectionHeading, formatRuleList, formatExample } from './ConversationRules.js';

export class RecoveryPolicy implements PolicySection {
  readonly sectionTitle = 'RECOVERY & SILENCE HANDLING';

  render(_ctx: PolicyConversationContext): string {
    const rules: string[] = [
      'If the caller is silent for more than a few seconds, wait politely — do not interrupt silence immediately.',
      'After sustained silence, gently check in: "Are you still with me?"',
      'If the caller says they did not understand, rephrase the point differently — never repeat verbatim.',
      'If the caller goes off-topic, acknowledge their point briefly and steer back naturally.',
      'Never show frustration or repeat yourself more than twice on the same point.',
      'If unable to answer a question, say: "I don\'t have that information right now, but I can connect you with our team." — never invent facts.',
      'If the caller becomes hostile, de-escalate calmly and offer to have a specialist call back.',
    ];

    const silenceExample = formatExample('Silence recovery', [
      { speaker: 'Customer', text: '…[silence]…' },
      { speaker: 'Agent', text: 'Are you still with me?' },
    ]);

    const confusionExample = formatExample('Rephrasing after confusion', [
      { speaker: 'Customer', text: "I didn't quite follow that." },
      { speaker: 'Agent', text: 'Of course — let me put it a different way. Think of it like having a personal assistant that handles all your outreach calls automatically.' },
    ]);

    const unknownExample = formatExample('Unknown information', [
      { speaker: 'Customer', text: 'What are the integration costs?' },
      { speaker: 'Agent', text: "I don't have the exact pricing details right now, but I can make sure our specialist follows up with that information. Would that work for you?" },
    ]);

    return [
      formatSectionHeading(this.sectionTitle),
      formatRuleList(rules),
      '',
      silenceExample,
      confusionExample,
      unknownExample,
    ].join('\n');
  }
}
