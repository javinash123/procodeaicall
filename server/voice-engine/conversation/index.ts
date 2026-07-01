/**
 * @module conversation
 *
 * Public API for the NIJVOX Conversation Policy Engine.
 *
 * ## Quick Start
 *
 * ```ts
 * import {
 *   ConversationPolicyBuilder,
 *   SalesConversationPolicy,
 * } from './conversation/index.js';
 * import type { PolicyConversationContext } from './conversation/index.js';
 *
 * const builder = new ConversationPolicyBuilder(new SalesConversationPolicy());
 *
 * const context: PolicyConversationContext = {
 *   agentName: 'Alex',
 *   companyName: 'NIJVOX',
 *   productDescription: 'an AI-powered sales calling platform',
 *   campaignGoal: 'schedule a 20-minute product demo',
 *   caller: { firstName: 'Sarah', company: 'Acme Corp' },
 * };
 *
 * const systemInstruction = builder.build(context);
 * // Pass systemInstruction to OpenAI Realtime session.update({ instructions })
 * ```
 */

// ─── Context ──────────────────────────────────────────────────────────────────
export type {
  PolicyConversationContext,
  CallerMetadata,
  ConversationStage,
} from './ConversationContext.js';

// ─── Rules & Utilities ────────────────────────────────────────────────────────
export type {
  PolicySection,
  WeightedPolicySection,
  RulePriority,
} from './ConversationRules.js';
export {
  PRIORITY_ORDER,
  formatSectionHeading,
  formatRuleList,
  formatExample,
} from './ConversationRules.js';

// ─── Policy Interface ─────────────────────────────────────────────────────────
export type { ConversationPolicy } from './ConversationPolicy.js';

// ─── Builder ──────────────────────────────────────────────────────────────────
export { ConversationPolicyBuilder } from './ConversationPolicyBuilder.js';

// ─── Concrete Policies ────────────────────────────────────────────────────────
export { SalesConversationPolicy } from './SalesConversationPolicy.js';

// ─── Individual Section Policies (for custom composition) ─────────────────────
export {
  IdentityPolicy,
  SpeakingStylePolicy,
  ActiveListeningPolicy,
  InterruptionPolicy,
} from './ResponsePolicy.js';
export { GreetingPolicy } from './GreetingPolicy.js';
export { QuestionStrategy } from './QuestionStrategy.js';
export { RecoveryPolicy } from './RecoveryPolicy.js';
export { ClosingPolicy } from './ClosingPolicy.js';
