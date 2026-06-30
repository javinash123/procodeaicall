/**
 * @module OrchestratorFactory
 *
 * Dependency-injected factory for constructing `ConversationOrchestrator` instances.
 *
 * ## Purpose
 * The single authorised entry point for creating an orchestrator. Wires all
 * dependencies together — runtime, session, context, policy — without
 * containing any provider-specific or transport-specific logic.
 *
 * ## Ownership
 * Called by the call-coordinator (telephony webhook handler) once per inbound
 * or outbound call, after the session has been hydrated and a provider session
 * has been opened.
 *
 * ## Thread Safety
 * `createConversationOrchestrator()` is stateless and reentrant. Concurrent
 * calls each produce an independent orchestrator with no shared mutable state.
 */

import { ConversationOrchestrator } from './ConversationOrchestrator.js';
import type { IConversationOrchestrator, IRealtimeProviderSession } from './ConversationOrchestrator.js';
import { ConversationContext } from './ConversationContext.js';
import { buildTurnPolicy } from './TurnPolicy.js';
import type { TurnPolicy } from './TurnPolicy.js';
import type { ConversationRuntime } from '../runtime/ConversationRuntime.js';
import type { IProviderResolver } from '../bootstrap/ProviderResolver.js';
import type { IClock } from '../runtime/RuntimeContext.js';
import type { KnowledgeSnapshot } from '../runtime/RuntimeContext.js';
import type { CampaignSnapshot } from '../session/index.js';
import type { SessionId, CampaignId, Timestamp } from '../types/index.js';
import type { ILogger } from '../logger/index.js';
import type { IMetricsCollector } from '../metrics/index.js';
import { ConfigurationError } from '../errors/index.js';

/**
 * All dependencies required to construct one `ConversationOrchestrator`.
 */
export interface OrchestratorCreationOptions {
  /**
   * The live conversation runtime managing the call's state machine.
   * Must be in the CREATED state when passed to the factory.
   */
  readonly runtime: ConversationRuntime;

  /**
   * The abstract realtime provider session.
   * Implemented by provider-specific sessions (e.g. OpenAI Realtime).
   * Must not be connected yet; the orchestrator calls `connect()`.
   */
  readonly session: IRealtimeProviderSession;

  /**
   * Role-based provider resolver from the DI container.
   */
  readonly resolver: IProviderResolver;

  /**
   * Monotonic clock shared with the runtime.
   */
  readonly clock: IClock;

  /**
   * Unique session identifier for this conversation.
   */
  readonly sessionId: SessionId;

  /**
   * Campaign identifier for this conversation.
   */
  readonly campaignId: CampaignId;

  /**
   * Frozen campaign configuration snapshot.
   */
  readonly campaign: Readonly<CampaignSnapshot>;

  /**
   * Frozen knowledge base snapshot for this campaign.
   */
  readonly knowledge: Readonly<KnowledgeSnapshot>;

  /**
   * Compiled system instructions to send to the LLM provider at session start.
   */
  readonly initialInstructions: string;

  /**
   * Timestamp at which the conversation was initiated.
   */
  readonly startedAt: Timestamp;

  /**
   * Optional turn policy overrides. Missing fields fall back to defaults.
   */
  readonly policyOverrides?: Partial<TurnPolicy>;

  /**
   * Logger scoped to the call (should already contain sessionId / callSid bindings).
   */
  readonly logger: ILogger;

  /**
   * Metrics collector for emitting per-turn and per-conversation measurements.
   */
  readonly metrics: IMetricsCollector;
}

/**
 * Constructs and returns a new `ConversationOrchestrator` in the IDLE state.
 *
 * The returned orchestrator has not yet started. The caller must invoke
 * `start()` to begin the conversation.
 *
 * @param options - Wired dependencies for this conversation.
 * @returns A new orchestrator in the IDLE state.
 * @throws {ConfigurationError} if any required field in `options` is missing.
 *
 * @example
 * ```typescript
 * const orchestrator = createConversationOrchestrator({
 *   runtime,
 *   session: openAISession,     // implements IRealtimeProviderSession
 *   resolver,
 *   clock,
 *   sessionId,
 *   campaignId,
 *   campaign,
 *   knowledge,
 *   initialInstructions,
 *   startedAt: Date.now(),
 *   logger,
 *   metrics,
 * });
 *
 * await orchestrator.start();
 * ```
 */
export function createConversationOrchestrator(
  options: OrchestratorCreationOptions
): IConversationOrchestrator {
  if (!options.runtime) throw new ConfigurationError('OrchestratorFactory: runtime is required');
  if (!options.session) throw new ConfigurationError('OrchestratorFactory: session is required');
  if (!options.resolver) throw new ConfigurationError('OrchestratorFactory: resolver is required');
  if (!options.clock)   throw new ConfigurationError('OrchestratorFactory: clock is required');
  if (!options.sessionId) throw new ConfigurationError('OrchestratorFactory: sessionId is required');
  if (!options.campaignId) throw new ConfigurationError('OrchestratorFactory: campaignId is required');
  if (!options.logger)  throw new ConfigurationError('OrchestratorFactory: logger is required');
  if (!options.metrics) throw new ConfigurationError('OrchestratorFactory: metrics is required');

  const policy = buildTurnPolicy(options.policyOverrides ?? {});

  const context = new ConversationContext(
    options.sessionId,
    options.campaignId,
    options.campaign,
    options.knowledge,
    options.initialInstructions,
    options.startedAt
  );

  return new ConversationOrchestrator({
    runtime:  options.runtime,
    session:  options.session,
    resolver: options.resolver,
    context,
    policy,
    logger:   options.logger,
    metrics:  options.metrics,
    clock:    options.clock,
  });
}
