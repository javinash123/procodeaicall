/**
 * @module RuntimeFactory
 *
 * Dependency injection factory for constructing `ConversationRuntime` instances.
 *
 * ## Purpose
 * Centralises all wiring of runtime dependencies. No caller outside this
 * module needs to know which concrete types implement the runtime interfaces.
 *
 * ## Ownership
 * The factory is a singleton owned by the application bootstrap layer.
 * It does not hold any per-call state — it is safe to reuse across calls.
 *
 * ## Thread Safety
 * `createConversationRuntime()` is stateless and reentrant. Concurrent calls
 * each produce an independent runtime instance with no shared mutable state.
 *
 * ## Lifecycle
 * The factory itself has no lifecycle. Individual runtimes it produces are
 * independently managed by their owners.
 */

import type { ConversationRuntime } from './ConversationRuntime.js';
import type { RuntimeContext } from './RuntimeContext.js';
import type { RuntimeTimers } from './RuntimeTimers.js';
import type { RuntimeEventHandler, RuntimeEvent } from './RuntimeEvents.js';

/**
 * Configuration supplied to the factory when constructing a new runtime.
 * All fields are required; the factory performs no defaulting.
 */
export interface RuntimeCreationOptions {
  /**
   * The fully assembled dependency context for this conversation.
   * Must be frozen before being passed to the factory.
   */
  readonly context: RuntimeContext;

  /**
   * Pre-configured timer handles for this runtime instance.
   * The factory does not create timers; the caller provides them
   * so scheduling infrastructure remains outside the runtime.
   */
  readonly timers: RuntimeTimers;

  /**
   * Optional subscriber to all runtime lifecycle events.
   * If provided, it will be registered before the runtime is returned
   * so no events are lost.
   */
  readonly onEvent?: RuntimeEventHandler<RuntimeEvent>;
}

/**
 * The factory interface for producing `ConversationRuntime` instances.
 *
 * Implementations must be stateless — all per-call state lives inside
 * the runtime instance, not the factory.
 */
export interface IRuntimeFactory {
  /**
   * Constructs and returns a new `ConversationRuntime` in the CREATED state.
   *
   * The returned runtime has not yet been initialised. The caller must invoke
   * `initialize()` followed by `connect()` before audio processing can begin.
   *
   * @param options - Wired dependencies for this conversation.
   * @returns A new runtime instance in the CREATED state.
   * @throws {ConfigurationError} if required fields in `options.context` are missing.
   */
  createConversationRuntime(options: RuntimeCreationOptions): ConversationRuntime;
}

/**
 * Creates and returns a new `ConversationRuntime` using the provided options.
 *
 * This is the single public entry point for runtime construction. It delegates
 * to the registered `IRuntimeFactory` implementation.
 *
 * @param factory - The factory implementation to delegate to.
 * @param options - Runtime creation options including context and timers.
 * @returns A new `ConversationRuntime` in the CREATED state.
 *
 * @example
 * ```typescript
 * const runtime = createConversationRuntime(factory, {
 *   context,
 *   timers,
 *   onEvent: (event) => logger.info('runtime event', { type: event.type }),
 * });
 * await runtime.initialize();
 * await runtime.connect();
 * await runtime.startListening();
 * ```
 */
export function createConversationRuntime(
  factory: IRuntimeFactory,
  options: RuntimeCreationOptions
): ConversationRuntime {
  return factory.createConversationRuntime(options);
}
