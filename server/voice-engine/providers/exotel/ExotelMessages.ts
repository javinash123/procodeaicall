/**
 * @module ExotelMessages
 *
 * Complete type definitions for every Exotel WebSocket protocol message.
 *
 * ## Purpose
 * This module is the ONLY place in Voice Engine V2 that has knowledge of
 * the Exotel wire protocol. Every field name, every event type string,
 * and every optional field variant that Exotel may send is declared here.
 *
 * Any future Exotel protocol changes need only be reflected in this file
 * and in `ExotelProtocol.ts`. All higher layers remain unaffected.
 *
 * ## Rules
 * - No OpenAI imports.
 * - No business logic.
 * - No audio processing.
 * - Pure data type declarations.
 *
 * ## References
 * Exotel Bidirectional Streaming WebSocket protocol:
 * - Inbound:  connected → start → media* → stop
 * - Outbound: media / mark / clear
 * - Bidirectional: heartbeat / dtmf
 */

// ─── Shared Sub-types ─────────────────────────────────────────────────────────

/**
 * Audio format descriptor sent in the `start` message.
 * Exotel uses inconsistent casing across SDK versions; both variants are
 * declared so `ExotelProtocol` can normalise them.
 */
export interface ExotelMediaFormat {
  /** Audio encoding, e.g. "mulaw", "pcm". */
  readonly encoding?: string;
  /** Sample rate in Hz (camelCase variant). */
  readonly sampleRate?: number | string;
  /** Sample rate in Hz (snake_case variant). */
  readonly sample_rate?: number | string;
  /** Number of audio channels (almost always 1 for telephony). */
  readonly channels?: number | string;
}

// ─── Inbound Messages (Exotel → Engine) ──────────────────────────────────────

/**
 * First message Exotel sends on WebSocket open.
 * Confirms the WebSocket handshake and provides the streamSid.
 */
export interface ExotelConnectedMessage {
  readonly event: 'connected';
  /** Exotel protocol version string (e.g. "1.0.0"). */
  readonly protocol?: string;
  /** Exotel SDK/API version string. */
  readonly version?: string;
}

/**
 * Sent by Exotel immediately after `connected`.
 * Contains call identity and audio format negotiation.
 */
export interface ExotelStartMessage {
  readonly event: 'start';
  /** Unique stream identifier for this call leg. */
  readonly streamSid: string;
  /** Exotel account SID. */
  readonly accountSid?: string;
  /** Exotel call SID. */
  readonly callSid?: string;
  /** Nested start payload (alternate structure used by some SDK versions). */
  readonly start?: {
    readonly streamSid?: string;
    readonly callSid?: string;
    readonly accountSid?: string;
    readonly mediaFormat?: ExotelMediaFormat;
    readonly media_format?: ExotelMediaFormat;
    readonly customParameters?: Readonly<Record<string, string>>;
    readonly custom_parameters?: Readonly<Record<string, string>>;
  };
  /** Audio format (top-level, used by some SDK versions). */
  readonly mediaFormat?: ExotelMediaFormat;
  readonly media_format?: ExotelMediaFormat;
  /** Custom parameters passed in the TwiML/dial verb. */
  readonly customParameters?: Readonly<Record<string, string>>;
  readonly custom_parameters?: Readonly<Record<string, string>>;
  /** Sequential message number. */
  readonly sequenceNumber?: string | number;
}

/**
 * Inbound audio frame from the caller.
 * The payload is always base64-encoded μ-law (or PCM, per `start` negotiation).
 */
export interface ExotelMediaMessage {
  readonly event: 'media';
  /** Stream this media belongs to. */
  readonly streamSid: string;
  /** Sequential message number. */
  readonly sequenceNumber?: string | number;
  readonly media: {
    /** Audio track identifier ("inbound" for caller audio). */
    readonly track?: string;
    /** Sequential chunk number within the stream. */
    readonly chunk?: string | number;
    /** Wall-clock timestamp from Exotel (ms or seconds — varies). */
    readonly timestamp?: string | number;
    /** Base64-encoded audio payload. */
    readonly payload: string;
  };
}

