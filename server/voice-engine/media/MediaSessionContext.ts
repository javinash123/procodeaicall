/**
 * @module MediaSessionContext
 *
 * The immutable dependency bag for a single `MediaSession`.
 *
 * ## Purpose
 * `MediaSessionContext` is the single source of all shared, cross-cutting
 * dependencies for one live phone call at the media coordination layer.
 * Every dependency required to coordinate the session is declared here.
 * No component within the media layer may reach outside this context for
 * its dependencies.
 *
 * ## Immutability
 * The context object is frozen after construction via
 * `Object.freeze`. Individual fields that are objects are themselves
 * expected to be frozen by their owners. No field may be replaced at
 * runtime.
 *
 * ## Lifecycle
 * The context outlives no `MediaSession`. Once `destroy()` is called,
 * the context reference must not be used again.
 *
 * ## Thread Safety
 * `MediaSessionContext` is read-only after creation. All fields are either
 * value types or interfaces whose implementations must be individually
 * thread-safe.
 */

import type { ConversationRuntime } from '../runtime/ConversationRuntime.js';
import type { IClock } from '../runtime/RuntimeContext.js';
import type { IAudioEngine } from '../audio-engine/AudioEngine.js';
import type { IConversationOrchestrator } from '../orchestrator/ConversationOrchestrator.js';
import type { IRealtimeProviderSession } from '../orchestrator/ConversationOrchestrator.js';
import type { VoiceEngineConfig } from '../config/index.js';
import type { ILogger } from '../logger/index.js';
import type { IMetricsCollector } from '../metrics/index.js';
import type { SessionId, CallSid } from '../types/index.js';

/**
 * The complete, immutable dependency context for one `MediaSession` instance.
 *
 * All fields are readonly. The object is sealed by `createMediaSessionContext`
 * with `Object.freeze` before being handed to the session.
 */
export interface MediaSessionContext {
  /**
   * The low-level conversation runtime that drives the call state machine.
   * Owned by the `MediaSession`; must be destroyed when the session ends.
   */
  readonly runtime: ConversationRuntime;

  /**
   * The audio processing engine for this call.
   * Coordinates inbound and outbound audio pipelines.
   */
  readonly audioEngine: IAudioEngine;

  /**
   * The conversation orchestrator that manages turn scheduling,
   * barge-in detection, and routing between runtime and provider session.
   */
  readonly orchestrator: IConversationOrchestrator;

  /**
   * The real-time AI provider session (e.g. OpenAI Realtime).
   * The media layer holds a reference to coordinate audio delivery
   * and interruption signalling. The orchestrator owns the session lifecycle.
   */
  readonly providerSession: IRealtimeProviderSession;

  /**
   * Frozen copy of the voice engine configuration active when the session
   * was created. Configuration does not change mid-call.
   */
  readonly config: Readonly<VoiceEngineConfig>;

  /**
   * Structured logger scoped to this specific media session.
   * Must be pre-bound with `sessionId` and `callSid` fields.
   */
  readonly logger: ILogger;

  /**
   * Metrics collector for emitting per-session and per-turn measurements.
   */
  readonly metrics: IMetricsCollector;

  /**
   * Monotonic clock used for timing calculations throughout the session.
   * Must never be replaced after context construction.
   */
  readonly clock: IClock;

  /**
   * Unique identifier for this session.
   * Convenience accessor — must match the session identifier carried by
   * the runtime context.
   */
  readonly sessionId: SessionId;

  /**
   * The telephony call identifier bound to this session.
   * Convenience accessor — must match the call identifier carried by
   * the runtime context.
   */
  readonly callSid: CallSid;

  /**
   * Campaign identifier associated with this session.
   * Used for event annotation and metrics labelling.
   */
  readonly campaignId: string;
}

/**
 * Constructs and freezes a `MediaSessionContext`.
 *
 * The returned object is deeply frozen at the top level. Callers are
 * responsible for ensuring that injected object fields are themselves
 * immutable (frozen or readonly-by-contract).
 *
 * @param fields - All required context fields.
 * @returns A frozen `MediaSessionContext`.
 */
export function createMediaSessionContext(
  fields: MediaSessionContext
): Readonly<MediaSessionContext> {
  return Object.freeze({ ...fields });
}
