/**
 * @module migration
 *
 * Voice Engine V2 Migration Layer — public API.
 *
 * ## Purpose
 * This module exposes the ONLY entry points needed by the rest of the
 * application to create, manage, and look up V2 call sessions during
 * the V1→V2 migration period.
 *
 * ## Quick-start
 * ```typescript
 * import {
 *   createV2SessionCoordinator,
 *   type IV2SessionCoordinator,
 *   type SessionContext,
 * } from './voice-engine/migration/index.js';
 *
 * import { VoiceEngineFactory } from './voice-engine/engine/VoiceEngineFactory.js';
 * import { TransportFactory }   from './voice-engine/transport/TransportFactory.js';
 *
 * // 1. Create once at process startup:
 * const coordinator: IV2SessionCoordinator = createV2SessionCoordinator({
 *   voiceEngineFactory: new VoiceEngineFactory(),
 *   transportFactory:   new TransportFactory(logger),
 *   logger,
 * });
 *
 * // 2. On every outbound call:
 * const session: SessionContext = await coordinator.createSession({
 *   campaignId: 'camp-abc',
 *   phone: '+917000000001',
 * });
 *
 * // 3. After Exotel returns the callSid:
 * coordinator.attachCallSid(session.sessionId, exotelCallSid);
 *
 * // 4. On call end:
 * coordinator.destroySession(session.sessionId);
 *
 * // 5. Periodic cleanup (e.g. in a setInterval):
 * coordinator.cleanupExpiredSessions();
 * ```
 *
 * ## What is NOT exported
 * - `SessionRegistry` implementation (use `ISessionRegistry` interface only).
 * - `SessionFactory` implementation (use `ISessionFactory` interface only).
 * - `V2SessionCoordinator` implementation (use `IV2SessionCoordinator` interface only).
 * - `MigrationFactory` implementation (use `createV2SessionCoordinator()` instead).
 *
 * ## Rules
 * - No OpenAI imports.
 * - No Exotel imports.
 * - No transport logic.
 * - No WebSocket logic.
 */

// ─── SessionContext ────────────────────────────────────────────────────────────

export type {
  SessionContext,
  SessionContextInput,
  SessionMetadata,
} from './SessionContext.js';

export { createSessionContext } from './SessionContext.js';

// ─── SessionRegistry ──────────────────────────────────────────────────────────

export type { ISessionRegistry } from './SessionRegistry.js';

export { SessionRegistry } from './SessionRegistry.js';

// ─── SessionFactory ───────────────────────────────────────────────────────────

export type {
  ISessionFactory,
  CreateSessionParams,
} from './SessionFactory.js';

export { SessionFactory } from './SessionFactory.js';

// ─── V2SessionCoordinator ─────────────────────────────────────────────────────

export type {
  IV2SessionCoordinator,
  V2SessionCoordinatorOptions,
  SessionLookup,
} from './V2SessionCoordinator.js';

export { V2SessionCoordinator } from './V2SessionCoordinator.js';

// ─── MigrationFactory ─────────────────────────────────────────────────────────

export type {
  IMigrationFactory,
  MigrationFactoryDependencies,
  MigrationFactoryOptions,
} from './MigrationFactory.js';

export {
  MigrationFactory,
  createV2SessionCoordinator,
} from './MigrationFactory.js';