/**
 * Sent by Exotel to acknowledge a `mark` event the engine previously sent.
 * Used to track outbound audio playback progress.
 */
export interface ExotelMarkMessage {
  readonly event: 'mark';
  readonly streamSid: string;
  readonly sequenceNumber?: string | number;
  readonly mark: {
    readonly name: string;
  };
}

/**
 * Sent by Exotel when the call ends (caller hangs up or transfer completes).
 * No further messages will arrive after this.
 */
export interface ExotelStopMessage {
  readonly event: 'stop';
  readonly streamSid: string;
  readonly sequenceNumber?: string | number;
  readonly stop?: {
    readonly accountSid?: string;
    readonly callSid?: string;
  };
}

/**
 * DTMF key press from the caller.
 */
export interface ExotelDtmfMessage {
  readonly event: 'dtmf';
  readonly streamSid: string;
  readonly sequenceNumber?: string | number;
  readonly dtmf: {
    /** The digit pressed (0–9, *, #, A–D). */
    readonly digit: string;
    /** Tone duration in milliseconds. */
    readonly duration?: number;
  };
}

/**
 * Periodic keep-alive / heartbeat sent by Exotel.
 */
export interface ExotelHeartbeatMessage {
  /** Some Exotel versions use "heartbeat", others "ping". */
  readonly event: 'heartbeat' | 'ping';
  readonly streamSid?: string;
  readonly sequenceNumber?: string | number;
}

/**
 * Fallback type for any message whose event type is not recognised.
 * Must NEVER cause the session to crash.
 */
export interface ExotelUnknownMessage {
  readonly event: string;
  readonly streamSid?: string;
  readonly sequenceNumber?: string | number;
  /** Remaining fields are unknown; carry them as-is for logging. */
  readonly [key: string]: unknown;
}

// ─── Outbound Messages (Engine → Exotel) ─────────────────────────────────────

/**
 * Outbound audio frame sent to the caller.
 * payload must be base64-encoded μ-law 8 kHz audio.
 */
export interface ExotelOutboundMediaMessage {
  readonly event: 'media';
  readonly streamSid: string;
  readonly media: {
    readonly payload: string;
  };
}

/**
 * Mark event sent AFTER an audio frame to enable playback progress tracking.
 * Exotel echoes this back as an inbound `mark` message when that audio completes.
 */
export interface ExotelOutboundMarkMessage {
  readonly event: 'mark';
  readonly streamSid: string;
  readonly mark: {
    readonly name: string;
  };
}

/**
 * Clears all buffered audio from Exotel's outbound queue.
 * Used to implement barge-in: sent immediately when the caller interrupts.
 */
export interface ExotelOutboundClearMessage {
  readonly event: 'clear';
  readonly streamSid: string;
}

// ─── Discriminated Union ──────────────────────────────────────────────────────

/**
 * Discriminated union of all INBOUND Exotel messages.
 */
export type ExotelInboundMessage =
  | ExotelConnectedMessage
  | ExotelStartMessage
  | ExotelMediaMessage
  | ExotelMarkMessage
  | ExotelStopMessage
  | ExotelDtmfMessage
  | ExotelHeartbeatMessage
  | ExotelUnknownMessage;

/**
 * Discriminated union of all OUTBOUND Exotel messages.
 */
export type ExotelOutboundMessage =
  | ExotelOutboundMediaMessage
  | ExotelOutboundMarkMessage
  | ExotelOutboundClearMessage;

/** All known inbound Exotel event type strings. */
export type ExotelInboundEventType =
  | 'connected'
  | 'start'
  | 'media'
  | 'mark'
  | 'stop'
  | 'dtmf'
  | 'heartbeat'
  | 'ping';
