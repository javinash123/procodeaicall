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
 * `mediaSession` in the returned `SessionContext` is always `null` at
 * construction time. The engine creates per-call `MediaSession` objects
 * internally when a WebSocket connection is accepted by the gateway.
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
import type { IVoiceEngineFactory } from '../engine/VoiceEngineFactory.js';
import type { ITransportFactory } from '../transport/TransportFactory.js';
import type { BootstrapOptions } from '../bootstrap/Bootstrap.js';
import type { SessionId, CallSid, CampaignId, Nullable } from '../types/index.js';
import { createVoiceEngineRuntime } from '../bootstrap/Bootstrap.js';
import { createSessionContext } from './SessionContext.js';
import type { SessionContext, SessionMetadata } from './SessionContext.js';

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
   * Constructs a new `SessionContext` containing a fully wired `VoiceEngine`
   * and `TransportGateway`.
   *
   * The returned context is frozen and ready to be registered by
   * `V2SessionCoordinator`. The `mediaSession` field is always `null`
   * until a WebSocket connection is established.
   *
   * @param params - Session creation parameters.
   * @returns A frozen `SessionContext`.
   *
   * @throws {Error} if `params.campaignId` is empty.
   * @throws {Error} if engine construction fails.
   */
  createSession(params: CreateSessionParams): Promise<Readonly<SessionContext>>;
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

    this._log.debug('Building session dependencies', { sessionId, campaignId });

    // ── Step 1: Build the bootstrap runtime ───────────────────────────────────
    //
    // We build the runtime explicitly so the SessionContext can hold a direct
    // reference to it. The VoiceEngineFactory also builds its own internal
    // runtime copy via bootstrapOptions — both read the same environment
    // variables and produce equivalent, independent frozen objects.
    const bootstrapOptions = params.bootstrapOptions ?? {};
    const runtime = createVoiceEngineRuntime(bootstrapOptions);

    // ── Step 2: Create the VoiceEngine ────────────────────────────────────────
    //
    // autoStart: false — the caller (V2SessionCoordinator) is responsible for
    // calling initialize() and start() at the appropriate time. This keeps the
    // factory non-blocking and avoids premature network I/O during construction.
    const voiceEngine = await this._engineFactory.create({
      bootstrapOptions,
      autoStart: false,
    });

    // ── Step 3: Create the TransportGateway ───────────────────────────────────
    //
    // The gateway is created without any adapters registered. The integration
    // layer (e.g. ExotelAdapter) registers itself before the gateway starts
    // accepting connections.
    const transportGateway = this._transportFactory.createGateway();

    // ── Step 4: Assemble and freeze the SessionContext ────────────────────────
    const context = createSessionContext({
      sessionId,
      callSid:          params.callSid ?? null,
      phone:            params.phone   ?? null,
      campaignId,
      createdAt:        Date.now(),
      runtime,
      voiceEngine,
      transportGateway,
      mediaSession:     null,
      metadata:         params.metadata ?? {},
    });

    this._log.info('SessionContext created', {
      sessionId,
      campaignId,
      callSid: context.callSid,
      phone:   context.phone,
    });

    return context;
  }
}
