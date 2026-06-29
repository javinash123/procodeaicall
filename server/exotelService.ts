import axios from "axios";

const EXOTEL_SID       = process.env.EXOTEL_SID       || "nijvox1";
const EXOTEL_API_KEY   = process.env.EXOTEL_API_KEY   || "a6d6fc20da41f7bf3be9c45cbc74df118faba5983c56b290";
const EXOTEL_API_TOKEN = process.env.EXOTEL_API_TOKEN || "9ec44c27c506218f06d46d2dee4af0d05fdaf714955e3b87";
const EXOTEL_PHONE     = process.env.EXOTEL_PHONE     || "+918047359287";
const EXOTEL_APP_SID   = process.env.EXOTEL_APP_SID   || "1213707";

export interface ExotelCallResult {
  success: boolean;
  data?: any;
  error?: string;
  callSid?: string;
  wssUrl?: string;
}

/** Build the current public base URL (HTTPS) for this server */
export function getPublicBase(): string {
  return (
    process.env.PUBLIC_URL ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null) ||
    "https://nijvox.com"
  );
}

/** Build the current WSS URL for the Exotel bidirectional stream */
export function getWssUrl(): string {
  return getPublicBase().replace(/^https?:\/\//, "wss://") + "/exotel-stream";
}

/**
 * Push the current WSS URL into the Exotel-hosted ExoML app so it always
 * points at this server.  Exotel reliably fetches its own hosted apps, so
 * this approach is more robust than passing our URL directly in the call API.
 *
 * If the update API call fails (unknown format, permission issue, etc.) we log
 * a warning with the manual-update instructions and continue — the call will
 * still be placed, it just won't be interactive yet.
 */
export async function updateExotelAppStreamUrl(): Promise<void> {
  const wssUrl = getWssUrl();
  console.log(`[Exotel] Updating app (${EXOTEL_APP_SID}) stream URL → ${wssUrl}`);

  const tryUpdate = async (method: "put" | "post", urlSuffix: string) => {
    const apiUrl = `https://api.exotel.com/v1/Accounts/${EXOTEL_SID}/${urlSuffix}`;
    const body   = new URLSearchParams({ Url: wssUrl });
    const auth   = { username: EXOTEL_API_KEY, password: EXOTEL_API_TOKEN };
    const resp   = await axios({ method, url: apiUrl, data: body, auth });
    return resp.status;
  };

  // Try PUT /Apps/{id} first, then POST as fallback (Exotel API varies by version)
  for (const [method, suffix] of [
    ["put",  `Apps/${EXOTEL_APP_SID}`],
    ["post", `Apps/${EXOTEL_APP_SID}`],
  ] as const) {
    try {
      const status = await tryUpdate(method, suffix);
      console.log(`[Exotel] App stream URL updated (HTTP ${status})`);
      return;
    } catch (err: any) {
      const msg = err.response?.data || err.message;
      console.warn(`[Exotel] ${method.toUpperCase()} ${suffix} failed: ${JSON.stringify(msg)}`);
    }
  }

  // Both attempts failed — print manual instructions
  console.warn(
    `[Exotel] ⚠️  Could not auto-update Exotel app stream URL.\n` +
    `  → Open Exotel dashboard → App Builder → app ID ${EXOTEL_APP_SID}\n` +
    `  → Set the Stream / WebSocket URL to:\n` +
    `      ${wssUrl}`
  );
}

export async function makeExotelCall(toNumber: string): Promise<ExotelCallResult> {
  console.log("Calling number:", toNumber);

  // Step 1: Push current WSS URL into the Exotel-hosted ExoML app
  await updateExotelAppStreamUrl();

  const wssUrl = getWssUrl();

  // Step 2: Place the outbound call using the Exotel App Builder app.
  //
  // Exotel's Calls/connect (without a To party) always uses the Exophone's
  // configured App Builder app (EXOTEL_APP_SID) — the Url parameter is ignored.
  // The App Builder app must have its WebSocket URL updated in the Exotel
  // dashboard to point to the current server (see startup log for the URL).
  const callUrl     = `https://api.exotel.com/v1/Accounts/${EXOTEL_SID}/Calls/connect`;
  const exomlAppUrl = `http://my.exotel.com/${EXOTEL_SID}/exoml/start_voice/${EXOTEL_APP_SID}`;

  const params = new URLSearchParams();
  params.append("From",     toNumber);     // Customer number to be called
  params.append("CallerId", EXOTEL_PHONE); // Exophone shown to customer
  params.append("Url",      exomlAppUrl);  // Exotel App Builder app (explicit, belt-and-suspenders)

  console.log("CUSTOMER =", toNumber);
  console.log("CALLERID =", EXOTEL_PHONE);
  console.log("[Exotel] App URL:", exomlAppUrl);
  console.log("[Exotel] WSS URL :", wssUrl, "← update this in Exotel dashboard");

  try {
    const response = await axios.post(callUrl, params, {
      auth: { username: EXOTEL_API_KEY, password: EXOTEL_API_TOKEN },
    });

    console.log("[Exotel] Call response:", JSON.stringify(response.data));
    const sidMatch = typeof response.data === "string"
      ? response.data.match(/<Sid>([^<]+)<\/Sid>/)
      : null;
    const callSid = sidMatch?.[1] ?? "";
    if (callSid) console.log("[Exotel] CallSid:", callSid);
    return { success: true, data: response.data, callSid, wssUrl };
  } catch (error: any) {
    const errMsg = error.response?.data || error.message || "Unknown error";
    console.error("[Exotel] Call failed:", errMsg);
    return { success: false, error: JSON.stringify(errMsg), wssUrl };
  }
}
