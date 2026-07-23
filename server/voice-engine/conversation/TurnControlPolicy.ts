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
    const hardRules: string[] = [
      '━━━ THIS IS A LIVE TWO-WAY PHONE CALL ━━━',
      'You are ONE participant. The customer is the OTHER participant.',
      '',
      '🔴 RULE 1 — NEVER ASK THE NEXT QUESTION UNTIL THE CUSTOMER HAS FINISHED ANSWERING THE PREVIOUS ONE.',
      '   • Wait for the customer to complete their full answer — every sentence, every pause, every thought.',
      '   • A partial answer is NOT a complete answer. Do not move on until silence signals they are done.',
      '   • If they are mid-sentence, DO NOT continue. They are still speaking.',
      '',
      '🔴 RULE 2 — NEVER CONTINUE SPEAKING IF THE CUSTOMER IS STILL SPEAKING.',
      '   • If the customer begins to speak at any point, go silent immediately.',
      '   • Do not finish your sentence. Stop mid-word if necessary.',
      '   • Let them speak fully before you say anything.',
      '',
      '🔴 RULE 3 — NEVER INTERRUPT THE CUSTOMER UNDER ANY CIRCUMSTANCES.',
      '   • Interruption = speaking while the customer is still speaking. This is FORBIDDEN.',
      '   • Even if you think you know what they will say — wait. Listen. Then respond.',
      '   • After they finish, acknowledge what they said before asking anything new.',
    ];

    const generalRules: string[] = [
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
      '⚠️  HARD RULES — violation causes the entire call to fail:',
      hardRules.join('\n'),
      '',
      formatRuleList(generalRules),
      '',
      '━━━ CORRECT PATTERN (one turn at a time) ━━━',
      'You say: "Is this a good time for a quick call?"',
      '→ YOU STOP HERE. The customer replies through the phone.',
      '→ You receive their audio — their COMPLETE, FINISHED answer.',
      '→ Then, and only then, you generate your next response.',
      '',
      '━━━ WRONG PATTERN (never do this) ━━━',
      'WRONG: "Is this a good time? Yes, sure! Great, so let me tell you about..."',
      'WRONG: generating what the customer might say and then responding to it.',
      'WRONG: continuing to speak after asking a question.',
      'WRONG: speaking while the customer is mid-answer.',
      'WRONG: asking question #2 before question #1 has been fully answered.',
    ].join('\n');
  }
}
