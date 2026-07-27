/**
 * Short-lived maps used to correlate a test call with its campaignId.
 *
 * Two strategies (both set on call initiation, both checked on start event):
 *   callSidMap  — keyed by Exotel CallSid (most reliable; exact match)
 *   phoneCallMap — keyed by normalised phone number (fallback)
 */

/** CallSid → campaignId  (primary lookup) */
export const callSidMap = new Map<string, string>();

/** Normalised phone → campaignId  (fallback lookup) */
export const phoneCallMap = new Map<string, string>();

/**
 * CallSid → termination timer handle.
 * Set when a call starts, cleared when the webhook fires (call ended naturally).
 * If credits run out before the call ends, the timer fires and hangs up via Exotel API.
 */
export const callCreditTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Normalise a phone number to its last 10 digits.
 * Delegates to the shared canonical helper in phoneUtils.
 */
export { normalizePhoneNumber as normalizePhone } from './phoneUtils';
