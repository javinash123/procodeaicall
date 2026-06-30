/**
 * @module integration
 *
 * Public barrel export for the Voice Engine V2 Runtime Integration Layer.
 *
 * ## Modules exported
 *
 * | Module                | Purpose                                                   |
 * |-----------------------|-----------------------------------------------------------|
 * | `RealtimeBridge`      | Provider ↔ MediaSession audio channel + interrupt forward |
 * | `InboundAudioFlow`    | Transport → AudioEngine → Bridge pipeline                 |
 * | `OutboundAudioFlow`   | Bridge → AudioEngine → Transport pipeline                 |
 * | `SessionSupervisor`   | Timeout / disconnect / heartbeat monitoring               |
 * | `RuntimeIntegration`  | Top-level lifecycle owner (start / stop / shutdown)       |
 * | `IntegrationFactory`  | Assembles a fully wired RuntimeIntegration                |
 *
 * ## Entry Point
 * The canonical way to create a runtime integration is via `IntegrationFactory.create()`:
 *
 * ```typescript
 * import { IntegrationFactory } from '@voice-engine/integration';
 *
 * const integration = IntegrationFactory.create({
 *   sessionId,
 *   mediaSession,
 *   audioEngine,
 *   transport,
 *   providerSession,
 *   logger,
 * });
 *
 * await integration.start();
 * // ...
 * await integration.stop('goal_reached');
 * ```
 */

// ─── RealtimeBridge ───────────────────────────────────────────────────────────
export type {
  IRealtimeBridge,
  RealtimeBridgeDependencies,
  BridgeEvent,
  BridgeEventType,
  BridgeEventHandler,
  BridgeAudioReadyEvent,
  BridgeDisconnectedEvent,
  BridgeErrorEvent,
  BridgeSpeechDetectedEvent,
} from './RealtimeBridge.js';
export { RealtimeBridge } from './RealtimeBridge.js';

// ─── InboundAudioFlow ─────────────────────────────────────────────────────────
export type {
  IInboundAudioFlow,
  InboundAudioFlowDependencies,
  InboundAudioFlowConfig,
} from './InboundAudioFlow.js';
export { InboundAudioFlow } from './InboundAudioFlow.js';

// ─── OutboundAudioFlow ────────────────────────────────────────────────────────
export type {
  IOutboundAudioFlow,
  OutboundAudioFlowDependencies,
  OutboundAudioFlowConfig,
  OutboundAudioFormat,
} from './OutboundAudioFlow.js';
export { OutboundAudioFlow } from './OutboundAudioFlow.js';

// ─── SessionSupervisor ────────────────────────────────────────────────────────
export type {
  ISessionSupervisor,
  SessionSupervisorDependencies,
  SessionSupervisorConfig,
} from './SessionSupervisor.js';
export { SessionSupervisor } from './SessionSupervisor.js';

// ─── RuntimeIntegration ───────────────────────────────────────────────────────
export type {
  IRuntimeIntegration,
  RuntimeIntegrationDependencies,
} from './RuntimeIntegration.js';
export { RuntimeIntegration, IntegrationState } from './RuntimeIntegration.js';

// ─── IntegrationFactory ───────────────────────────────────────────────────────
export type { IntegrationFactoryInput } from './IntegrationFactory.js';
export { IntegrationFactory } from './IntegrationFactory.js';
