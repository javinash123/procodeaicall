import axios from "axios";

const EXOTEL_SID       = process.env.EXOTEL_SID       || "nijvox1";
const EXOTEL_API_KEY   = process.env.EXOTEL_API_KEY   || "a6d6fc20da41f7bf3be9c45cbc74df118faba5983c56b290";
const EXOTEL_API_TOKEN = process.env.EXOTEL_API_TOKEN || "9ec44c27c506218f06d46d2dee4af0d05fdaf714955e3b87";

export interface ExotelCallResult {
  success: boolean;restart the server
  data?: any;
  error?: string;
}

export async function makeExotelCall(toNumber: string): Promise<ExotelCallResult> {
  console.log("Calling number:", toNumber);

  const url = `https://api.exotel.com/v1/Accounts/${EXOTEL_SID}/Calls/connect`;

  const params = new URLSearchParams();
  params.append("From",     "+918047359287");
  params.append("To",       toNumber);
  params.append("CallerId", "+918047359287");
  params.append(
    "Url",
    "https://bc816758-6087-4330-9510-07bbc1c1f88f-00-3usczbtu5lyki.worf.replit.dev/exotel/voice"
  );

  try {
    const response = await axios.post(url, params, {
      auth: {
        username: EXOTEL_API_KEY,
        password: EXOTEL_API_TOKEN,
      },
    });

    console.log("[Exotel] Call response:", JSON.stringify(response.data));
    return { success: true, data: response.data };
  } catch (error: any) {
    const errMsg = error.response?.data || error.message || "Unknown error";
    console.error("[Exotel] Call failed:", errMsg);
    return { success: false, error: JSON.stringify(errMsg) };
  }
}
