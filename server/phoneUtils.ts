/**
 * Shared phone/callSid utilities for the V2 router and session registry.
 *
 * These helpers are the SINGLE source of truth for normalization so that
 * every layer (router, coordinator, registry) operates on the same canonical
 * representation and lookups always match.
 */

/**
 * Normalize a phone number to its canonical 10-digit form.
 *
 * Rules applied in order:
 *   1. Strip all non-digit characters (spaces, hyphens, parentheses, +)
 *   2. Remove a leading country-code 91 (India) if the result is > 10 digits
 *   3. Remove a leading 0 if the result is still > 10 digits
 *   4. Return the last 10 digits
 *
 * Examples:
 *   +919893328298  →  9893328298
 *    919893328298  →  9893328298
 *    09893328298   →  9893328298
 *    9893328298    →  9893328298
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-10);
}

/**
 * Extract the telephony call SID from a parsed Exotel WebSocket message.
 *
 * Supports all known field-name variants across Exotel API versions:
 *   message.start.call_sid | message.start.callSid | message.start.CallSid
 *   message.call_sid       | message.callSid       | message.CallSid
 *
 * @returns The trimmed call SID string, or null if absent/empty.
 */
export function extractCallSid(message: Record<string, any>): string | null {
  const start = message?.start ?? {};
  const raw: string =
    start.call_sid   ||
    start.callSid    ||
    start.CallSid    ||
    message.call_sid ||
    message.callSid  ||
    message.CallSid  ||
    '';
  const trimmed = String(raw).trim();
  return trimmed || null;
}
