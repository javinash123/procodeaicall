/**
 * @module ConversationRuntime
 *
 * The central interface for managing one live phone-call conversation.
 *
 * ## Purpose
 * `ConversationRuntime` is the "operating system" for a single call.
 * It exposes only lifecycle verbs; all AI, telephony, and audio concerns
 * are hidden behind provider interfaces injected through `RuntimeContext`.
 *
 * ## Ownership
 * One `ConversationRuntime` is created per inbound or outbound call.
 * The call coordinator that creates the runtime is responsible for calling
 * `destroy()` when the call ends, regardless of success or failure.
 *
 * ## Thread Safety
 * Lifecycle methods are async and must be awaited sequentially by the owner.
 * Concurrent calls to lifecycle methods on the same instance produce
 * undefined behaviour. The runtime does not acquire locks internally.
 *
 * ## Lifecycle
 * ```
 * createConversationRuntime()
 *   └─► initialize()   — verify providers, hydrate session
 *         └─► connect()     — establish transport
 *               └─► startListening()  ─┐
 *                     └─► startThinking()   │  (repeats per turn)
 *                           └─► startSpeaking()  ─┘
 *
 * Any point ──► interrupt()    — barge-in, returns to LISTENING
 * Any point ──► complete()     — graceful end
 * Any point ──► close()        — release resources after COMPLETED
 * Any point ──► destroy()      — forced teardown (also after FAILED)
 * ```
 */

import type { RuntimeState } from './RuntimeState.js';
import type { RuntimeContext } from './RuntimeContext.js';
import type { VoiceSession } from '../session/index.js';

/**
 * The public contract for a single conversation runtime instance.
 *
 * All methods are async. Callers must `await` each call before invoking
 * the next lifecycle step.
 */
export interface ConversationRuntime {
  /**
   * Verifies all provider dependencies, hydrates the session with the
   * campaign snapshot, and transitions the runtime from CREATED → INITIALIZING.
   *
   * @throws {ConfigurationError} if required providers are unavailable.
   * @throws {ProviderError} if a provider health-check fails.
   */
  initialize(): Promise<void>;

  /**
   * Establishes the telephony transport and transitions INITIALIZING → CONNECTED.
   * After this call returns, audio may begin flowing.
   *
   * @throws {TransportError} if the transport cannot be established.
   */
  connect(): Promise<void>;

  /**
   * Begins capturing and transcribing caller audio.
   * Transitions CONNECTED | SPEAKING | INTERRUPTED | WAITING → LISTENING.
   *
   * Safe to call at the start of each conversational turn.
   *
   * @throws {VoiceEngineError} if called from an illegal state.
   */
  startListening(): Promise<void>;

  /**
   * Signals that a complete caller utterance has been received and the LLM
   * request is now in-flight.
   * Transitions LISTENING → THINKING.
   *
   * @param transcript - The final STT transcript that triggered this turn.
   * @throws {VoiceEngineError} if called from an illegal state.
   */
  startThinking(transcript: string): Promise<void>;

  /**
   * Begins streaming TTS audio to the caller.
   * Transitions THINKING → SPEAKING.
   *
   * @param responseText - The LLM-generated text to be synthesised.
   * @throws {VoiceEngineError} if called from an illegal state.
   */
  startSpeaking(responseText: string): Promise<void>;

  /**
   * Handles a barge-in event: cancels the current TTS stream and transitions
   * SPEAKING → INTERRUPTED, then immediately back to LISTENING.
   *
   * This is the only method that triggers two state transitions atomically.
   *
   * @throws {VoiceEngineError} if called from an illegal state.
   */
  interrupt(): Promise<void>;

  /**
   * Gracefully ends the conversation and transitions any active state →
   * COMPLETED. Flushes pending metrics and persists the final session state.
   *
   * @param reason - Human-readable completion reason (e.g. "goal_reached").
   */
  complete(reason: string): Promise<void>;

  /**
   * Releases all resources held by the runtime and transitions COMPLETED |
   * FAILED → CLOSED. Must be the final call made on any runtime instance.
   *
   * Idempotent — safe to call multiple times; subsequent calls are no-ops.
   */
  close(): Promise<void>;

  /**
   * Forcibly tears down the runtime from any state, including FAILED.
   * Equivalent to `close()` but does not wait for graceful flushing.
   *
   * Use when an unrecoverable error has occurred and `close()` cannot be
   * awaited safely.
   */
  destroy(): void;

  /**
   * Returns the current state of the runtime.
   * Safe to call from any context at any time.
   */
  getState(): RuntimeState;

  /**
   * Returns the live session associated with this runtime.
   * The returned object reflects the most recent serializable + transient state.
   * Callers must not mutate the returned value.
   */
  getSession(): Readonly<VoiceSession>;

  /**
   * Returns the immutable context this runtime was initialised with.
   */
  getContext(): Readonly<RuntimeContext>;
}
