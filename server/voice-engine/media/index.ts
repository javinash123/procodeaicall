/**
 * @module media
 *
 * Public barrel export for the Media Session layer of Voice Engine V2.
 *
 * ## Usage
 * Import everything through this module. Never import directly from sub-files.
 *
 * ```typescript
 * import {
 *   MediaSessionState,
 *   MediaSessionFactory,
 *   createMediaSession,
 * } from '../voice-engine/media/index.js';
 * ```
 *
 * ## Architecture
 * The Media Session layer coordinates ONE live phone call. It owns:
 *
 * - `ConversationRuntime`      — low-level call state machine
 * - `ConversationOrchestrator` — turn scheduling and barge-in
 * - `IAudioEngine`             — inbound / outbound audio pipelines
 * - `IRealtimeProviderSession` — abstract AI provider session
 *
 * It contains NO transport logic, NO Exotel logic, NO OpenAI logic,
 * and NO business logic.
 */

// ─── State Machine ─────────────────────────────────────────────────────────────

export {
  MediaSessionState,
  MEDIA_TERMINAL_STATES,
  MEDIA_VALID_TRANSITIONS,
} from './MediaSessionState.js';

// ─── Events ────────────────────────────────────────────────────────────────────

export type {
  MediaCreatedEvent,
  MediaReadyEvent,
  MediaStartedEvent,
  MediaPausedEvent,
  MediaInterruptedEvent,
  MediaCompletedEvent,
  MediaDestroyedEvent,
  MediaErrorEvent,
  MediaEvent,
  MediaEventMap,
  MediaEventType,
  MediaEventHandler,
} from './MediaSessionEvents.js';

// ─── Context ───────────────────────────────────────────────────────────────────

export type { MediaSessionContext } from './MediaSessionContext.js';
export { createMediaSessionContext } from './MediaSessionContext.js';

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

export { MediaLifecycle } from './MediaLifecycle.js';
export type { LifecycleDecision } from './MediaLifecycle.js';

// ─── Coordinator ───────────────────────────────────────────────────────────────

export type {
  IMediaCoordinator,
  StateTransitionCallback,
  ErrorCallback,
} from './MediaCoordinator.js';
export { MediaCoordinator } from './MediaCoordinator.js';

// ─── Session ───────────────────────────────────────────────────────────────────

export type { IMediaSession } from './MediaSession.js';
export { MediaSession } from './MediaSession.js';

// ─── Factory ───────────────────────────────────────────────────────────────────

export type {
  MediaSessionDependencies,
  IMediaSessionFactory,
} from './MediaSessionFactory.js';
export { MediaSessionFactory, createMediaSession } from './MediaSessionFactory.js';
