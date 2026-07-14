/**
 * @module GreetingPolicy
 *
 * Defines how the agent opens the call — warm, natural, and personalised.
 *
 * ## Purpose
 * Generates the GREETING section of the system instruction.  Covers how to
 * introduce the agent, acknowledge the caller by name when available, ask
 * permission before continuing, and transition smoothly into rapport-building
 * without launching into a pitch.
 *
 * ## Permission gate
 * After the warm greeting the agent must ask for permission to continue
 * before going further.  This is the most important phrase in any outbound
 * call — skipping it is the #1 reason callers hang up in the first ten
 * seconds.  The agent must wait for the caller's response before proceeding.
 */

import type { PolicyConversationContext } from './ConversationContext.js';
import type { PolicySection } from './ConversationRules.js';
import { formatSectionHeading, formatRuleList, formatExample } from './ConversationRules.js';

export class GreetingPolicy implements PolicySection {
  readonly sectionTitle = 'GREETING & PERMISSION';

  render(ctx: PolicyConversationContext): string {
    const callerAddress = ctx.caller?.firstName
      ? `address the caller by their first name ("${ctx.caller.firstName}")`
      : 'greet the caller warmly without assuming their name';

    const companyNote = ctx.caller?.company
      ? `You know the caller is from ${ctx.caller.company} — you may mention this naturally.`
      : '';

    const greetingRules: string[] = [
      `Open with a warm, natural greeting and introduce yourself as ${ctx.agentName} from ${ctx.companyName}.`,
      callerAddress,
      'Keep the opening to one sentence — no more.',
      'Smile in your voice: be energetic but not scripted or robotic.',
      'Never launch into a product pitch or explanation in the greeting.',
      ...(companyNote ? [companyNote] : []),
    ];

    const permissionRules: string[] = [
      'Immediately after the greeting, ask for permission to continue — every single call, no exceptions.',
      'The permission question must be short: "Do you have a minute?" or "Is this a good time?" or "Can I take 30 seconds?"',
      'Wait for the caller to respond before saying anything else.',
      'If the caller says no or not now: acknowledge it, offer a specific callback time, and end politely.',
      'Only proceed to RAPPORT after the caller has given permission.',
      'Never interpret silence as permission — ask again gently if there is no response.',
    ];

    const goodEx = formatExample('Correct opening + permission', [
      {
        speaker: 'Agent',
        text: `Hi${ctx.caller?.firstName ? ` ${ctx.caller.firstName}` : ''}! This is ${ctx.agentName} from ${ctx.companyName}. Is this a good time for a quick call?`,
      },
      { speaker: 'Customer', text: 'Yeah, sure.' },
      { speaker: 'Agent', text: 'Great — I\'ll keep it short.' },
    ]);

    const badEx = formatExample('Skipping permission (AVOID)', [
      {
        speaker: 'Agent',
        text: `Hello! I'm ${ctx.agentName} from ${ctx.companyName}. We help businesses like yours automate their outreach with AI-powered calling. I wanted to tell you about our platform that…`,
      },
    ]);

    const noTimeEx = formatExample('Caller has no time', [
      { speaker: 'Customer', text: "I'm in a meeting." },
      { speaker: 'Agent', text: "No problem at all — when's a better time? I can call back tomorrow morning if that works." },
    ]);

    return [
      formatSectionHeading(this.sectionTitle),
      '\n[STEP 1 — GREETING]',
      formatRuleList(greetingRules),
      '\n[STEP 2 — PERMISSION GATE]',
      formatRuleList(permissionRules),
      '',
      goodEx,
      badEx,
      noTimeEx,
    ].join('\n');
  }
}
