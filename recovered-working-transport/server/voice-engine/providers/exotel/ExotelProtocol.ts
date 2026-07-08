/**
 * @module ExotelProtocol
 *
 * Stateless encode/decode functions for the Exotel WebSocket wire protocol.
 *
 * ## Purpose
 * `ExotelProtocol` is the ONLY module that performs JSON parsing of Exotel
 * messages and JSON serialisation of outbound frames. It is intentionally
 * stateless — it has no knowledge of call sessions, audio engines, or
 * business logic. It simply translates bytes ↔ typed message objects.
 *
 * ## Rules
 * - No OpenAI imports.
 * - No MediaSession imports.
 * - No stateful objects.
 * - All decode functions are defensive — they never throw on malformed input.
 *
 * ## Exotel Protocol Quirks
 * - The `event` field may appear as `event`, `type`, `message_type`, or `action`.
 * - `mediaFormat` and `media_format` are interchangeable (camelCase vs snake_case).
 * - `sampleRate` and `sample_rate` are interchangeable.
 * - Numeric fields sometimes arrive as strings.
 * - The `start` payload may be nested inside `start.start` or at the top level.
 */

import type {
  ExotelInboundMessage,
  ExotelOutboundMediaMessage,
  ExotelOutboundMarkMessage,
  ExotelOutboundClearMessage,
  ExotelMediaFormat,
  ExotelStartMessage,
  ExotelMediaMessage,
} from './ExotelMessages.js';

// ─── Normalised Media Format ──────────────────────────────────────────────────

/**
 * A fully resolved audio format with all fields typed and defaulted.
 */
export interface NormalisedMediaFormat {
  readonly encoding: string;
  readonly sampleRate: number;
  readonly channels: number;
}

// ─── Decode ───────────────────────────────────────────────────────────────────

/**
 * Parses a raw WebSocket message string into a typed `ExotelInboundMessage`.
 *
 * Returns an `ExotelUnknownMessage` if the JSON is malformed or the event
 * type is missing. Never throws.
 *
 * @param raw - Raw text received from the WebSocket.
 */
export function decodeExotelMessage(raw: string): ExotelInboundMessage {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { event: '__parse_error__', raw } as ExotelInboundMessage;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { event: '__invalid__' } as ExotelInboundMessage;
  }

  const obj = parsed as Record<string, unknown>;
  const event = resolveEventType(obj);

  // Stamp the event field onto the parsed object so the discriminated union
  // type guards work correctly downstream.
  return { ...obj, event } as ExotelInboundMessage;
}

/**
 * Resolves the event type from any of the field names Exotel may use.
 *
 * @param obj - Parsed JSON object.
 */
export function resolveEventType(obj: Record<string, unknown>): string {
  return String(
    obj['event'] ??
      obj['type'] ??
      obj['message_type'] ??
      obj['action'] ??
      '__unknown__'
  ).trim();
}

// ─── Media Format Normalisation ───────────────────────────────────────────────

/**
 * Normalises a raw Exotel `start` message into a `NormalisedMediaFormat`.
 *
 * Handles both camelCase and snake_case field names and numeric-as-string
 * variants that appear in different Exotel SDK versions.
 *
 * @param msg - The decoded Exotel `start` message.
 * @returns Resolved media format with defaults applied.
 */
export function normaliseMediaFormat(msg: ExotelStartMessage): NormalisedMediaFormat {
  const raw: ExotelMediaFormat =
    (msg.start?.mediaFormat ??
      msg.start?.media_format ??
      msg.mediaFormat ??
      msg.media_format) ?? {};

  const encoding = String(raw.encoding ?? 'mulaw').toLowerCase();
  const sampleRate = Number(raw.sampleRate ?? raw.sample_rate ?? 8000);
  const channels = Number(raw.channels ?? 1);

  return Object.freeze<NormalisedMediaFormat>({ encoding, sampleRate, channels });
}

/**
 * Extracts the stream identifier from a `start` or `connected`/`media` message.
 *
 * Exotel may place `streamSid` at the top level or inside a `start` nested
 * object. Returns an empty string if not found.
 *
 * @param obj - Parsed Exotel message object.
 */
export function extractStreamSid(obj: Record<string, unknown>): string {
  return String(
    obj['streamSid'] ??
      obj['stream_sid'] ??
      (obj['start'] as Record<string, unknown> | undefined)?.['streamSid'] ??
      ''
  );
}

/**
 * Extracts the call SID from a `start` message.
 *
 * @param msg - The decoded Exotel `start` message.
 */
export function extractCallSid(msg: ExotelStartMessage): string {
  return String(
    msg.start?.callSid ??
      msg.callSid ??
      ''
  );
}

/**
 * Extracts the base64 audio payload from an Exotel `media` message.
 *
 * Tries several field paths used across Exotel SDK versions.
 * Returns `null` if no payload is found.
 *
 * @param msg - The decoded Exotel `media` message.
 */
export function extractMediaPayload(msg: ExotelMediaMessage): string | null {
  return (
    msg.media?.payload ??
    (msg as unknown as Record<string, Record<string, string>>)['media']?.['data'] ??
    null
  );
}

/**
 * Extracts the track identifier from an Exotel `media` message.
 * Defaults to 'inbound' if not present (Exotel default for caller audio).
 *
 * @param msg - The decoded Exotel `media` message.
 */
export function extractTrackId(msg: ExotelMediaMessage): string {
  return String(msg.media?.track ?? 'inbound');
}

// ─── Encode ───────────────────────────────────────────────────────────────────

/**
 * Encodes an outbound audio payload as an Exotel `media` wire frame.
 *
 * @param streamSid     - The stream identifier for this call.
 * @param base64Payload - Base64-encoded μ-law audio chunk.
 * @returns Serialised JSON string ready to send over WebSocket.
 */
export function encodeMediaMessage(
  streamSid: string,
  base64Payload: string
): string {
  const msg: ExotelOutboundMediaMessage = {
    event: 'media',
    streamSid,
    media: { payload: base64Payload },
  };
  return JSON.stringify(msg);
}

/**
 * Encodes an outbound `mark` frame.
 *
 * A mark is sent after an audio chunk to allow Exotel to signal (via an
 * inbound `mark` message) when that audio has finished playing.
 *
 * @param streamSid - The stream identifier for this call.
 * @param name      - Unique mark name (e.g. a UUID or sequence number).
 * @returns Serialised JSON string.
 */
export function encodeMarkMessage(streamSid: string, name: string): string {
  const msg: ExotelOutboundMarkMessage = {
    event: 'mark',
    streamSid,
    mark: { name },
  };
  return JSON.stringify(msg);
}

/**
 * Encodes an outbound `clear` frame.
 *
 * Instructs Exotel to immediately flush all buffered outbound audio.
 * Must be sent on barge-in before queuing new audio.
 *
 * @param streamSid - The stream identifier for this call.
 * @returns Serialised JSON string.
 */
export function encodeClearMessage(streamSid: string): string {
  const msg: ExotelOutboundClearMessage = {
    event: 'clear',
    streamSid,
  };
  return JSON.stringify(msg);
}

/**
 * Validates that a base64 string is non-empty.
 * Does NOT verify the decoded audio content.
 *
 * @param payload - Base64 string to check.
 */
export function isValidBase64Payload(payload: string): boolean {
  return typeof payload === 'string' && payload.length > 0;
}
