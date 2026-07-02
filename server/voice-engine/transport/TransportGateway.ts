/**
 * @module TransportGateway
 *
 * The top-level coordinator for all transport connections.
 *
 * ## Purpose
 * `TransportGateway` is the single entry point for every new inbound
 * WebSocket connection. It owns:
 *
 * - The registry of named `ITransportAdapter` implementations.
 * - The map of live `TransportSession` → `TransportConnection` pairs.
 * - Reconnect policy (per-connection backoff).
 * - Graceful and forced shutdown of all connections.
 *
 * The Gateway exposes a clean façade to the application layer:
 * `accept()` to register a new WebSocket; `send()` to push a raw message;
 * `close()` / `destroy()` to tear down individual connections or all at once.
 *
 * ## Rules
 * - No OpenAI imports.
 * - No Audio Engine imports.
 * - No Conversation Orchestrator imports.
 * - No business logic.
 * - Communicates with the application layer only through `ITransportAdapter`
 *   callbacks and by calling methods on `IMediaSession`.
 *
 * ## Scalability
 * Designed for 1000+ concurrent connections. All state is stored in plain
 * `Map` instances. No blocking operations. No global mutable state outside
 * the Gateway instance itself.
 *
 * ## Thread Safety
 * Node.js is single-threaded. All mutations are synchronous or serialised
 * through `async/await`. No additional locking is required.
 */

import type { WebSocket as WsWebSocket } from 'ws';
import type { ILogger } from '../logger/index.js';
import type { Timestamp, Nullable, SessionId } from '../types/index.js';
import type { IMediaSession } from '../media/MediaSession.js';
import type { AudioChunk } from '../audio-engine/AudioChunk.js';
import { createAudioChunk } from '../audio-engine/AudioChunk.js';
import { TransportSession, createTransportSession } from './TransportSession.js';
import { TransportConnection } from './TransportConnection.js';
import type { TransportConnectionConfig } from './TransportConnection.js';
import type { TransportEventType, TransportEvent, TransportEventHandler } from './TransportEvents.js';

// ─── Adapter Interface ────────────────────────────────────────────────────────

/**
 * Protocol-specific adapter registered with the `TransportGateway`.
 *
 * An adapter translates between raw WebSocket messages and typed
 * `TransportEvent`s, and between generic outbound requests and
 * protocol-specific wire frames.
 *
 * Implementations (e.g. `ExotelAdapter`) must be protocol-aware but
 * must never reach into the Media Session layer directly — the Gateway
 * brokers all `IMediaSession` interactions.
 */
export interface ITransportAdapter {
  /** Human-readable adapter name used for registration and logging. */
  readonly name: string;

  /**
   * Called by the Gateway for every raw text message received from the remote.
   *
   * The adapter must decode the message, determine its type, and call
   * the provided `emit` function with the appropriate `TransportEvent`.
   * Unknown messages must be handled silently (no throws).
   *
   * @param raw      - Raw WebSocket message string.
   * @param session  - The transport session for this connection.
   * @param emit     - Callback to dispatch a decoded `TransportEvent`.
   */
  handleMessage(
    raw: string,
    session: TransportSession,
    emit: TransportEventEmitter
  ): void;

  /**
   * Encodes an outbound audio chunk into a protocol-specific wire frame.
   *
   * @param chunk     - Outbound audio to transmit to the caller.
   * @param streamId  - Provider-specific stream/call identifier.
   * @returns Serialised wire frame string ready to send over WebSocket.
   */
  encodeOutboundAudio(chunk: AudioChunk, streamId: string): string;

  /**
   * Encodes a mark message (sent after audio to track playback progress).
   *
   * @param streamId - Provider-specific stream identifier.
   * @param name     - Mark name (echoed back in the inbound mark event).
   * @returns Serialised wire frame string.
   */
  encodeMark(streamId: string, name: string): string;

  /**
   * Encodes a clear message (flushes buffered outbound audio on barge-in).
   *
   * @param streamId - Provider-specific stream identifier.
   * @returns Serialised wire frame string.
   */
  encodeClear(streamId: string): string;
}

/**
 * Callback that the adapter calls to dispatch a decoded event to the Gateway.
 */
export type TransportEventEmitter = (event: TransportEvent) => void;

// ─── Gateway Configuration ────────────────────────────────────────────────────

/**
 * Configuration for the `TransportGateway`.
 */
