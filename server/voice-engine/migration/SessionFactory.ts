/**
 * @module SessionFactory
 *
 * Dependency-injected factory for constructing Voice Engine V2 session contexts.
 *
 * ## Responsibility
 * `SessionFactory` is the single place where a `VoiceEngine` instance and a
 * `TransportGateway` are assembled into a `SessionContext`. It delegates all
 * engine construction to `VoiceEngineFactory` and gateway construction to
 * `TransportFactory`. It performs no business logic of its own.
 *
 * ## mediaSession
 * A `MediaSession` is created in the CREATED (not yet started) state during
 * `createSession()` so that `SessionContext.mediaSession` is never null.
 * Per-call stubs are wired for `ConversationRuntime`, `IConversationOrchestrator`,
 * and `IRealtimeProviderSession`; real implementations replace them when
 * `mediaSession.initialize()` and `mediaSession.start()` are called by the
 * integration layer.
 *
 * ## TransportGateway (single instance)
 * The gateway is created once by `SessionFactory` and injected into
 * `VoiceEngineFactory` via `builderOptions.gateway`. This guarantees that
 * `SessionContext.transportGateway` and the gateway used internally by
 * `VoiceEngine` are the SAME object — not two separate instances.
 *
 * ## Rules
 * - No OpenAI imports.
 * - No Exotel imports.
 * - No transport logic beyond calling `TransportFactory.createGateway()`.
 * - No WebSocket logic.
 * - No business logic.
 * - All dependencies injected through the constructor.
 */

import type { ILogger } from '../logger/index.js';
import type { IMetricsCollector } from '../metrics/index.js';
import type { IVoiceEngineFactory } from '../engine/VoiceEngineFactory.js';
import type { ITransportFactory } from '../transport/TransportFactory.js';
import type { BootstrapOptions } from '../bootstrap/Bootstrap.js';
import type { SessionId, CallSid, CampaignId, Nullable } from '../types/index.js';
import type { ConversationRuntime } from '../runtime/ConversationRuntime.js';
import type {
  IConversationOrchestrator,
  IRealtimeProviderSession,
} from '../orchestrator/ConversationOrchestrator.js';
import type { IClock } from '../runtime/RuntimeContext.js';
import { createVoiceEngineRuntime } from '../bootstrap/Bootstrap.js';
import { createSessionContext } from './SessionContext.js';
import type { SessionContext, SessionMetadata } from './SessionContext.js';
import { MediaSessionFactory } from '../media/MediaSessionFactory.js';
import { createAudioEngine } from '../audio-engine/AudioEngineFactory.js';
import { OrchestratorState } from '../orchestrator/ConversationOrchestrator.js';
import { RuntimeState } from '../runtime/RuntimeState.js';
import { normalizePhoneNumber } from '../../phoneUtils.js';

// ─── Session ID ───────────────────────────────────────────────────────────────

let _sessionCounter = 0;

/**
 * Generates a lexicographically sortable, collision-resistant session ID.
 * Format: `v2s-{timestamp}-{counter}`.
 */
function generateSessionId(): SessionId {
  return `v2s-${Date.now()}-${(++_sessionCounter).toString().padStart(6, '0')}`;
}

// ─── Creation Parameters ──────────────────────────────────────────────────────

/**
 * Parameters accepted by `ISessionFactory.createSession()`.
 */
export interface CreateSessionParams {
  /**
   * Campaign identifier — required.
   * Must be a non-empty string.
   */
  readonly campaignId: CampaignId;

  /**
   * Initial call SID.
   * May be omitted when the outbound call has not been placed yet.
   * Provide this when the call SID is known at session creation time.
   */
  readonly callSid?: Nullable<CallSid>;

  /**
   * E.164 phone number of the remote party.
   * May be omitted when placing an outbound call before the SID is assigned.
   */
  readonly phone?: Nullable<string>;

  /**
   * Optional bootstrap options forwarded to the `VoiceEngineFactory`.
   * Use to inject provider overrides (e.g. in test environments).
   */
  readonly bootstrapOptions?: BootstrapOptions;

  /**
   * Arbitrary metadata to attach to the session context.
   */
  readonly metadata?: SessionMetadata;
}

// ─── Public Interface ─────────────────────────────────────────────────────────

/**
 * Public contract for the session factory.
 */
export interface ISessionFactory {
  /**
   * Constructs a new `SessionContext` containing a fully wired `VoiceEngine`,
   * a `MediaSession` in the CREATED state, and a `TransportGateway`.
   *
   * The returned context is frozen and ready to be registered by
   * `V2SessionCoordinator`. The `mediaSession` field is NEVER null — a
   * pre-wired session in the CREATED state is always present.
   *
   * @param params - Session creation parameters.
   * @returns A frozen `SessionContext`.
   *
   * @throws {Error} if `params.campaignId` is empty.
   * @throws {Error} if engine construction fails.
   */
  createSession(params: CreateSessionParams): Promise<Readonly<SessionContext>>;
}

