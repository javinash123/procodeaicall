/**
 * @module ConversationPolicy
 *
 * Core interface that every concrete policy must implement.
 *
 * ## Purpose
 * Defines the contract between the `ConversationPolicyBuilder` and any
 * concrete policy variant (e.g. `SalesConversationPolicy`).  The builder
 * calls `getSections()` to collect all weighted sections, then renders
 * them in priority order into a single system instruction string.
 *
 * ## Ownership
 * Implemented by concrete policy classes such as `SalesConversationPolicy`.
 * The builder consumes only this interface — it has no knowledge of the
 * concrete type.
 */

import type { WeightedPolicySection } from './ConversationRules.js';
import type { PolicyConversationContext } from './ConversationContext.js';

/**
 * The contract every conversation policy must satisfy.
 */
export interface ConversationPolicy {
  /**
   * Human-readable name for this policy variant.
   * Used in debug logging and the generated instruction header.
   * @example "SalesConversationPolicy"
   */
  readonly policyName: string;

  /**
   * Returns all weighted sections that make up this policy.
   * The builder sorts by priority and renders them in order.
   */
  getSections(context: PolicyConversationContext): readonly WeightedPolicySection[];
}
