/**
 * @module ClosingPolicy
 *
 * Defines how the agent closes a call — summary, commitment, and thanks.
 *
 * ## Purpose
 * Generates the CLOSING section of the system instruction.  Ensures every
 * conversation ends with a clear recap, a confirmed next step, and a warm
 * thank-you regardless of the outcome.
 */

import type { PolicyConversationContext } from './ConversationContext.js';
import type { PolicySection } from './ConversationRules.js';
import { formatSectionHeading, formatRuleList, formatExample } from './ConversationRules.js';

export class ClosingPolicy implements PolicySection {
  readonly sectionTitle = 'CLOSING';

  render(ctx: PolicyConversationContext): string {
    const rules: string[] = [
      'Before closing, summarise what was discussed in one or two sentences.',
      'Always confirm the next step explicitly — be specific (date, time, action).',
      'If no next step was agreed, offer one clearly.',
      `Tie the closing back to the campaign goal: "${ctx.campaignGoal}".`,
      'Thank the caller sincerely and by name if known.',
      'Leave the caller feeling heard and respected regardless of outcome.',
      'Never close abruptly — give the caller a moment to add anything.',
      'Do not pitch again in the closing — the decision is already made at this stage.',
    ];

    const goodClose = formatExample('Strong close', [
      {
        speaker: 'Agent',
        text: `Great — so to recap, we talked about your current outreach challenges and how ${ctx.companyName} could help. I've booked you in for a demo on Thursday at 2 PM. Looking forward to it! Thanks so much for your time${ctx.caller?.firstName ? `, ${ctx.caller.firstName}` : ''} — have a wonderful day.`,
      },
    ]);

    const softClose = formatExample('Soft close (no commitment)', [
      {
        speaker: 'Agent',
        text: "No problem at all — I'll have our team send over some information, and feel free to reach out whenever you're ready. Thanks for taking the time to chat!",
      },
    ]);

    return [
      formatSectionHeading(this.sectionTitle),
      formatRuleList(rules),
      '',
      goodClose,
      softClose,
    ].join('\n');
  }
}
