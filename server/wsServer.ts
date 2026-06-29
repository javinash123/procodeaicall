import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { URL } from "url";
import { log } from "./index";
import { generateAIResponse, type ConversationMessage, type CampaignData } from "./openaiService";
import { storage } from "./storage";
import { textToSpeech } from "./ttsService";
import { handleExotelStream } from "./exotelStreamHandler";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StreamEvent {
  type: string;
  payload: unknown;
  timestamp: string;
  message?: string;
  campaignId?: string;
}

export interface TextResponse {
  type: "text";
  message: string;
  timestamp: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse a raw WebSocket message into a structured StreamEvent.
 * Handles both JSON objects and plain text strings.
 */
export function parseStreamEvent(raw: string): StreamEvent | null {
  try {
    const parsed = JSON.parse(raw);
    return {
      type:       parsed.type       ?? "text",
      payload:    parsed.payload    ?? parsed,
      timestamp:  parsed.timestamp  ?? new Date().toISOString(),
      message:    typeof parsed.message === "string" ? parsed.message : undefined,
      campaignId: typeof parsed.campaignId === "string" ? parsed.campaignId : undefined,
    };
  } catch {
    // Plain text — treat as a user text message
    return {
      type:      "text",
      payload:   raw,
      timestamp: new Date().toISOString(),
      message:   raw,
    };
  }
}

/**
 * Send a structured text response back to a WebSocket client.
 * No-ops silently if the socket is not open.
 */
export function sendTextResponse(ws: WebSocket, message: string): void {
  if (ws.readyState !== WebSocket.OPEN) return;

  const response: TextResponse = {
    type:      "text",
    message,
    timestamp: new Date().toISOString(),
  };

  ws.send(JSON.stringify(response));
}

/**
 * Convert text to speech and send the audio back through the WebSocket.
 * Sends: { type: "audio", mimeType: "audio/mpeg", audioBase64: "...", timestamp }
 */
async function sendAudioResponse(ws: WebSocket, text: string, voice?: string): Promise<void> {
  if (ws.readyState !== WebSocket.OPEN) return;

  const { audioBase64, mimeType } = await textToSpeech(text, voice);

  ws.send(JSON.stringify({
    type:        "audio",
    mimeType,
    audioBase64,
    timestamp:   new Date().toISOString(),
  }));
}

// ─── AI Reply ────────────────────────────────────────────────────────────────

/**
 * Fetch campaign from DB and call OpenAI to generate a short conversational reply.
 * Falls back to the first available campaign if no campaignId is given.
 */
async function getAIReply(
  userText: string,
  campaignId: string | undefined,
  history: ConversationMessage[]
): Promise<string> {
  // Fetch campaign data
  let campaign: any = null;
  if (campaignId) {
    campaign = await storage.getCampaign(campaignId);
  }
  if (!campaign) {
    campaign = await storage.getAnyCampaign();
  }

  // Build campaignData object for generateAIResponse
  const campaignData: CampaignData = campaign
    ? {
        name:               campaign.name,
        goal:               campaign.goal,
        additionalContext:  campaign.additionalContext || "",
        ai_generated_script: campaign.ai_generated_script || campaign.script || "",
        knowledge_base: [
          ...(campaign.knowledgeBaseTexts || []),
          ...(campaign.knowledgeBaseFiles || [])
            .map((f: any) => f.extractedText)
            .filter(Boolean),
        ].join("\n\n"),
      }
    : { goal: "sales" };

  const result = await generateAIResponse(history, userText, campaignData);
  return result.reply;
}

// ─── /stream connection handler ──────────────────────────────────────────────

function attachStreamHandlers(wss: WebSocketServer, ws: WebSocket, clientIp: string): void {
  const conversationHistory: ConversationMessage[] = [];

  sendTextResponse(ws, "Connected to NIJVOX AI stream. Send a message to begin.");

  ws.on("message", async (data) => {
    const raw   = data.toString();
    const event = parseStreamEvent(raw);

    if (!event) {
      log(`Unparseable message from [${clientIp}]: ${raw}`, "ws");
      return;
    }

    const userText: string =
      event.message ||
      (typeof event.payload === "string" ? event.payload : JSON.stringify(event.payload));

    log(`[${clientIp}] type=${event.type} campaignId=${event.campaignId ?? "none"} text="${userText}"`, "ws");

    conversationHistory.push({ role: "user", content: userText });

    try {
      const aiReply = await getAIReply(userText, event.campaignId, conversationHistory);
      conversationHistory.push({ role: "assistant", content: aiReply });

      log(`[${clientIp}] AI reply: "${aiReply}"`, "ws");
      sendTextResponse(ws, aiReply);

      try {
        await sendAudioResponse(ws, aiReply);
        log(`[${clientIp}] Audio sent for reply`, "ws");
      } catch (ttsErr: any) {
        log(`[${clientIp}] TTS error (text reply already sent): ${ttsErr.message}`, "ws");
      }
    } catch (err: any) {
      log(`[${clientIp}] AI error: ${err.message}`, "ws");
      sendTextResponse(ws, "Sorry, I ran into an issue. Please try again.");
    }
  });

  ws.on("close", (code, reason) => {
    log(`Client disconnected [${clientIp}] code=${code} reason=${reason || "none"}  total=${wss.clients.size}`, "ws");
  });

  ws.on("error", (err) => {
    log(`Error from [${clientIp}]: ${err.message}`, "ws");
  });
}

// ─── Unified WebSocket setup (noServer routing) ───────────────────────────────
//
// Why noServer: the ws library's path-based filtering calls socket.destroy() on
// any upgrade it doesn't own, so a second WebSocketServer on the same httpServer
// would never receive its upgrade events.  Instead we create both servers with
// noServer:true and route upgrades ourselves — unrecognised paths are left alone
// so Vite HMR and other protocols can still handle them.

/**
 * Attach all WebSocket servers to the existing HTTP server.
 *
 * Paths:
 *   /stream        — text + MP3 audio, for web clients and debugging
 *   /exotel-stream — μ-law 8 kHz bidirectional voicebot stream for Exotel
 *                    optional query param: ?campaignId=<id>
 */
export function setupWebSocketServer(httpServer: Server): void {
  // /stream — text + MP3 debug path
  const streamWss = new WebSocketServer({ noServer: true });
  streamWss.on("connection", (ws, req) => {
    const clientIp = req.socket.remoteAddress ?? "unknown";
    log(`[/stream] Client connected [${clientIp}]  total=${streamWss.clients.size}`, "ws");
    attachStreamHandlers(streamWss, ws, clientIp);
  });

  // /exotel-stream — Exotel voicebot path
  const exotelWss = new WebSocketServer({ noServer: true });
  exotelWss.on("connection", (ws, req) => {
    const clientIp = req.socket.remoteAddress ?? "unknown";
    let campaignId: string | undefined;
    try {
      const url  = new URL(req.url ?? "", `ws://${req.headers.host}`);
      campaignId = url.searchParams.get("campaignId") ?? undefined;
    } catch { /* ignore */ }

    log(`[/exotel-stream] Connection from [${clientIp}] campaignId=${campaignId ?? "none"}  total=${exotelWss.clients.size}`, "ws");
    handleExotelStream(ws, campaignId);
  });

  // Single upgrade router — routes by pathname, passes unknown paths through
  httpServer.on("upgrade", (req, socket, head) => {
    let pathname = "/";
    try {
      pathname = new URL(req.url ?? "", `ws://${req.headers.host}`).pathname;
    } catch { /* ignore */ }

    const clientIp = (req.socket as any)?.remoteAddress ?? "unknown";
    log(`[upgrade] path=${pathname} from=${clientIp} origin=${req.headers.origin ?? "none"} host=${req.headers.host ?? "none"}`, "ws");

    if (pathname === "/stream") {
      streamWss.handleUpgrade(req, socket as any, head, (ws) => {
        streamWss.emit("connection", ws, req);
      });
    } else if (pathname === "/exotel-stream") {
      log(`[upgrade] routing /exotel-stream to exotel handler`, "ws");
      exotelWss.handleUpgrade(req, socket as any, head, (ws) => {
        exotelWss.emit("connection", ws, req);
      });
    } else {
      log(`[upgrade] unhandled path ${pathname} — leaving for other listeners`, "ws");
    }

    // Socket error handler to catch rejected handshakes
    socket.on("error", (err) => {
      log(`[upgrade] socket error on ${pathname}: ${err.message}`, "ws");
    });
  });

  log("WebSocket server ready on path /stream", "ws");
  log("Exotel voicebot stream ready on path /exotel-stream", "ws");
}