// ─── Stub Helpers ─────────────────────────────────────────────────────────────

/**
 * Returns a no-op `ConversationRuntime` stub.
 *
 * Used to satisfy `MediaSessionContext` at graph-construction time.
 * Real per-call implementations replace this when `mediaSession.initialize()`
 * is called by the integration layer.
 */
function buildRuntimeStub(): ConversationRuntime {
  const noop = () => Promise.resolve();
  return {
    initialize:     noop,
    connect:        noop,
    startListening: noop,
    startThinking:  (_transcript: string) => Promise.resolve(),
    startSpeaking:  (_responseText: string) => Promise.resolve(),
    interrupt:      noop,
    complete:       (_reason: string) => Promise.resolve(),
    close:          noop,
    destroy:        () => { /* no-op */ },
    getState:       () => RuntimeState.CREATED,
    getSession:     () => { throw new Error('SessionFactory stub: getSession() not implemented'); },
    getContext:     () => { throw new Error('SessionFactory stub: getContext() not implemented'); },
  };
}

/**
 * Returns a no-op `IConversationOrchestrator` stub.
 *
 * Used to satisfy `MediaSessionContext` at graph-construction time.
 */
function buildOrchestratorStub(): IConversationOrchestrator {
  const noop = () => Promise.resolve();
  return {
    state:            OrchestratorState.IDLE,
    start:            noop,
    stop:             (_reason?: string) => Promise.resolve(),
    handleAudioChunk: (_base64Chunk: string, _now: number) => { /* no-op */ },
    interrupt:        (_now: number) => Promise.resolve(),
    getContext:       () => { throw new Error('SessionFactory stub: getContext() not implemented'); },
    on:               (_type: string, _handler: (...args: unknown[]) => void) => { /* no-op */ },
    off:              (_type: string, _handler: (...args: unknown[]) => void) => { /* no-op */ },
    destroy:          () => { /* no-op */ },
  } as unknown as IConversationOrchestrator;
}

/**
 * Returns a no-op `IRealtimeProviderSession` stub.
 *
 * Used to satisfy `MediaSessionContext` at graph-construction time.
 * No OpenAI SDK code is referenced here.
 */
function buildProviderSessionStub(): IRealtimeProviderSession {
  const noop = () => Promise.resolve();
  return {
    isConnected:        false,
    connect:            noop,
    sendAudio:          (_base64Chunk: string) => { /* no-op */ },
    sendText:           (_text: string) => Promise.resolve(),
    interrupt:          noop,
    updateInstructions: (_instructions: string) => Promise.resolve(),
    close:              noop,
    on:                 (_type: string, _handler: (event: unknown) => void) => { /* no-op */ },
    off:                (_type: string, _handler: (event: unknown) => void) => { /* no-op */ },
  };
}

/**
 * Resolves a logger from the runtime's DI container.
 * Falls back to a minimal console logger if no logger is registered.
 */
function resolveLogger(runtime: ReturnType<typeof createVoiceEngineRuntime>): ILogger {
  try {
    return runtime.resolver.logger();
  } catch {
    const log: ILogger = {
      debug: (msg, ctx) => console.debug('[SessionFactory]', msg, ctx ?? ''),
      info:  (msg, ctx) => console.info('[SessionFactory]',  msg, ctx ?? ''),
      warn:  (msg, ctx) => console.warn('[SessionFactory]',  msg, ctx ?? ''),
      error: (msg, ctx) => console.error('[SessionFactory]', msg, ctx ?? ''),
      child: () => log,
    };
    return log;
  }
}

/**
 * Resolves a metrics collector from the runtime's DI container.
 * Falls back to a no-op collector if none is registered.
 */
