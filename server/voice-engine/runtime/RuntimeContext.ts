/**
 * @module RuntimeContext
 *
 * The immutable dependency bag passed to every component that participates
 * in a single live conversation.
 *
 * ## Ownership
 * Created once by `RuntimeFactory.createConversationRuntime()` and passed
 * by reference to the runtime. The context object itself is frozen after
 * construction; nothing may add or replace its fields at runtime.
 *
 * ## Thread Safety
 * `RuntimeContext` is read-only after creation. All fields are either
 * value types or interfaces whose implementations must be individually
 * thread-safe.
 *
 * ## Lifecycle
 * The context outlives no runtime. When `destroy()` is called on the
 * runtime, the context reference is released and must not be used again.
 */

import type { VoiceEngineConfig } from '../config/index.js';
import type { ILogger } from '../logger/index.js';
import type { IMetricsCollector } from '../metrics/index.js';
import type { ProviderRegistry } from '../providers/index.js';
import type { VoiceSession, CampaignSnapshot } from '../session/index.js';
import type { Timestamp, SessionId, CallSid } from '../types/index.js';

/**
 * A monotonic clock interface that abstracts wall-clock access.
 * Implementations may be replaced in test environments with a controlled clock.
 */
export interface IClock {
  /**
   * Returns the current time as a millisecond Unix timestamp.
   * Must be monotonically non-decreasing within a single runtime instance.
   */
  now(): Timestamp;
}

/**
 * A point-in-time snapshot of the AI knowledge base associated with the
 * campaign. Frozen at session creation; never mutated during a live call.
 */
export interface KnowledgeSnapshot {
  /** Unique identifier for this knowledge snapshot version. */
  readonly snapshotId: string;
  /** The campaign this knowledge belongs to. */
  readonly campaignId: string;
  /** Ordered list of knowledge document excerpts available to the LLM. */
  readonly documents: readonly KnowledgeDocument[];
  /** UTC timestamp when this snapshot was captured. */
  readonly capturedAt: Timestamp;
}

/**
 * A single document or excerpt within the knowledge base snapshot.
 */
export interface KnowledgeDocument {
  /** Unique document identifier. */
  readonly documentId: string;
  /** Human-readable document title. */
  readonly title: string;
  /** Plain-text content made available to the LLM system prompt. */
  readonly content: string;
  /** MIME type of the original source document. */
  readonly mimeType: string;
}

/**
 * The complete, immutable dependency context for one `ConversationRuntime`
 * instance.
 *
 * Every dependency required to run a live conversation is declared here.
 * No runtime component may reach outside this context for its dependencies.
 */
export interface RuntimeContext {
  /**
   * The live session state object for this conversation.
   * The runtime reads session state through this reference; it does not
   * own the session persistence layer.
   */
  readonly session: VoiceSession;

  /**
   * A frozen copy of the voice engine configuration active when the
   * runtime was created. Configuration does not change mid-call.
   */
  readonly config: Readonly<VoiceEngineConfig>;

  /**
   * Structured logger scoped to this specific runtime instance.
   * Always contains `sessionId` and `callSid` as bound fields.
   */
  readonly logger: ILogger;

  /**
   * Metrics collector for emitting per-turn and per-call measurements.
   */
  readonly metrics: IMetricsCollector;

  /**
   * Provider factory registry from which telephony, STT, LLM, and TTS
   * provider instances are resolved.
   */
  readonly providers: ProviderRegistry;

  /**
   * Frozen snapshot of the AI knowledge base associated with this campaign.
   * Captured once at session start; never refreshed mid-call.
   */
  readonly knowledge: KnowledgeSnapshot;

  /**
   * Frozen snapshot of the campaign configuration (script, voice, calling
   * hours) as it existed when the call was initiated.
   */
  readonly campaign: CampaignSnapshot;

  /**
   * Monotonic clock used by the runtime and timers.
   * Must never be replaced after context construction.
   */
  readonly clock: IClock;

  /**
   * Convenience accessor — identical to `session.serializable.sessionId`.
   */
  readonly sessionId: SessionId;

  /**
   * Convenience accessor — identical to `session.serializable.callSid`.
   */
  readonly callSid: CallSid;
}
