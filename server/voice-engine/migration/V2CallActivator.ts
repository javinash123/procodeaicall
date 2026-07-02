/**
 * @module V2CallActivator
 *
 * Activates a pre-registered V2 session when the Exotel WebSocket connects.
 *
 * ## Responsibility
 * Bridges the gap between `SessionFactory.createSession()` (which builds a
 * session context with stub components) and `RuntimeIntegration.start()`
 * (which opens the real provider connection and starts the audio pipeline).
 *
 * ## When to call
 * Call `activateV2Session(ctx)` immediately after
 * `ctx.transportGateway.accept()` succeeds in the V2 router.  The function
 * is async — the caller should fire-and-forget with `.catch()` logging.
 *
 * ## Cleanup
 * The `RuntimeIntegration` is stopped automatically when the transport session
 * emits `transport.disconnected`.  No manual cleanup is required by the caller.
 */

import { storage } from '../../storage.js';
import { IntegrationFactory } from '../integration/IntegrationFactory.js';
import { createAudioEngine } from '../audio-engine/AudioEngineFactory.js';
import type { SessionContext } from './SessionContext.js';
import type { IRuntimeIntegration } from '../integration/RuntimeIntegration.js';
import type { OpenAIRealtimeProvider } from '../providers/openai/OpenAIRealtimeProvider.js';
import type { TransportDisconnectedEvent } from '../transport/TransportEvents.js';

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Activates the Voice Engine V2 pipeline for a connected Exotel WebSocket.
 *
 * 1. Loads campaign instructions from MongoDB.
 * 2. Opens a real `IOpenAIRealtimeSession` via the DI-registered provider.
 * 3. Creates a fresh `AudioEngine` for this call's pipeline.
 * 4. Assembles the full `RuntimeIntegration` via `IntegrationFactory`.
 * 5. Starts the integration — opens the OpenAI WebSocket, attaches
 *    `TurnDiagnosticsCollector`, and starts inbound/outbound audio flows.
 * 6. Registers a `transport.disconnected` listener to stop the integration
 *    when the Exotel WebSocket closes.
 *
 * @param ctx - The pre-registered `SessionContext` from `createSession()`.
 * @returns The started `IRuntimeIntegration`.
 * @throws If `ctx.mediaSession` is null or the integration fails to start.
 */
export async function activateV2Session(ctx: SessionContext): Promise<IRuntimeIntegration> {
  console.log(`[V2 TRACE] 4. activateV2Session() entered  sessionId=${ctx.sessionId}  campaignId=${ctx.campaignId}`);

  if (!ctx.mediaSession) {
    throw new Error(
      `V2CallActivator: SessionContext ${ctx.sessionId} has no MediaSession — cannot activate.`
    );
  }

  const logger = ctx.runtime.resolver.logger().child({
    component: 'V2CallActivator',
    sessionId: ctx.sessionId,
  });

  logger.info('Activating V2 session — loading campaign and opening provider session', {
    sessionId: ctx.sessionId,
    campaignId: ctx.campaignId,
  });

  // ── Step 1: Load campaign for system instructions ───────────────────────────
  let instructions = '';
  try {
    const campaign = await storage.getCampaign(ctx.campaignId);
    if (campaign) {
      instructions = (campaign as any).ai_generated_script
        || (campaign as any).script
        || '';
      logger.info('Campaign instructions loaded', {
        campaignId: ctx.campaignId,
        chars: instructions.length,
      });
    } else {
      logger.warn('Campaign not found — proceeding with empty instructions', {
        campaignId: ctx.campaignId,
      });
    }
  } catch (err) {
    logger.warn('Failed to load campaign data — proceeding with empty instructions', {
      campaignId: ctx.campaignId,
      error: String(err),
    });
  }

  // ── Step 2: Open a real provider session ────────────────────────────────────
  //
  // `resolver.llm()` returns `ILLMProvider`.  In production the concrete type
  // is always `OpenAIRealtimeProvider` (wired by CoordinatorBootstrap when
  // OPENAI_API_KEY is present).  The cast is safe: V2 is only enabled when
  // the provider was successfully registered.
  const provider = ctx.runtime.resolver.llm() as unknown as OpenAIRealtimeProvider;
  console.log(`[V2 TRACE] 5. OpenAIRealtimeProvider.openSession()  sessionId=${ctx.sessionId}`);
  const providerSession = provider.openSession({ instructions });

  logger.info('Provider session opened (unconnected — bridge will connect it)', {
    sessionId: ctx.sessionId,
    instructionsChars: instructions.length,
  });

  // ── Step 3: Create a fresh audio engine for this call's pipeline ─────────────
  //
  // This engine is independent of the stub AudioEngine that was placed inside
  // the MediaSession at SessionFactory time.  RuntimeIntegration manages this
  // engine's lifecycle via start() / stop() / destroy().
  const audioEngine = createAudioEngine();

  // ── Step 4: Assemble the full RuntimeIntegration ────────────────────────────
  const integration = IntegrationFactory.create({
    sessionId:    ctx.sessionId,
    mediaSession: ctx.mediaSession,
    audioEngine,
    transport:    ctx.transportGateway,
    providerSession,
    logger:       ctx.runtime.resolver.logger(),
  });

  // ── Step 5: Start the integration ───────────────────────────────────────────
  //   • AudioEngine starts
  //   • RealtimeBridge.connect() → provider WebSocket opens → TurnDiagnosticsCollector attaches
  //   • MediaSession.initialize() / start() (stub runtime → no-ops, safe)
  //   • InboundAudioFlow and OutboundAudioFlow start
  //   • SessionSupervisor starts
  await integration.start();

  logger.info('RuntimeIntegration started — [TURN-DIAGNOSTICS] collector is active', {
    sessionId: ctx.sessionId,
  });

  // ── Step 6: Register cleanup on transport disconnect ─────────────────────────
  //
  // When Exotel closes the WebSocket, TransportGateway emits
  // `transport.disconnected`.  Stopping the integration here guarantees
  // RealtimeBridge.disconnect() fires, which:
  //   • detaches TurnDiagnosticsCollector
  //   • prints the [TURN-DIAGNOSTICS] CALL SUMMARY
  //   • persists the JSON log to logs/call-diagnostics/
  const onDisconnected = (event: TransportDisconnectedEvent): void => {
    if (event.sessionId !== ctx.sessionId) return;

    ctx.transportGateway.off('transport.disconnected', onDisconnected);

    logger.info('Transport disconnected — stopping RuntimeIntegration', {
      sessionId: ctx.sessionId,
      code: event.code,
      reason: event.reason,
    });

    integration.stop('transport_disconnected').catch(() => {
      integration.shutdown();
    });
  };

  ctx.transportGateway.on('transport.disconnected', onDisconnected);

  return integration;
}
