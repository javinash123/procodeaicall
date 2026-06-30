/**
 * @module runtime
 *
 * Public barrel export for the Conversation Runtime Core.
 *
 * ## Usage
 * Import everything through this module. Never import directly from sub-files.
 *
 * ```typescript
 * import {
 *   RuntimeState,
 *   createConversationRuntime,
 * } from '../voice-engine/runtime/index.js';
 * ```
 */

export {
  RuntimeState,
  TERMINAL_STATES,
  VALID_TRANSITIONS,
} from './RuntimeState.js';

export type {
  RuntimeCreatedEvent,
  RuntimeConnectedEvent,
  RuntimeListeningEvent,
  RuntimeThinkingEvent,
  RuntimeSpeakingEvent,
  RuntimeInterruptedEvent,
  RuntimeCompletedEvent,
  RuntimeClosedEvent,
  RuntimeErrorEvent,
  RuntimeEvent,
  RuntimeEventMap,
  RuntimeEventType,
  RuntimeEventHandler,
} from './RuntimeEvents.js';

export type {
  TimerHandle,
  SilenceTimer,
  SpeechTimeoutTimer,
  ThinkingTimeoutTimer,
  SessionTimeoutTimer,
  HeartbeatTimer,
  RuntimeTimers,
} from './RuntimeTimers.js';

export type {
  IClock,
  KnowledgeSnapshot,
  KnowledgeDocument,
  RuntimeContext,
} from './RuntimeContext.js';

export type { ConversationRuntime } from './ConversationRuntime.js';

export type {
  RuntimeCreationOptions,
  IRuntimeFactory,
} from './RuntimeFactory.js';

export { createConversationRuntime } from './RuntimeFactory.js';
