/**
 * @module VoiceEngineEvents
 *
 * Strongly typed event definitions emitted by the `VoiceEngine`.
 *
 * ## Purpose
 * `VoiceEngineEvents` defines the observable surface of the engine's
 * lifecycle. Every state transition in `VoiceEngineLifecycle` produces
 * exactly one of these events, allowing the application layer to react
 * to engine state changes without polling.
 *
 * ## Rules
 * - Events carry NO provider-specific fields.
 * - Events carry NO Exotel or OpenAI references.
 * - Events are immutable value objects; subscribers must not mutate them.
 * - All events are frozen on construction (enforced by callers).
 *
 * ## Usage
 * ```typescript
 * engine.on('engine.ready', (event) => {
 *   logger.info('Voice engine is ready', { engineId: event.engineId });
 * });
 * ```
 */

import type { Timestamp } from '../types/index.js';
import type { VoiceEngineLifecycleState } from './VoiceEngineLifecycle.js';
import type { ReadyStatus } from '../monitoring/index.js';

// ─── Base ─────────────────────────────────────────────────────────────────────

/** Fields common to every voice engine event. */
interface BaseEngineEvent {
  /** Monotonic millisecond timestamp when the event was created. */
  readonly timestamp: Timestamp;
  /** Unique identifier for this engine instance. */
  readonly engineId: string;
}

// ─── Lifecycle Events ─────────────────────────────────────────────────────────

/**
 * Emitted when the engine begins its initialisation sequence.
 * The engine is not yet ready to accept connections.
 */
export interface EngineInitializingEvent extends BaseEngineEvent {
  readonly type: 'engine.initializing';
}

/**
 * Emitted when the engine has fully initialised and is ready to accept
 * WebSocket connections. All providers are wired and health checks pass.
 */
export interface EngineReadyEvent extends BaseEngineEvent {
  readonly type: 'engine.ready';
  /** Aggregated health status at the moment the engine became ready. */
  readonly readyStatus: ReadyStatus;
}

/**
 * Emitted when the engine transitions from READY to RUNNING.
 * The transport gateway is open and the engine is actively serving calls.
 */
export interface EngineStartedEvent extends BaseEngineEvent {
  readonly type: 'engine.started';
  /** Wall-clock timestamp when the engine started serving traffic. */
  readonly startedAt: Timestamp;
}

/**
 * Emitted when the engine has completed a graceful stop.
 * No active calls remain; the transport gateway has been closed.
 */
export interface EngineStoppedEvent extends BaseEngineEvent {
  readonly type: 'engine.stopped';
  /** Human-readable reason for the stop (e.g. 'sigterm', 'requested'). */
  readonly reason: string;
  /** Number of active sessions that were gracefully drained. */
  readonly drainedSessions: number;
  /** Total wall-clock duration of the stop sequence in milliseconds. */
  readonly stopDurationMs: number;
}

/**
 * Emitted after all resources have been released and the engine instance
 * can be discarded. No further events will follow.
 */
export interface EngineDestroyedEvent extends BaseEngineEvent {
  readonly type: 'engine.destroyed';
}

/**
 * Emitted when the engine encounters an unrecoverable error.
 * The engine transitions to the FAILED state and must be destroyed.
 */
export interface EngineFailedEvent extends BaseEngineEvent {
  readonly type: 'engine.failed';
  /** Machine-readable error code. */
  readonly errorCode: string;
  /** Human-readable error description. */
  readonly errorMessage: string;
  /** The lifecycle state at the time of failure. */
  readonly failedInState: VoiceEngineLifecycleState;
  /** Whether the failure is potentially recoverable by destroy + rebuild. */
  readonly recoverable: boolean;
}

// ─── Union & Helpers ──────────────────────────────────────────────────────────

/** Discriminated union of all voice engine events. */
export type VoiceEngineEvent =
  | EngineInitializingEvent
  | EngineReadyEvent
  | EngineStartedEvent
  | EngineStoppedEvent
  | EngineDestroyedEvent
  | EngineFailedEvent;

/** Maps each event type literal to its concrete event interface. */
export type VoiceEngineEventMap = {
  [E in VoiceEngineEvent as E['type']]: E;
};

/** Union of all event type string literals. */
export type VoiceEngineEventType = VoiceEngineEvent['type'];

/** Handler signature for voice engine events. */
export type VoiceEngineEventHandler<T extends VoiceEngineEvent = VoiceEngineEvent> = (
  event: T
) => void;

/** Typed event bus interface for the VoiceEngine. */
export interface IVoiceEngineEventBus {
  /**
   * Subscribes to a specific voice engine event type.
   *
   * @param type    - The event type string to subscribe to.
   * @param handler - Callback invoked for each matching event.
   */
  on<T extends VoiceEngineEventType>(
    type: T,
    handler: VoiceEngineEventHandler<VoiceEngineEventMap[T]>
  ): void;

  /**
   * Unsubscribes from a specific voice engine event type.
   *
   * @param type    - The event type string to unsubscribe from.
   * @param handler - The exact handler reference to remove.
   */
  off<T extends VoiceEngineEventType>(
    type: T,
    handler: VoiceEngineEventHandler<VoiceEngineEventMap[T]>
  ): void;

  /**
   * Emits an event to all registered subscribers for its type.
   * Swallows any handler exceptions.
   *
   * @param event - The event to dispatch.
   */
  emit(event: VoiceEngineEvent): void;
}

/**
 * Production implementation of `IVoiceEngineEventBus`.
 */
export class VoiceEngineEventBus implements IVoiceEngineEventBus {
  private readonly _handlers = new Map<
    VoiceEngineEventType,
    Set<VoiceEngineEventHandler>
  >();

  on<T extends VoiceEngineEventType>(
    type: T,
    handler: VoiceEngineEventHandler<VoiceEngineEventMap[T]>
  ): void {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type)!.add(handler as VoiceEngineEventHandler);
  }

  off<T extends VoiceEngineEventType>(
    type: T,
    handler: VoiceEngineEventHandler<VoiceEngineEventMap[T]>
  ): void {
    this._handlers.get(type)?.delete(handler as VoiceEngineEventHandler);
  }

  emit(event: VoiceEngineEvent): void {
    const handlers = this._handlers.get(event.type);
    if (!handlers) return;
    Array.from(handlers).forEach((h) => {
      try { h(event); } catch { /* swallow */ }
    });
  }

  /** Removes all subscriptions. Safe to call at any point. */
  clear(): void {
    this._handlers.clear();
  }
}
