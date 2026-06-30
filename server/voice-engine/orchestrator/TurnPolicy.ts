/**
 * @module TurnPolicy
 *
 * Configuration that governs how a `ConversationOrchestrator` manages the
 * timing and retry behaviour of each conversational turn.
 *
 * ## Purpose
 * Centralises all time-bound constraints into one validated object.
 * No business logic lives here — only values and their validation rules.
 *
 * ## Ownership
 * Created once per orchestrator instance by `OrchestratorFactory`.
 * Immutable after construction; shared across all turns in the conversation.
 */

import { z } from 'zod';

const TurnRetryPolicySchema = z.object({
  /**
   * Maximum number of times the orchestrator will retry a failed turn
   * before escalating to a FAILED conversation state.
   */
  maxRetryAttempts: z.number().int().nonnegative().default(2),

  /**
   * Milliseconds to wait before retrying a failed turn.
   */
  retryDelayMs: z.number().int().nonnegative().default(500),
});

export const TurnPolicySchema = z.object({
  /**
   * Maximum number of consecutive barge-ins allowed within a single turn
   * before the orchestrator treats the interruption as a hard stop.
   */
  maxInterruptDepth: z.number().int().min(0).max(10).default(3),

  /**
   * Milliseconds of caller silence after which the orchestrator transitions
   * from LISTENING to WAITING and may re-engage the caller.
   */
  maxSilenceMs: z.number().int().positive().default(5_000),

  /**
   * Maximum milliseconds allowed for the LLM to produce a complete response
   * from the moment the user utterance is committed.
   */
  responseTimeoutMs: z.number().int().positive().default(15_000),

  /**
   * Maximum wall-clock duration for a single conversational turn
   * (CREATED → terminal state). If exceeded, the turn is failed.
   */
  turnTimeoutMs: z.number().int().positive().default(30_000),

  /**
   * Maximum number of turns in one conversation before the orchestrator
   * gracefully completes the session.
   */
  maxTurns: z.number().int().positive().default(50),

  /**
   * Retry policy applied when an individual turn fails due to a transient
   * provider error.
   */
  retry: TurnRetryPolicySchema.default({}),
});

export type TurnPolicy = z.infer<typeof TurnPolicySchema>;
export type TurnRetryPolicy = z.infer<typeof TurnRetryPolicySchema>;

/**
 * Parses and validates a partial policy object, applying defaults for
 * every field that is not explicitly provided.
 *
 * @throws {Error} if any provided value fails validation.
 */
export function buildTurnPolicy(partial: Partial<TurnPolicy> = {}): TurnPolicy {
  const result = TurnPolicySchema.safeParse(partial);
  if (!result.success) {
    throw new Error(
      `TurnPolicy validation failed: ${result.error.issues.map((i) => i.message).join(', ')}`
    );
  }
  return Object.freeze(result.data) as TurnPolicy;
}
