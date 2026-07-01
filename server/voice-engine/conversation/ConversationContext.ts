/**
 * @module ConversationContext
 *
 * Immutable input context describing the campaign and call session that the
 * policy engine uses to personalise its generated system instructions.
 *
 * ## Purpose
 * Carries every piece of runtime data the policy builder needs to render
 * context-aware instructions — agent name, campaign goal, product details,
 * and optional caller metadata.  No mutable state lives here.
 *
 * ## Ownership
 * Constructed by the session layer before a call begins and passed into
 * `ConversationPolicyBuilder.build()`.  Not shared with the orchestrator's
 * own `ConversationContext` (a separate module in the orchestrator package).
 */

/**
 * Known conversation stages used by the sales funnel policy.
 */
export type ConversationStage =
  | 'greeting'
  | 'rapport'
  | 'discovery'
  | 'qualification'
  | 'presentation'
  | 'objection-handling'
  | 'closing';

/**
 * Optional caller metadata that the policy can weave into instructions.
 */
export interface CallerMetadata {
  /** Caller's first name if available from the lead record. */
  readonly firstName?: string;
  /** Caller's company if available. */
  readonly company?: string;
  /** Any short note about the lead (e.g. "warm lead", "trial user"). */
  readonly note?: string;
}

/**
 * The full context object consumed by the Conversation Policy Engine.
 */
export interface PolicyConversationContext {
  /**
   * Human-readable name of the AI agent.
   * Used in the identity section so the agent knows its own name.
   * @example "Alex"
   */
  readonly agentName: string;

  /**
   * Name of the company or brand the agent represents.
   * @example "NIJVOX"
   */
  readonly companyName: string;

  /**
   * Short description of the product or service being sold/discussed.
   * @example "an AI-powered sales calling platform"
   */
  readonly productDescription: string;

  /**
   * High-level goal of the campaign, used to frame the conversation objective.
   * @example "schedule a demo with qualified prospects"
   */
  readonly campaignGoal: string;

  /**
   * Optional pre-written call script or talking points to incorporate.
   * If provided the policy will blend it naturally into the instructions.
   */
  readonly existingScript?: string;

  /**
   * Optional caller metadata used to personalise the greeting and rapport.
   */
  readonly caller?: CallerMetadata;

  /**
   * Stage to begin from when the session opens.
   * Defaults to 'greeting' if not provided.
   */
  readonly initialStage?: ConversationStage;
}
