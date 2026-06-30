/**
 * @module ExotelFactory
 *
 * Dependency-injected factory for creating Exotel session and adapter objects.
 *
 * ## Purpose
 * `ExotelFactory` is the single authoritative entry point for constructing
 * Exotel-specific objects. It wires together `ExotelAdapter`, `ExotelSession`,
 * and the `TransportGateway` without exposing any internal construction
 * details to the application layer.
 *
 * ## Rules
 * - No OpenAI imports.
 * - No MediaSession imports.
 * - No business logic.
 * - All dependencies are injected.
 */

import type { WebSocket as WsWebSocket } from 'ws';
import type { ITransportGateway } from '../../transport/TransportGateway.js';
import type { IMediaSession } from '../../media/MediaSession.js';
import type { ILogger } from '../../logger/index.js';
import type { SessionId } from '../../types/index.js';
import { ExotelAdapter } from './ExotelAdapter.js';
import { ExotelSession } from './ExotelSession.js';
import type { IExotelSession } from './ExotelSession.js';

/**
 * Dependencies required to construct an `ExotelSession`.
 */
export interface ExotelSessionDependencies {
  /** The raw WebSocket accepted by the server upgrade handler. */
  readonly socket: WsWebSocket;
  /** Unique session identifier shared with the media layer. */
  readonly sessionId: SessionId;
  /** Telephony call identifier. */
  readonly callSid: string;
  /** Campaign identifier (metadata only; not used by the adapter). */
  readonly campaignId: string;
  /** The `IMediaSession` that owns this call's lifecycle. */
  readonly mediaSession: IMediaSession;
  /** IP address or hostname of the remote Exotel endpoint. */
  readonly remoteAddress: string;
  /** Structured logger. */
  readonly logger: ILogger;
}

/**
 * Public contract for the Exotel session factory.
 */
export interface IExotelFactory {
  /**
   * Creates an `ExotelSession` that binds the given WebSocket to the
   * transport gateway and the supplied `IMediaSession`.
   *
   * After this call returns, the gateway owns the connection lifecycle.
   * The caller should retain the returned `IExotelSession` only if it
   * needs to send outbound audio or close the session programmatically.
   *
   * @param deps - All per-call dependencies.
   * @returns A live `IExotelSession`.
   */
  createSession(deps: ExotelSessionDependencies): IExotelSession;
}

/**
 * Production implementation of `IExotelFactory`.
 *
 * Instantiate once at bootstrap; reuse across all calls.
 */
export class ExotelFactory implements IExotelFactory {
  private readonly _gateway: ITransportGateway;
  private readonly _adapter: ExotelAdapter;

  constructor(gateway: ITransportGateway, logger: ILogger) {
    this._gateway = gateway;
    this._adapter = new ExotelAdapter(logger);

    // Register the adapter once — the gateway is shared across all calls.
    this._gateway.registerAdapter(this._adapter);
  }

  createSession(deps: ExotelSessionDependencies): IExotelSession {
    const transportSession = this._gateway.accept(
      deps.socket,
      deps.sessionId,
      deps.callSid,
      deps.campaignId,
      'exotel',
      deps.mediaSession,
      deps.remoteAddress
    );

    return new ExotelSession(transportSession, this._gateway);
  }
}

/**
 * Convenience function — creates an `ExotelSession` using the provided factory.
 *
 * @param factory - Factory implementation to delegate to.
 * @param deps    - Per-call dependencies.
 * @returns A live `IExotelSession`.
 *
 * @example
 * ```typescript
 * const session = createExotelSession(factory, {
 *   socket,
 *   sessionId,
 *   callSid,
 *   campaignId,
 *   mediaSession,
 *   remoteAddress: req.socket.remoteAddress ?? '',
 *   logger,
 * });
 * // Call lifecycle is now managed by the gateway + MediaSession.
 * ```
 */
export function createExotelSession(
  factory: IExotelFactory,
  deps: ExotelSessionDependencies
): IExotelSession {
  return factory.createSession(deps);
}