export interface TransportGatewayConfig {
  /**
   * Connection-level defaults applied to every accepted WebSocket.
   */
  readonly connection: Partial<TransportConnectionConfig>;
}

const DEFAULT_GATEWAY_CONFIG: Readonly<TransportGatewayConfig> = Object.freeze({
  connection: {},
});

// ─── Active Connection Record ─────────────────────────────────────────────────

/**
 * Internal record grouping all runtime state for one live connection.
 */
interface ConnectionRecord {
  readonly session: TransportSession;
  readonly connection: TransportConnection;
  readonly mediaSession: IMediaSession;
  readonly adapterName: string;
  reconnectAttempts: number;
}

// ─── Gateway Implementation ───────────────────────────────────────────────────

/**
 * Public contract for the Transport Gateway.
 */
export interface ITransportGateway {
  /**
   * Registers a named protocol adapter.
   * Must be called before `accept()` is called with that adapter name.
   *
   * @param adapter - The adapter implementation to register.
   */
  registerAdapter(adapter: ITransportAdapter): void;

  /**
   * Accepts a new WebSocket connection and binds it to a `MediaSession`.
   *
   * @param socket       - The raw WebSocket from the server upgrade handler.
   * @param sessionId    - Unique session identifier for this call.
   * @param callSid      - Telephony call identifier.
   * @param campaignId   - Campaign identifier (used for metadata only).
   * @param adapterName  - Name of the registered adapter to use.
   * @param mediaSession - The `IMediaSession` that owns this call's lifecycle.
   * @param remoteAddress - IP/hostname of the remote endpoint.
   * @returns The `TransportSession` created for this connection.
   */
  accept(
    socket: WsWebSocket,
    sessionId: SessionId,
    callSid: string,
    campaignId: string,
    adapterName: string,
    mediaSession: IMediaSession,
    remoteAddress: string
  ): TransportSession;

  /**
   * Enqueues an outbound audio chunk for delivery to the caller.
   *
   * @param sessionId - Target session identifier.
   * @param chunk     - Outbound audio chunk.
   * @param markName  - Optional mark name to send after the audio frame.
   */
  sendAudio(sessionId: SessionId, chunk: AudioChunk, markName?: string): void;

  /**
   * Sends a clear command to flush the provider's outbound audio buffer.
   * Used to implement barge-in.
   *
   * @param sessionId - Target session identifier.
   */
  sendClear(sessionId: SessionId): void;

  /**
   * Sends a raw pre-serialised message to the specified session.
   *
   * @param sessionId - Target session identifier.
   * @param message   - Serialised wire frame string.
   */
  send(sessionId: SessionId, message: string): void;

  /**
   * Initiates a graceful close for the specified session.
   *
   * @param sessionId - Target session identifier.
   * @param reason    - Human-readable reason.
   */
  close(sessionId: SessionId, reason?: string): Promise<void>;

  /**
   * Immediately destroys the specified session.
   *
   * @param sessionId - Target session identifier.
   */
  disconnect(sessionId: SessionId): void;

  /**
   * Destroys ALL active connections and releases all resources.
   * Safe to call at any point; subsequent operations are no-ops.
   */
  destroy(): void;

  /** Subscribes to a transport event type across all sessions. */
  on<T extends TransportEventType>(
    type: T,
    handler: TransportEventHandler<Extract<TransportEvent, { type: T }>>
  ): void;

  /** Unsubscribes from a transport event type. */
  off<T extends TransportEventType>(
    type: T,
    handler: TransportEventHandler<Extract<TransportEvent, { type: T }>>
  ): void;

  /** Returns the number of currently active connections. */
  readonly connectionCount: number;
}

/**
 * Production implementation of `ITransportGateway`.
 */
export class TransportGateway implements ITransportGateway {
  private readonly _logger: ILogger;
  private readonly _config: Readonly<TransportGatewayConfig>;

  private readonly _adapters = new Map<string, ITransportAdapter>();
  private readonly _connections = new Map<SessionId, ConnectionRecord>();
  private readonly _handlers = new Map<
    TransportEventType,
    Set<TransportEventHandler>
  >();

  private _destroyed = false;

