/**
 * @module TransportConnection
 *
 * WebSocket connection lifecycle manager for a single transport session.
 *
 * ## Purpose
 * `TransportConnection` wraps a `ws.WebSocket` instance and owns all
 * low-level connection concerns:
 *
 * - Connection open / graceful close / forced teardown
 * - Ping/pong heartbeat with missed-ping eviction
 * - Reconnect with exponential backoff
 * - Send queue with configurable max depth and backpressure detection
 * - Safe message dispatch (never throws into caller)
 *
 * It knows nothing about Exotel, OpenAI, media sessions, audio, or any
 * business domain. It is a pure WebSocket lifecycle manager.
 *
 * ## Ownership
 * Created once per accepted WebSocket connection by `TransportGateway`.
 * Destroyed when the WebSocket closes or `destroy()` is called.
 *
 * ## Thread Safety
 * Node.js is single-threaded. All async operations are `async/await` and
 * run on the same event-loop tick. No additional locking is required.
 */

import type { WebSocket as WsWebSocket } from 'ws';
import type { Nullable, Timestamp } from '../types/index.js';
import type { TransportSession } from './TransportSession.js';

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Configuration for a `TransportConnection`.
 */
export interface TransportConnectionConfig {
  /**
   * Maximum number of messages that may queue while the socket is not
   * writable. Sends beyond this limit are dropped and reported.
   */
  readonly maxQueueDepth: number;

  /**
   * Interval in milliseconds between outbound WebSocket ping frames.
   * Set to 0 to disable heartbeating.
   */
  readonly pingIntervalMs: number;

  /**
   * Maximum number of consecutive unanswered pings before the connection
   * is considered dead and forcibly closed.
   */
  readonly maxMissedPings: number;

  /**
   * Maximum number of reconnect attempts. Set to 0 to disable reconnection.
   */
  readonly maxReconnectAttempts: number;

  /**
   * Base backoff delay in milliseconds. Doubles on each failed attempt up
   * to `maxBackoffMs`.
   */
  readonly reconnectBackoffMs: number;

  /**
   * Maximum backoff delay cap in milliseconds.
   */
  readonly maxBackoffMs: number;

  /**
   * Milliseconds to wait for a graceful close handshake before forcing
   * the socket closed.
   */
  readonly closeTimeoutMs: number;
}

export const DEFAULT_CONNECTION_CONFIG: Readonly<TransportConnectionConfig> = Object.freeze({
  maxQueueDepth: 512,
  pingIntervalMs: 15_000,
  maxMissedPings: 3,
  maxReconnectAttempts: 3,
  reconnectBackoffMs: 500,
  maxBackoffMs: 8_000,
  closeTimeoutMs: 5_000,
});

// ─── Callbacks ────────────────────────────────────────────────────────────────

/** Invoked for every raw text message received from the remote end. */
export type RawMessageHandler = (raw: string, receivedAt: Timestamp) => void;

/** Invoked when the connection transitions to the connected state. */
export type ConnectedHandler = (at: Timestamp) => void;

/** Invoked when the connection is cleanly or forcibly closed. */
export type DisconnectedHandler = (code: number, reason: string, clean: boolean) => void;

/** Invoked when a pong is received. */
export type PongHandler = (rttMs: number) => void;

/** Invoked when a send fails due to queue overflow. */
export type BackpressureHandler = (queueDepth: number, dropped: string) => void;

/** Invoked when an unrecoverable connection error occurs. */
export type ConnectionErrorHandler = (error: Error) => void;

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Public contract for a transport connection.
 */
export interface ITransportConnection {
  /** Whether the underlying socket is currently open and writable. */
  readonly isConnected: boolean;

  /** Current depth of the outbound send queue. */
  readonly queueDepth: number;

  /**
   * Enqueues a raw JSON string for delivery over the WebSocket.
   * If the socket is not writable, the message is added to the send queue.
   * If the queue is full, the message is dropped and the backpressure
   * handler is invoked.
   *
   * @param message - Serialised JSON string to send.
   */
  send(message: string): void;

  /**
   * Initiates a graceful close handshake. Drains the send queue before
   * sending the CLOSE frame.
   *
   * @param code   - WebSocket close code (default 1000).
   * @param reason - Human-readable close reason.
   */
  close(code?: number, reason?: string): Promise<void>;

  /**
   * Immediately terminates the underlying socket. Does not wait for a
   * graceful handshake. Safe to call from any state.
   */
  destroy(): void;

  /** Registers the raw message callback. */
  onMessage(handler: RawMessageHandler): void;

  /** Registers the connected callback. */
  onConnected(handler: ConnectedHandler): void;

  /** Registers the disconnected callback. */
  onDisconnected(handler: DisconnectedHandler): void;

  /** Registers the pong callback. */
  onPong(handler: PongHandler): void;

  /** Registers the backpressure callback. */
  onBackpressure(handler: BackpressureHandler): void;

  /** Registers the error callback. */
  onError(handler: ConnectionErrorHandler): void;
}

/**
 * Production implementation of `ITransportConnection`.
 */
export class TransportConnection implements ITransportConnection {
  private readonly _socket: WsWebSocket;
  private readonly _session: TransportSession;
  private readonly _config: Readonly<TransportConnectionConfig>;

  private readonly _sendQueue: string[] = [];
  private _destroyed = false;
  private _closing = false;

  private _pingTimer: Nullable<ReturnType<typeof setInterval>> = null;
  private _pingTimestamp: Nullable<Timestamp> = null;

