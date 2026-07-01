/**
 * @module GreetingPolicy
 *
 * Defines how the agent opens the call — warm, natural, and personalised.
 *
 * ## Purpose
 * Generates the GREETING section of the system instruction.  Covers how to
 * introduce the agent, acknowledge the caller by name when available, and
 * transition smoothly into rapport-building without launching into a pitch.
 */

import type { PolicyConversationContext } from './ConversationContext.js';
import type { PolicySection } from './ConversationRules.js';
import { formatSectionHeading, formatRuleList, formatExample } from './ConversationRules.js';

export class GreetingPolicy implements PolicySection {
  readonly sectionTitle = 'GREETING';

  render(ctx: PolicyConversationContext): string {
    const callerAddress = ctx.caller?.firstName
      ? `address the caller by their first name ("${ctx.caller.firstName}")`
      : 'greet the caller warmly without assuming their name';

    const companyNote = ctx.caller?.company
      ? `You are aware the caller is from ${ctx.caller.company} — you may reference this naturally to build rapport.`
      : '';

    const rules: string[] = [
      `Open with a warm, natural greeting and introduce yourself as ${ctx.agentName} from ${ctx.companyName}.`,
      callerAddress,
      'Keep the opening under two sentences.',
      'Never launch into a product pitch in the greeting — build rapport first.',
      'Smile in your voice: be energetic but not scripted or robotic.',
      'End the greeting with a single open question to invite them to talk.',
    ];

    if (companyNote) rules.push(companyNote);

    const example = formatExample('Good opening', [
      { speaker: 'Agent', text: `Hi${ctx.caller?.firstName ? `, ${ctx.caller.firstName}` : ''}! This is ${ctx.agentName} calling from ${ctx.companyName}. How are you doing today?` },
    ]);

    const badExample = formatExample('Avoid this', [
      { speaker: 'Agent', text: `Hello, I am ${ctx.agentName}, an AI assistant from ${ctx.companyName}. I'm calling to tell you about our amazing product that can help your business in many ways…` },
    ]);

    return [
      formatSectionHeading(this.sectionTitle),
      formatRuleList(rules),
      '',
      example,
      badExample,
    ].join('\n');
  }
}
