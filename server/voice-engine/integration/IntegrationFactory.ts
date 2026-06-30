/**
 * @module IntegrationFactory
 *
 * Factory for assembling a fully wired `RuntimeIntegration` from its
 * constituent dependencies.
 *
 * ## Responsibilities
 * - Receives all pre-constructed Voice Engine V2 components via
 *   `IntegrationFactoryInput`.
 * - Instantiates `RealtimeBridge`, `InboundAudioFlow`, `OutboundAudioFlow`,
 *   and `SessionSupervisor` with their correct dependencies.
 * - Returns a fully assembled `IRuntimeIntegration` ready to be started.
 *
 * ## Rules
 * - No OpenAI SDK imports.
 * - No Exotel protocol imports.
 * - No business logic, no CRM, no MongoDB.
 * - All construction is pure and synchronous — no side effects.
 * - Every component is injected; none are newed internally using
 *   provider-specific constructors.
 *
 * ## Usage
 * ```typescript
 * const integration = IntegrationFactory.create(input);
 * await integration.start();
 * // ... conversation runs ...
 * await integration.stop('goal_reached');
 * ```
 */

import type { ILogger } from '../logger/index.js';
import type { IMediaSession } from '../media/MediaSession.js';
import type { IAudioEngine } from '../audio-engine/AudioEngine.js';
import type { ITransportGateway } from '../transport/TransportGateway.js';
import type { IOpenAIRealtimeSession } from '../providers/openai/OpenAIRealtimeSession.js';
import type { SessionId } from '../types/index.js';
import type { OutboundAudioFormat } from './OutboundAudioFlow.js';
import type { SessionSupervisorConfig } from './SessionSupervisor.js';
import { RealtimeBridge } from './RealtimeBridge.js';
import { InboundAudioFlow } from './InboundAudioFlow.js';
import { OutboundAudioFlow } from './OutboundAudioFlow.js';
import { SessionSupervisor } from './SessionSupervisor.js';
import { RuntimeIntegration } from './RuntimeIntegration.js';
import type { IRuntimeIntegration } from './RuntimeIntegration.js';

// ─── Factory Input ────────────────────────────────────────────────────────────

/**
 * All pre-constructed Voice Engine V2 components required to assemble
 * a `RuntimeIntegration`.
 */
export interface IntegrationFactoryInput {
  /** Unique identifier for the call session. */
  readonly sessionId: SessionId;

  /** Media session that owns this call's lifecycle. */
  readonly mediaSession: IMediaSession;

  /** Audio engine driving inbound and outbound pipelines. */
  readonly audioEngine: IAudioEngine;

  /** Transport gateway for accepting and sending WebSocket messages. */
  readonly transport: ITransportGateway;

  /**
   * The AI provider realtime session.
   * Must not yet be connected — `RuntimeIntegration.start()` will connect it.
   */
  readonly providerSession: IOpenAIRealtimeSession;

  /** Structured logger, scoped to the application root or call context. */
  readonly logger: ILogger;

  /** Optional audio format for the outbound flow. */
  readonly outboundAudioFormat?: Partial<OutboundAudioFormat>;

  /** Optional supervisor tuning overrides. */
  readonly supervisorConfig?: Partial<SessionSupervisorConfig>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Assembles a `RuntimeIntegration` from its dependencies.
 *
 * All construction is pure and synchronous; no network or I/O calls are made.
 * Call `IRuntimeIntegration.start()` to initiate the live session.
 */
export const IntegrationFactory = Object.freeze({
  /**
   * Creates and wires a fully assembled `IRuntimeIntegration`.
   *
   * @param input - All required components and configuration.
   * @returns A ready-to-start `IRuntimeIntegration`.
   */
  create(input: Readonly<IntegrationFactoryInput>): IRuntimeIntegration {
    const {
      sessionId,
      mediaSession,
      audioEngine,
      transport,
      providerSession,
      logger,
      outboundAudioFormat,
      supervisorConfig,
    } = input;

    // Build the bridge — owns the provider ↔ media session connection.
    const bridge = new RealtimeBridge({
      providerSession,
      mediaSession,
      logger,
      sessionId,
    });

    // Build the inbound flow — Transport → AudioEngine → Bridge.
    const inboundFlow = new InboundAudioFlow({
      transport,
      mediaSession,
      audioEngine,
      bridge,
      logger,
      sessionId,
    });

    // Build the outbound flow — Bridge → AudioEngine → Transport.
    const outboundFlow = new OutboundAudioFlow({
      bridge,
      audioEngine,
      transport,
      sessionId,
      logger,
      config: outboundAudioFormat
        ? { audioFormat: { sampleRate: 8000, encoding: 'mulaw', ...outboundAudioFormat } }
        : undefined,
    });

    // Build the supervisor — monitors timeouts, disconnects, failures.
    const supervisor = new SessionSupervisor({
      mediaSession,
      bridge,
      logger,
      sessionId,
      config: supervisorConfig,
    });

    // Assemble the top-level integration.
    return new RuntimeIntegration({
      sessionId,
      mediaSession,
      audioEngine,
      transport,
      bridge,
      inboundFlow,
      outboundFlow,
      supervisor,
      logger,
    });
  },
});