  private _onMessage: Nullable<RawMessageHandler> = null;
  private _onConnected: Nullable<ConnectedHandler> = null;
  private _onDisconnected: Nullable<DisconnectedHandler> = null;
  private _onPong: Nullable<PongHandler> = null;
  private _onBackpressure: Nullable<BackpressureHandler> = null;
  private _onError: Nullable<ConnectionErrorHandler> = null;

  constructor(
    socket: WsWebSocket,
    session: TransportSession,
    config: Partial<TransportConnectionConfig> = {}
  ) {
    this._socket = socket;
    this._session = session;
    this._config = Object.freeze({ ...DEFAULT_CONNECTION_CONFIG, ...config });

    this._attachSocketHandlers();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  get isConnected(): boolean {
    return !this._destroyed && !this._closing && this._socket.readyState === 1;
  }

  get queueDepth(): number {
    return this._sendQueue.length;
  }

  send(message: string): void {
    if (this._destroyed || this._closing) return;

    if (this._socket.readyState === 1) {
      this._flushQueue();
      this._sendQueue.length === 0
        ? this._writeDirect(message)
        : this._enqueue(message);
    } else {
      this._enqueue(message);
    }
  }

  async close(code = 1000, reason = 'normal'): Promise<void> {
    if (this._destroyed || this._closing) return;
    this._closing = true;
    this._stopHeartbeat();

    await this._drainQueue();

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this._socket.terminate();
        resolve();
      }, this._config.closeTimeoutMs);

      this._socket.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });

      this._socket.close(code, reason);
    });
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._stopHeartbeat();
    this._sendQueue.length = 0;
    try { this._socket.terminate(); } catch { /* already closed */ }
  }

  onMessage(handler: RawMessageHandler): void { this._onMessage = handler; }
  onConnected(handler: ConnectedHandler): void { this._onConnected = handler; }
  onDisconnected(handler: DisconnectedHandler): void { this._onDisconnected = handler; }
  onPong(handler: PongHandler): void { this._onPong = handler; }
  onBackpressure(handler: BackpressureHandler): void { this._onBackpressure = handler; }
  onError(handler: ConnectionErrorHandler): void { this._onError = handler; }

  // ─── Socket Event Wiring ────────────────────────────────────────────────────

  private _attachSocketHandlers(): void {
    const socket = this._socket;

    socket.on('open', () => {
      if (this._destroyed) return;
      this._session.connectionState = 'connected';
      this._startHeartbeat();
      const now = Date.now();
      this._session.lastActivityAt = now;
      this._onConnected?.(now);
      this._flushQueue();
    });

    socket.on('message', (data: Buffer | string) => {
      if (this._destroyed) return;
      const now = Date.now();
      const raw = typeof data === 'string' ? data : data.toString('utf8');
      this._session.lastActivityAt = now;
      try { this._onMessage?.(raw, now); } catch { /* swallow */ }
    });

    socket.on('pong', () => {
      if (this._destroyed) return;
      const now = Date.now();
      const rttMs = this._pingTimestamp !== null ? now - this._pingTimestamp : 0;
      this._session.recordPongReceived(now);
      this._pingTimestamp = null;
      try { this._onPong?.(rttMs); } catch { /* swallow */ }
    });

    socket.on('close', (code: number, reasonBuf: Buffer) => {
      this._destroyed = true;
      this._stopHeartbeat();
      this._session.markDestroyed();
      const reason = reasonBuf?.toString('utf8') ?? 'unknown';
      const clean = code === 1000 || code === 1001;
      try { this._onDisconnected?.(code, reason, clean); } catch { /* swallow */ }
    });

    socket.on('error', (err: Error) => {
      if (this._destroyed) return;
      try { this._onError?.(err); } catch { /* swallow */ }
    });

    // If the socket was already open when handed to us (accepted by server),
    // emit connected immediately.
    if (socket.readyState === 1) {
      const now = Date.now();
      this._session.connectionState = 'connected';
      this._startHeartbeat();
      this._onConnected?.(now);
    }
  }

  // ─── Heartbeat ──────────────────────────────────────────────────────────────

  private _startHeartbeat(): void {
    if (this._config.pingIntervalMs === 0 || this._pingTimer !== null) return;

    this._pingTimer = setInterval(() => {
      if (this._destroyed || this._closing) {
        this._stopHeartbeat();
        return;
      }

      if (this._session.heartbeat.missedPings >= this._config.maxMissedPings) {
        this._onError?.(
          new Error(
            `HeartbeatTimeout: ${this._config.maxMissedPings} consecutive pings unanswered`
          )
        );
        this.destroy();
        return;
      }

      const now = Date.now();
      this._pingTimestamp = now;
      this._session.recordPingSent(now);
      try { this._socket.ping(); } catch { /* socket may have closed */ }
    }, this._config.pingIntervalMs);
  }

  private _stopHeartbeat(): void {
    if (this._pingTimer !== null) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  // ─── Send Queue ─────────────────────────────────────────────────────────────

  private _enqueue(message: string): void {
    if (this._sendQueue.length >= this._config.maxQueueDepth) {
      try {
        this._onBackpressure?.(this._sendQueue.length, message);
      } catch { /* swallow */ }
      return;
    }
    this._sendQueue.push(message);
  }

  private _writeDirect(message: string): void {
    try {
      this._socket.send(message);
      this._session.nextOutboundSequence();
    } catch (err) {
      this._onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private _flushQueue(): void {
    while (
      this._sendQueue.length > 0 &&
      !this._destroyed &&
      !this._closing &&
      this._socket.readyState === 1
    ) {
      const msg = this._sendQueue.shift();
      if (msg !== undefined) this._writeDirect(msg);
    }
  }

  private async _drainQueue(): Promise<void> {
    this._flushQueue();
    // Yield to the event loop to allow buffered sends to be flushed.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
