/**
 * @module TransportFactory
 *
 * Dependency-injected factory for constructing `TransportGateway` instances.
 *
 * ## Purpose
 * `TransportFactory` is the single authoritative entry point for constructing
 * `TransportGateway` objects. It centralises all construction logic and ensures
 * the gateway is correctly configured before being handed to the application.
 *
 * ## Rules
 * - No OpenAI imports.
 * - No Audio Engine imports.
 * - No Conversation Orchestrator imports.
 * - No business logic.
 * - All dependencies are injected.
 */

import type { ILogger } from '../logger/index.js';
import { TransportGateway } from './TransportGateway.js';
import type { ITransportGateway, TransportGatewayConfig, ITransportAdapter } from './TransportGateway.js';

/**
 * Public contract for the transport gateway factory.
 */
export interface ITransportFactory {
  /**
   * Creates and returns a new `ITransportGateway`.
   *
   * All adapters supplied at construction time are registered before the
   * gateway is returned — callers never need to call `registerAdapter` manually.
   *
   * @param config - Optional overrides for connection-level defaults.
   * @returns A new `ITransportGateway` ready to accept connections.
   */
  createGateway(config?: Partial<TransportGatewayConfig>): ITransportGateway;
}

/**
 * Production implementation of `ITransportFactory`.
 *
 * Instantiate once at bootstrap. Pass all protocol adapters (e.g. ExotelAdapter)
 * in the constructor — they are registered on every gateway this factory creates.
 */
export class TransportFactory implements ITransportFactory {
  private readonly _logger: ILogger;
  private readonly _adapters: readonly ITransportAdapter[];

  constructor(logger: ILogger, adapters: ITransportAdapter[] = []) {
    this._logger   = logger;
    this._adapters = adapters;
  }

  createGateway(config: Partial<TransportGatewayConfig> = {}): ITransportGateway {
    const gateway = new TransportGateway(this._logger, config);
    for (const adapter of this._adapters) {
      gateway.registerAdapter(adapter);
    }
    return gateway;
  }
}

/**
 * Convenience function — creates a `TransportGateway` using the given factory.
 *
 * @param factory - Factory implementation to delegate to.
 * @param config  - Optional configuration overrides.
 * @returns A new `ITransportGateway`.
 *
 * @example
 * ```typescript
 * const gateway = createTransportGateway(factory);
 * gateway.registerAdapter(exotelAdapter);
 *
 * // In WebSocket server upgrade handler:
 * server.on('upgrade', (req, socket, head) => {
 *   wss.handleUpgrade(req, socket, head, (ws) => {
 *     gateway.accept(ws, sessionId, callSid, campaignId, 'exotel', mediaSession, remoteAddress);
 *   });
 * });
 * ```
 */
export function createTransportGateway(
  factory: ITransportFactory,
  config?: Partial<TransportGatewayConfig>
): ITransportGateway {
  return factory.createGateway(config);
}