  constructor(logger: ILogger, config: Partial<TransportGatewayConfig> = {}) {
    this._logger = logger.child({ component: 'TransportGateway' });
    this._config = Object.freeze({ ...DEFAULT_GATEWAY_CONFIG, ...config });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  get connectionCount(): number {
    return this._connections.size;
  }

  registerAdapter(adapter: ITransportAdapter): void {
    if (this._adapters.has(adapter.name)) {
      this._logger.warn('Overwriting existing adapter registration', {
        name: adapter.name,
      });
    }
    this._adapters.set(adapter.name, adapter);
    this._logger.info('Transport adapter registered', { name: adapter.name });
  }

  accept(
    socket: WsWebSocket,
    sessionId: SessionId,
    callSid: string,
    campaignId: string,
    adapterName: string,
    mediaSession: IMediaSession,
    remoteAddress: string
  ): TransportSession {
    this._assertNotDestroyed('accept');

    const adapter = this._resolveAdapter(adapterName);
    const now = Date.now();

    const session = createTransportSession(
      { sessionId, callSid },
      {
        remoteAddress,
        protocol: 'websocket',
        streamId: '',          // Will be populated by ExotelAdapter on 'start'.
        connectedAt: now,
        adapterName,
      },
      now
    );

    const connection = new TransportConnection(socket, session, this._config.connection);

    const record: ConnectionRecord = {
      session,
      connection,
      mediaSession,
      adapterName,
      reconnectAttempts: 0,
    };

    this._connections.set(sessionId, record);
    this._wireConnectionCallbacks(record, adapter);

    this._logger.info('Transport connection accepted', {
      sessionId,
      callSid,
      campaignId,
      adapterName,
      remoteAddress,
    });

    return session;
  }

  sendAudio(sessionId: SessionId, chunk: AudioChunk, markName?: string): void {
    const record = this._connections.get(sessionId);
    if (!record || !record.connection.isConnected) return;

    const adapter = this._adapters.get(record.adapterName);
    if (!adapter) return;

    const streamId = record.session.metadata.streamId;
    const audioFrame = adapter.encodeOutboundAudio(chunk, streamId);
    record.connection.send(audioFrame);

    if (markName !== undefined) {
      const markFrame = adapter.encodeMark(streamId, markName);
      record.connection.send(markFrame);
    }
  }

  sendClear(sessionId: SessionId): void {
    const record = this._connections.get(sessionId);
    if (!record || !record.connection.isConnected) return;

    const adapter = this._adapters.get(record.adapterName);
    if (!adapter) return;

    const clearFrame = adapter.encodeClear(record.session.metadata.streamId);
    record.connection.send(clearFrame);
  }

  send(sessionId: SessionId, message: string): void {
    const record = this._connections.get(sessionId);
    if (!record) return;
    record.connection.send(message);
  }

  async close(sessionId: SessionId, reason = 'requested'): Promise<void> {
    const record = this._connections.get(sessionId);
    if (!record) return;

    this._logger.info('Closing transport connection', { sessionId, reason });
    await record.connection.close(1000, reason);
    this._connections.delete(sessionId);
  }

  disconnect(sessionId: SessionId): void {
    const record = this._connections.get(sessionId);
    if (!record) return;

    record.connection.destroy();
    this._connections.delete(sessionId);
    this._logger.info('Transport connection disconnected', { sessionId });
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;

    this._logger.info('TransportGateway destroying all connections', {
      count: this._connections.size,
    });

    Array.from(this._connections.values()).forEach((record) => {
      try { record.connection.destroy(); } catch { /* swallow */ }
    });

    this._connections.clear();
    this._handlers.clear();
  }

  on<T extends TransportEventType>(
    type: T,
    handler: TransportEventHandler<Extract<TransportEvent, { type: T }>>
  ): void {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type)!.add(handler as TransportEventHandler);
  }

  off<T extends TransportEventType>(
    type: T,
    handler: TransportEventHandler<Extract<TransportEvent, { type: T }>>
  ): void {
    this._handlers.get(type)?.delete(handler as TransportEventHandler);
  }

  // ─── Private: Connection Wiring ───────────────────────────────────────────

