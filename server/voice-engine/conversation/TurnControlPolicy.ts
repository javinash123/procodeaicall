/**
 * @module TurnControlPolicy
 *
 * Enforces strict turn-taking — the agent speaks, then STOPS and WAITS for
 * the customer's real voice response before generating anything else.
 *
 * ## Why this policy exists
 * Without explicit turn-control rules, the OpenAI model can slip into
 * "dialogue continuation" mode: it asks a question and then immediately
 * generates a hypothetical customer answer, then responds to that answer —
 * effectively holding a conversation with itself.  This policy makes the
 * hard boundary explicit and repeated throughout the instruction.
 */

import type { PolicyConversationContext } from './ConversationContext.js';
import type { PolicySection } from './ConversationRules.js';
import { formatSectionHeading, formatRuleList } from './ConversationRules.js';

export class TurnControlPolicy implements PolicySection {
  readonly sectionTitle = 'TURN CONTROL — CRITICAL';

  render(_ctx: PolicyConversationContext): string {
    const rules: string[] = [
      '━━━ THIS IS A LIVE TWO-WAY PHONE CALL ━━━',
      'You are ONE participant. The customer is the OTHER participant.',
      'STOP after every single response. Do NOT continue speaking.',
      'After you ask a question — STOP. The customer will speak their answer through the phone.',
      'After you make a statement — STOP. Wait for the customer to react.',
      'NEVER generate a hypothetical customer answer or imagine what they might say.',
      'NEVER write dialogue for the customer.',
      'NEVER answer your own questions.',
      'NEVER continue the conversation past your turn.',
      'You will receive the customer\'s actual words as audio input before your next turn.',
      'If you finish speaking and hear nothing — the system will handle the silence. Do not fill it.',
    ];

    return [
      formatSectionHeading(this.sectionTitle),
      '⚠️  HARD RULE — violation causes the entire call to fail:',
      formatRuleList(rules),
      '',
      '━━━ CORRECT PATTERN (one turn at a time) ━━━',
      'You say: "Is this a good time for a quick call?"',
      '→ YOU STOP HERE. The customer replies through the phone.',
      '→ You receive their audio. Then you generate your next response.',
      '',
      '━━━ WRONG PATTERN (never do this) ━━━',
      'WRONG: "Is this a good time? Yes, sure! Great, so let me tell you about..."',
      'WRONG: generating what the customer might say and then responding to it.',
      'WRONG: continuing to speak after asking a question.',
    ].join('\n');
  }
}
