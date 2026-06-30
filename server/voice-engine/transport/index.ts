/**
 * @module transport
 *
 * Public barrel export for the Transport Layer of Voice Engine V2.
 *
 * ## Usage
 * Import everything through this module. Never import sub-files directly.
 *
 * ```typescript
 * import {
 *   TransportGateway,
 *   createTransportGateway,
 * } from '../voice-engine/transport/index.js';
 * ```
 *
 * ## Architecture
 * The Transport Layer is responsible for all WebSocket connection concerns:
 * - Accepting inbound WebSocket connections from telephony providers.
 * - Managing connection lifecycle (open, ping/pong, reconnect, close).
 * - Routing raw protocol messages through registered `ITransportAdapter`s.
 * - Delivering decoded `TransportEvent`s upward to the application layer.
 * - Translating outbound audio chunks into provider-specific wire frames.
 *
 * The Transport Layer:
 * - Knows NOTHING about OpenAI, Conversation Orchestrator, Audio Engine,
 *   CRM, campaigns, MongoDB, or business logic.
 * - Communicates with the call lifecycle ONLY through `IMediaSession`.
 * - Isolates all provider-specific protocol knowledge inside adapters
 *   (e.g. `ExotelAdapter`).
 */

// ─── Events ────────────────────────────────────────────────────────────────────

export type {
  TransportProtocol,
  TransportConnectionState,
  TransportConnectedEvent,
  TransportDisconnectedEvent,
  TransportReconnectingEvent,
  TransportAudioReceivedEvent,
  TransportDtmfReceivedEvent,
  TransportMarkAcknowledgedEvent,
  TransportHeartbeatEvent,
  TransportErrorEvent,
  TransportCallEndedEvent,
  TransportEvent,
  TransportEventMap,
  TransportEventType,
  TransportEventHandler,
} from './TransportEvents.js';

// ─── Session ───────────────────────────────────────────────────────────────────

export type {
  TransportSessionId,
  TransportSessionMetadata,
  HeartbeatState,
} from './TransportSession.js';
export { TransportSession, createTransportSession } from './TransportSession.js';

// ─── Connection ────────────────────────────────────────────────────────────────

export type {
  TransportConnectionConfig,
  RawMessageHandler,
  ConnectedHandler,
  DisconnectedHandler,
  PongHandler,
  BackpressureHandler,
  ConnectionErrorHandler,
  ITransportConnection,
} from './TransportConnection.js';
export {
  TransportConnection,
  DEFAULT_CONNECTION_CONFIG,
} from './TransportConnection.js';

// ─── Gateway ───────────────────────────────────────────────────────────────────

export type {
  ITransportAdapter,
  TransportEventEmitter,
  TransportGatewayConfig,
  ITransportGateway,
} from './TransportGateway.js';
export { TransportGateway } from './TransportGateway.js';

// ─── Factory ───────────────────────────────────────────────────────────────────

export type { ITransportFactory } from './TransportFactory.js';
export { TransportFactory, createTransportGateway } from './TransportFactory.js';

// ─── Legacy Compatibility ──────────────────────────────────────────────────────
// Preserve compatibility with imports that used the original stub.

/** @deprecated Use `TransportConnectionState` instead. */
export type TransportState = import('./TransportEvents.js').TransportConnectionState;

/** Generic transport message envelope for legacy callers. */
export interface TransportMessage {
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** @deprecated Use `ITransportGateway` for new code. */
export interface ITransport {
  readonly state: TransportState;
  readonly callSid: string;
  readonly sessionId: string;
  send(message: TransportMessage): Promise<void>;
  close(reason?: string): Promise<void>;
  onMessage(handler: (message: TransportMessage) => void): void;
  onClose(handler: (reason?: string) => void): void;
  onError(handler: (error: Error) => void): void;
}