  private _wireConnectionCallbacks(
    record: ConnectionRecord,
    adapter: ITransportAdapter
  ): void {
    const { session, connection, mediaSession } = record;
    const { sessionId, callSid } = session.id;

    const emit: TransportEventEmitter = (event: TransportEvent) => {
      this._routeEvent(event, mediaSession);
      this._emitToSubscribers(event);
    };

    connection.onMessage((raw, receivedAt) => {
      session.lastActivityAt = receivedAt;
      try {
        adapter.handleMessage(raw, session, emit);
      } catch (err) {
        this._logger.error('Adapter handleMessage threw unexpectedly', {
          sessionId,
          error: String(err),
        });
      }
    });

    connection.onConnected((at) => {
      session.connectionState = 'connected';
      this._logger.info('Transport connection established', { sessionId, callSid, at });
    });

    connection.onDisconnected((code, reason, clean) => {
      session.connectionState = 'disconnected';
      this._logger.info('Transport connection closed', {
        sessionId, callSid, code, reason, clean,
      });

      this._emitToSubscribers({
        type: 'transport.disconnected',
        timestamp: Date.now(),
        sessionId,
        callSid,
        code,
        reason,
        clean,
      });

      this._connections.delete(sessionId);

      // Signal completion to the MediaSession if not already done.
      try {
        mediaSession.complete('transport_disconnected').catch(() => undefined);
      } catch { /* swallow */ }
    });

    connection.onPong((rttMs) => {
      session.recordPongReceived(Date.now());
      this._emitToSubscribers({
        type: 'transport.heartbeat',
        timestamp: Date.now(),
        sessionId,
        callSid,
        rttMs,
      });
    });

    connection.onBackpressure((depth, dropped) => {
      this._logger.warn('TransportGateway: send queue overflow — message dropped', {
        sessionId, queueDepth: depth, dropped: dropped.slice(0, 64),
      });
    });

    connection.onError((err) => {
      this._logger.error('TransportConnection error', {
        sessionId, error: err.message,
      });
      this._emitToSubscribers({
        type: 'transport.error',
        timestamp: Date.now(),
        sessionId,
        callSid,
        errorCode: 'CONNECTION_ERROR',
        errorMessage: err.message,
        retryable: false,
      });
    });
  }

  // ─── Private: Event Routing ────────────────────────────────────────────────

  /**
   * Routes a decoded transport event to the appropriate `IMediaSession` method.
   * This is the ONLY place where the Transport Layer calls into MediaSession.
   */
  private _routeEvent(event: TransportEvent, mediaSession: IMediaSession): void {
    switch (event.type) {
      case 'transport.audio_received': {
        const chunk = createAudioChunk({
          sequence: event.sequence,
          timestamp: event.timestamp,
          sampleRate: event.sampleRate,
          encoding: event.encoding as 'mulaw' | 'pcm' | 'pcm16' | 'linear16' | 'alaw' | 'opus',
          durationMs: this._estimateDurationMs(event.base64Payload, event.sampleRate),
          payload: event.base64Payload,
          payloadFormat: 'base64',
          direction: 'inbound',
          trackId: event.trackId,
        });
        mediaSession.deliverInboundAudio(chunk, event.timestamp);
        break;
      }

      case 'transport.call_ended': {
        mediaSession.complete(event.reason).catch(() => undefined);
        break;
      }

      case 'transport.dtmf_received':
      case 'transport.mark_acknowledged':
      case 'transport.heartbeat':
      case 'transport.connected':
      case 'transport.disconnected':
      case 'transport.reconnecting':
      case 'transport.error':
        // These events are forwarded to global subscribers only.
        break;
    }
  }

  // ─── Private: Helpers ─────────────────────────────────────────────────────

  private _resolveAdapter(name: string): ITransportAdapter {
    const adapter = this._adapters.get(name);
    if (!adapter) {
      throw new Error(
        `TransportGateway: no adapter registered for protocol '${name}'. ` +
          `Registered: [${Array.from(this._adapters.keys()).join(', ')}]`
      );
    }
    return adapter;
  }

  private _assertNotDestroyed(method: string): void {
    if (this._destroyed) {
      throw new Error(`TransportGateway.${method}() called after destroy()`);
    }
  }

  private _emitToSubscribers(event: TransportEvent): void {
    const handlers = this._handlers.get(event.type);
    if (!handlers) return;
    Array.from(handlers).forEach((h) => {
      try { h(event); } catch { /* swallow */ }
    });
  }

  /**
   * Estimates the audio duration of a base64-encoded μ-law or PCM payload.
   * μ-law: 1 byte per sample at the declared sample rate.
   * PCM16: 2 bytes per sample.
   */
  private _estimateDurationMs(base64Payload: string, sampleRate: number): number {
    if (sampleRate <= 0 || base64Payload.length === 0) return 0;
    const byteLength = Math.floor(base64Payload.length * 0.75);
    return Math.round((byteLength / sampleRate) * 1000);
  }
}
