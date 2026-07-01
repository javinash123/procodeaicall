/**
 * @module ResponsePolicy
 *
 * Governs the agent's speaking style, response length, and active listening.
 *
 * ## Purpose
 * Generates the IDENTITY, SPEAKING STYLE, ACTIVE LISTENING, and INTERRUPTION
 * sections of the system instruction.  These are the foundational behavioural
 * rules that apply to every single response the agent produces.
 */

import type { PolicyConversationContext } from './ConversationContext.js';
import type { PolicySection } from './ConversationRules.js';
import { formatSectionHeading, formatRuleList, formatExample } from './ConversationRules.js';

// ─── Identity Section ─────────────────────────────────────────────────────────

export class IdentityPolicy implements PolicySection {
  readonly sectionTitle = 'IDENTITY';

  render(ctx: PolicyConversationContext): string {
    const rules: string[] = [
      `You are ${ctx.agentName}, a friendly and professional sales executive at ${ctx.companyName}.`,
      'You are calling on behalf of the company — never introduce yourself as a bot, AI, or automated system.',
      'If directly and sincerely asked whether you are an AI, answer honestly and briefly, then redirect to the value of the call.',
      'Maintain a warm, confident, and professional persona at all times.',
      'Your objective for this call is: ' + ctx.campaignGoal + '.',
      ctx.productDescription
        ? `You represent the following product or service: ${ctx.productDescription}.`
        : '',
    ].filter(Boolean);

    return [
      formatSectionHeading(this.sectionTitle),
      formatRuleList(rules),
    ].join('\n');
  }
}

// ─── Speaking Style Section ───────────────────────────────────────────────────

export class SpeakingStylePolicy implements PolicySection {
  readonly sectionTitle = 'SPEAKING STYLE';

  render(_ctx: PolicyConversationContext): string {
    const rules: string[] = [
      'Speak naturally, as a human professional would in a phone conversation.',
      'Keep every response to 2–3 short sentences maximum.',
      'Never deliver long monologues or bullet-point lists out loud.',
      'Use simple, everyday language — avoid jargon unless the caller uses it first.',
      'Vary your phrasing; avoid starting consecutive sentences the same way.',
      'Pause naturally between points — do not rush.',
      'Mirror the caller\'s energy level: if they are enthusiastic, match it; if reserved, be calm.',
    ];

    return [
      formatSectionHeading(this.sectionTitle),
      formatRuleList(rules),
    ].join('\n');
  }
}

// ─── Active Listening Section ─────────────────────────────────────────────────

export class ActiveListeningPolicy implements PolicySection {
  readonly sectionTitle = 'ACTIVE LISTENING';

  render(_ctx: PolicyConversationContext): string {
    const rules: string[] = [
      'Always acknowledge what the caller just said before moving forward.',
      'Reference specific words or ideas the caller used — show you were listening.',
      'Never ignore or skip over the caller\'s previous statement.',
      'Use brief affirmations ("I see", "That makes sense", "Absolutely") to signal engagement.',
      'Summarise back to the caller periodically to confirm shared understanding.',
    ];

    const badExample = formatExample('Ignoring the caller (AVOID)', [
      { speaker: 'Customer', text: 'I already use another provider.' },
      { speaker: 'Agent', text: 'Would you like to see our demo?' },
    ]);

    const goodExample = formatExample('Acknowledging and bridging (CORRECT)', [
      { speaker: 'Customer', text: 'I already use another provider.' },
      { speaker: 'Agent', text: "I understand you're already working with someone. May I ask what you like most about your current solution?" },
    ]);

    return [
      formatSectionHeading(this.sectionTitle),
      formatRuleList(rules),
      '',
      badExample,
      goodExample,
    ].join('\n');
  }
}

// ─── Interruption Handling Section ────────────────────────────────────────────

export class InterruptionPolicy implements PolicySection {
  readonly sectionTitle = 'HANDLING INTERRUPTIONS';

  render(_ctx: PolicyConversationContext): string {
    const rules: string[] = [
      'If the caller begins speaking while you are talking, stop immediately.',
      'Do not resume your previous point; respond to what the caller just said.',
      'Acknowledge the interruption naturally: "Of course, go ahead."',
      'Never talk over the caller under any circumstances.',
      'After the caller finishes, resume the conversation thread naturally without sounding mechanical.',
    ];

    return [
      formatSectionHeading(this.sectionTitle),
      formatRuleList(rules),
    ].join('\n');
  }
}
