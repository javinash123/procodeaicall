/**
 * @module ConversationRules
 *
 * Core types and interfaces that every policy section must implement.
 *
 * ## Purpose
 * Establishes the contract between individual policy sections
 * (GreetingPolicy, QuestionStrategy, etc.) and the ConversationPolicyBuilder.
 * Every section renders itself to a plain string block that the builder
 * stitches into the final system instruction.
 *
 * ## Design principle
 * No hardcoded prompt strings in business logic.  All text generation lives
 * inside the leaf policy classes; the builder only assembles them.
 */

import type { PolicyConversationContext } from './ConversationContext.js';

/**
 * A single named section of the system instruction document.
 */
export interface PolicySection {
  /**
   * Short label used as a heading in the generated instruction.
   * @example "SPEAKING STYLE"
   */
  readonly sectionTitle: string;

  /**
   * Renders this section to a formatted instruction string, optionally
   * incorporating context from the live session.
   */
  render(context: PolicyConversationContext): string;
}

/**
 * Priority weight assigned to a rule when the builder orders sections.
 * Lower numbers appear first in the generated instruction.
 */
export type RulePriority =
  | 'critical'   // 1 – Identity, fundamental constraints
  | 'high'       // 2 – Behaviour rules that directly affect conversation flow
  | 'medium'     // 3 – Style, tone, question strategy
  | 'low';       // 4 – Nice-to-haves, closing courtesies

/**
 * A weighted policy section — priority controls rendering order.
 */
export interface WeightedPolicySection {
  readonly priority: RulePriority;
  readonly section: PolicySection;
}

/**
 * Numeric value for each priority level, used for stable sort.
 */
export const PRIORITY_ORDER: Record<RulePriority, number> = {
  critical: 1,
  high:     2,
  medium:   3,
  low:      4,
};

/**
 * Formats a section title into a consistent heading block.
 */
export function formatSectionHeading(title: string): string {
  const bar = '─'.repeat(60);
  return `\n${bar}\n## ${title.toUpperCase()}\n${bar}`;
}

/**
 * Joins a list of bullet-point rules into a formatted block.
 */
export function formatRuleList(rules: readonly string[]): string {
  return rules.map((r) => `• ${r}`).join('\n');
}

/**
 * Wraps an example exchange in a labelled block.
 */
export function formatExample(
  label: string,
  lines: readonly { speaker: 'Customer' | 'Agent'; text: string }[]
): string {
  const body = lines
    .map((l) => `  ${l.speaker}: "${l.text}"`)
    .join('\n');
  return `[Example – ${label}]\n${body}`;
}