function resolveMetrics(runtime: ReturnType<typeof createVoiceEngineRuntime>): IMetricsCollector {
  try {
    return runtime.resolver.metrics();
  } catch {
    const noopTimer = () => () => { /* no-op */ };
    const noopHistogram = () => ({ observe: () => { /* no-op */ }, startTimer: noopTimer });
    const noopCounter   = () => ({ increment: () => { /* no-op */ }, reset: () => { /* no-op */ } });
    const noopGauge     = () => ({
      set:       () => { /* no-op */ },
      increment: () => { /* no-op */ },
      decrement: () => { /* no-op */ },
    });
    return {
      histogram: noopHistogram,
      counter:   noopCounter,
      gauge:     noopGauge,
      emit:      () => { /* no-op */ },
    };
  }
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Production implementation of `ISessionFactory`.
 *
 * Construct via `MigrationFactory.createSessionFactory()`.
 */
export class SessionFactory implements ISessionFactory {
  private readonly _log: ILogger;
  private readonly _engineFactory: IVoiceEngineFactory;
  private readonly _transportFactory: ITransportFactory;

  /**
   * @param engineFactory    - Factory for constructing `IVoiceEngine` instances.
   * @param transportFactory - Factory for constructing `ITransportGateway` instances.
   * @param logger           - Logger; will be child-bound to this component.
   */
  constructor(
    engineFactory: IVoiceEngineFactory,
    transportFactory: ITransportFactory,
    logger: ILogger
  ) {
    this._engineFactory    = engineFactory;
    this._transportFactory = transportFactory;
    this._log              = logger.child({ component: 'SessionFactory' });
  }

  // ─── ISessionFactory ────────────────────────────────────────────────────────

  async createSession(params: CreateSessionParams): Promise<Readonly<SessionContext>> {
    const { campaignId } = params;

    if (!campaignId.trim()) {
      throw new Error('SessionFactory: campaignId must be a non-empty string.');
    }

    const sessionId = generateSessionId();

    console.log(`[V2 TRACE] 1. Session created  sessionId=${sessionId}  campaignId=${campaignId}`);

    this._log.debug('Building session dependencies', { sessionId, campaignId });

    // ── Step 1: Build the bootstrap runtime ───────────────────────────────────
    //
    // We build the runtime explicitly so the SessionContext can hold a direct
    // reference to it. The VoiceEngineFactory also builds its own internal
    // runtime copy via bootstrapOptions — both read the same environment
    // variables and produce equivalent, independent frozen objects.
    const bootstrapOptions = params.bootstrapOptions ?? {};
    const runtime = createVoiceEngineRuntime(bootstrapOptions);

    // ── Step 2: Create the TransportGateway ───────────────────────────────────
    //
    // The gateway is created HERE (once) and injected into the VoiceEngine via
    // builderOptions.gateway. This guarantees SessionContext.transportGateway
    // and VoiceEngine's internal gateway are the SAME object — not two
    // separate instances.
    const transportGateway = this._transportFactory.createGateway();

    // ── Step 3: Create the VoiceEngine ────────────────────────────────────────
    //
    // autoStart: false — the caller (V2SessionCoordinator) is responsible for
    // calling initialize() and start() at the appropriate time. This keeps the
    // factory non-blocking and avoids premature network I/O during construction.
    //
    // builderOptions.gateway — injects the gateway we just created so both the
    // engine and the SessionContext share a single TransportGateway instance.
    const voiceEngine = await this._engineFactory.create({
      bootstrapOptions,
      autoStart: false,
      builderOptions: { gateway: transportGateway },
    });

    // ── Step 4: Create the MediaSession (CREATED state) ───────────────────────
    //
    // A MediaSession is constructed now — in the CREATED (not yet started)
    // state — so SessionContext.mediaSession is never null. The per-call
    // deps that require campaign data or live provider connections (runtime,
    // orchestrator, providerSession) are wired as no-op stubs here. Real
    // implementations are substituted by the integration layer when it calls
    // mediaSession.initialize() and mediaSession.start().
    //
    // VoiceEngine.start() is NOT called here. No realtime connections are opened.
    const logger  = resolveLogger(runtime);
    const metrics = resolveMetrics(runtime);
    const clock: IClock = { now: () => Date.now() };

    const mediaSessionFactory = new MediaSessionFactory();
    const mediaSession = mediaSessionFactory.createMediaSession({
      runtime:         buildRuntimeStub(),
      audioEngine:     createAudioEngine(),
      orchestrator:    buildOrchestratorStub(),
      providerSession: buildProviderSessionStub(),
      config:          runtime.config,
      logger:          logger.child({ component: 'MediaSession', sessionId }),
      metrics,
      clock,
      sessionId,
      callSid:         params.callSid ?? '',
      campaignId,
    });

    // ── Step 5: Assemble and freeze the SessionContext ────────────────────────
    const context = createSessionContext({
      sessionId,
      callSid:          params.callSid ?? null,
      phone:            params.phone ? normalizePhoneNumber(params.phone) : null,
      campaignId,
      createdAt:        Date.now(),
      runtime,
      voiceEngine,
      transportGateway,
      mediaSession,
      metadata:         params.metadata ?? {},
    });

    this._log.info('SessionContext created', {
      sessionId,
      campaignId,
      callSid:      context.callSid,
      phone:        context.phone,
      mediaSession: context.mediaSession !== null ? 'present' : 'null',
    });

    return context;
  }
}
