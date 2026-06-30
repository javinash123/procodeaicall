/**
 * @module engine
 *
 * Public barrel export for the Voice Engine Runtime Assembly.
 *
 * ## Usage
 * ```typescript
 * import {
 *   createVoiceEngine,
 *   VoiceEngineFactory,
 *   VoiceEngineBuilder,
 * } from '../voice-engine/engine/index.js';
 * ```
 *
 * ## Architecture
 * The engine module is the TOP-LEVEL assembly of Voice Engine V2.
 *
 * It wires together:
 * - Bootstrap (config + DI container + HealthRegistry)
 * - Transport Gateway (WebSocket connection management)
 * - Media Session Factory (per-call session construction)
 * - Provider Resolver (AI provider instances)
 *
 * ## Rules
 * - No OpenAI SDK imports.
 * - No Exotel protocol imports.
 * - No Audio Engine internals.
 * - No `process.env`.
 * - No global singletons.
 * - No business logic.
 *
 * ## Do NOT import sub-files directly.
 * Always import through this barrel.
 */

// ─── Events ────────────────────────────────────────────────────────────────────

export type {
  EngineInitializingEvent,
  EngineReadyEvent,
  EngineStartedEvent,
  EngineStoppedEvent,
  EngineDestroyedEvent,
  EngineFailedEvent,
  VoiceEngineEvent,
  VoiceEngineEventMap,
  VoiceEngineEventType,
  VoiceEngineEventHandler,
  IVoiceEngineEventBus,
} from './VoiceEngineEvents.js';
export { VoiceEngineEventBus } from './VoiceEngineEvents.js';

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

export type { VoiceEngineLifecycleState } from './VoiceEngineLifecycle.js';
export {
  VoiceEngineLifecycle,
  LifecycleTransitionError,
  ACTIVE_STATES,
  TERMINAL_STATES,
  VALID_ENGINE_TRANSITIONS,
} from './VoiceEngineLifecycle.js';

// ─── Health ────────────────────────────────────────────────────────────────────

export type {
  TransportHealth,
  MediaHealth,
  EngineHealthReport,
  TransportHealthProvider,
  MediaHealthProvider,
  EngineStateProvider,
  VoiceEngineHealthConfig,
  IVoiceEngineHealth,
} from './VoiceEngineHealth.js';
export { VoiceEngineHealth } from './VoiceEngineHealth.js';

// ─── Engine ────────────────────────────────────────────────────────────────────

export type {
  IVoiceEngine,
  VoiceEngineDependencies,
} from './VoiceEngine.js';
export { VoiceEngine } from './VoiceEngine.js';

// ─── Builder ───────────────────────────────────────────────────────────────────

export type {
  VoiceEngineBuilderOptions,
  IVoiceEngineBuilder,
} from './VoiceEngineBuilder.js';
export { VoiceEngineBuilder } from './VoiceEngineBuilder.js';

// ─── Factory ───────────────────────────────────────────────────────────────────

export type {
  VoiceEngineFactoryOptions,
  IVoiceEngineFactory,
} from './VoiceEngineFactory.js';
export { VoiceEngineFactory, createVoiceEngine } from './VoiceEngineFactory.js';
