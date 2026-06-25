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
 * Normalise a phone number to its last 10 digits so that
 *   "+919893328298", "919893328298", "09893328298", "9893328298"
 * all hash to the same key "9893328298".
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-10);
}
