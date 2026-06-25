import axios from "axios";

const EXOTEL_SID       = process.env.EXOTEL_SID       || "nijvox1";
const EXOTEL_API_KEY   = process.env.EXOTEL_API_KEY   || "a6d6fc20da41f7bf3be9c45cbc74df118faba5983c56b290";
const EXOTEL_API_TOKEN = process.env.EXOTEL_API_TOKEN || "9ec44c27c506218f06d46d2dee4af0d05fdaf714955e3b87";

export interface ExotelCallResult {
  success: boolean;
  data?: any;
  error?: string;
  callSid?: string; // Exotel CallSid extracted from XML response
}

const EXOTEL_PHONE = process.env.EXOTEL_PHONE || "+918047359287";

export async function makeExotelCall(toNumber: string): Promise<ExotelCallResult> {
  console.log("Calling number:", toNumber);

  const url = `https://api.exotel.com/v1/Accounts/${EXOTEL_SID}/Calls/connect`;

  const params = new URLSearchParams();
  params.append("From",     toNumber);       // Customer number to be called
  params.append("CallerId", EXOTEL_PHONE);   // Exophone shown to customer
  // Use the Exotel-hosted ExoML app — this is what Exotel fetches when the
  // customer answers. The app is configured in Exotel's dashboard to start
  // a bidirectional stream to wss://nijvox.com/exotel-stream.
  params.append("Url", "http://my.exotel.com/nijvox1/exoml/start_voice/1213707");

  console.log("CUSTOMER =", toNumber);
  console.log("CALLERID =", EXOTEL_PHONE);

  try {
    const response = await axios.post(url, params, {
      auth: {
        username: EXOTEL_API_KEY,
        password: EXOTEL_API_TOKEN,
      },
    });

    console.log("[Exotel] Call response:", JSON.stringify(response.data));
    // Extract CallSid from Exotel's XML response (used to map campaignId reliably)
    const sidMatch = typeof response.data === "string"
      ? response.data.match(/<Sid>([^<]+)<\/Sid>/)
      : null;
    const callSid = sidMatch?.[1] ?? "";
    if (callSid) console.log("[Exotel] CallSid:", callSid);
    return { success: true, data: response.data, callSid };
  } catch (error: any) {
    const errMsg = error.response?.data || error.message || "Unknown error";
    console.error("[Exotel] Call failed:", errMsg);
    return { success: false, error: JSON.stringify(errMsg) };
  }
}
