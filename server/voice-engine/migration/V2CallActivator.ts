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
import { attachOneCallAudioCapture } from '../diagnostics/OneCallAudioCapture.js';

// ── One-shot audio capture flag ────────────────────────────────────────────────
// Set to true after the first call so the capture is never attached twice.
let _captureAttached = false;

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

  // ── Step 1: Load campaign and build system instructions ─────────────────────
  //
  // V1 (exotelStreamHandler) builds a rich system prompt from goal,
  // additionalContext, knowledge_base, and ai_generated_script.  V2 must do
  // the same — passing only ai_generated_script left callers with a generic
  // "how can I assist you" experience because the model had no campaign context.
  let instructions = '';
  try {
    const campaign = await storage.getCampaign(ctx.campaignId);
    if (campaign) {
      const c = campaign as any;

      const goal              = (c.goal              || '') as string;
      const additionalContext = (c.additionalContext  || '') as string;
      const script            = (c.ai_generated_script || c.script || '') as string;
      const knowledgeBase: string = [
        ...(c.knowledgeBaseTexts || []),
        ...(c.knowledgeBaseFiles || []).map((f: any) => f.extractedText).filter(Boolean),
      ].join('\n\n');

      const isSupport = goal.toLowerCase().includes('support');
      const agentRole = isSupport ? 'customer support agent' : 'sales agent';

      // Spoken-conversation system prompt — short, direct, phone-sales style.
      // No markdown, no bullet glyphs, no AI-assistant phrasing.
      instructions = [
        `You are a ${agentRole} on a live outbound phone call. Speak in short, natural sentences. Every word you say goes directly to a real person on the phone — no formatting, no lists, no markdown.`,
        '',
        goal              ? `Campaign goal: ${goal}` : '',
        additionalContext ? `Business info: ${additionalContext}` : '',
        knowledgeBase     ? `KNOWLEDGE BASE — use these facts when relevant:\n${knowledgeBase.slice(0, 3000)}\nEND KNOWLEDGE BASE` : '',
        script            ? `Talking points — adapt to the conversation, never recite verbatim:\n${script}` : '',
        '',
        'GREETING — your very first message must sound like a real salesperson, not a robot.',
        'Good examples:',
        '  "Hi [Name], this is Priya from [Company]. Did I catch you at a bad time?"',
        '  "Hi [Name], I\'m calling because you recently showed interest in [product]. Got a minute?"',
        'Never open with "Hello, I am calling regarding..." — that sounds scripted and robotic.',
        '',
        'CONVERSATION RULES:',
        'Speak one short thought or question per turn, then stop and wait for the customer.',
        'Never ask two questions in one message.',
        'When the customer says yes, sure, ok, or agreed — ask one qualifying question. Do not pitch yet.',
        'From turn three onwards — share one specific benefit, then ask one question.',
        'From turn five onwards — offer a concrete next step: a callback, a site visit, or a brochure.',
        'If the customer wants to schedule something — confirm the time, get their name, stop selling.',
        'If the customer asks a direct question — answer it with a specific fact. Never deflect or stall.',
        'If the customer interrupts — stop speaking, acknowledge briefly, and listen.',
        'Keep every response under 30 words. Complex explanations may go up to 50 words — no more.',
        '',
        'FORMAT:',
        'Plain spoken English only. No bullet points, no markdown, no numbered lists.',
        'Do not open turns with filler words like "Great!", "Absolutely!", "Of course!", or "Certainly!".',
        'Do not re-introduce yourself after the greeting.',
        '',
        'FORBIDDEN:',
        '"How may I assist you today?" or any similar phrase — you already know why you are calling.',
        '"You\'re welcome" — unless the customer explicitly said thank you.',
        '"Have a great day", "Goodbye", or any farewell — you do not end the call.',
        '"I can\'t access websites" or "I don\'t have access to the internet" — you are a human agent who knows this product.',
        'Any mention of being an AI, a bot, a language model, or an assistant.',
      ].filter(Boolean).join('\n');

      logger.info('Campaign instructions built', {
        campaignId:      ctx.campaignId,
        goal:            goal || '(none)',
        hasKB:           knowledgeBase.length > 0,
        hasScript:       script.length > 0,
        totalChars:      instructions.length,
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
  const providerSession = provider.openSession({ instructions, traceSessionId: ctx.sessionId });

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

  // ── Step 5.5: One-shot audio capture (diagnostic) ────────────────────────────
  // Attaches ONCE per process lifetime. Captures OpenAI output_audio.delta bytes
  // and Exotel-bound bytes for the first call only, then writes:
  //   logs/openai-audio.raw, logs/openai-audio.wav, logs/exotel-audio.raw
  if (!_captureAttached) {
    _captureAttached = true;
    attachOneCallAudioCapture(providerSession, ctx.transportGateway, ctx.sessionId);
  }

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
