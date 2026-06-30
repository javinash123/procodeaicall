/**
 * @module providers/exotel
 *
 * Public barrel export for the Exotel provider adapter.
 *
 * ## Usage
 * Import through this module only. Never import sub-files directly.
 *
 * ```typescript
 * import {
 *   ExotelFactory,
 *   createExotelSession,
 * } from '../voice-engine/providers/exotel/index.js';
 * ```
 *
 * ## Architecture
 * This module is the ONLY place in Voice Engine V2 with knowledge of the
 * Exotel WebSocket streaming protocol. All other modules interact with the
 * generic Transport Event system.
 */

// ─── Wire Messages ─────────────────────────────────────────────────────────────

export type {
  ExotelMediaFormat,
  ExotelConnectedMessage,
  ExotelStartMessage,
  ExotelMediaMessage,
  ExotelMarkMessage,
  ExotelStopMessage,
  ExotelDtmfMessage,
  ExotelHeartbeatMessage,
  ExotelUnknownMessage,
  ExotelOutboundMediaMessage,
  ExotelOutboundMarkMessage,
  ExotelOutboundClearMessage,
  ExotelInboundMessage,
  ExotelOutboundMessage,
  ExotelInboundEventType,
} from './ExotelMessages.js';

// ─── Protocol ─────────────────────────────────────────────────────────────────

export type { NormalisedMediaFormat } from './ExotelProtocol.js';
export {
  decodeExotelMessage,
  resolveEventType,
  normaliseMediaFormat,
  extractStreamSid,
  extractCallSid,
  extractMediaPayload,
  extractTrackId,
  encodeMediaMessage,
  encodeMarkMessage,
  encodeClearMessage,
  isValidBase64Payload,
} from './ExotelProtocol.js';

// ─── Adapter ──────────────────────────────────────────────────────────────────

export { ExotelAdapter } from './ExotelAdapter.js';

// ─── Session ──────────────────────────────────────────────────────────────────

export type {
  ExotelSessionSnapshot,
  IExotelSession,
} from './ExotelSession.js';
export { ExotelSession } from './ExotelSession.js';

// ─── Factory ──────────────────────────────────────────────────────────────────

export type {
  ExotelSessionDependencies,
  IExotelFactory,
} from './ExotelFactory.js';
export { ExotelFactory, createExotelSession } from './ExotelFactory.js';
