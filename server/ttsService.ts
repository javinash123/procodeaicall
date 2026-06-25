import OpenAI from "openai";

// ─── Provider Interface ───────────────────────────────────────────────────────
// Swap the provider later by implementing this interface and updating `tts` below

export interface TTSProvider {
  synthesize(text: string, voice?: string): Promise<Buffer>;
  mimeType: string;
}

// ─── OpenAI TTS Provider ──────────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Available OpenAI voices: alloy, echo, fable, onyx, nova, shimmer
const DEFAULT_VOICE: OpenAI.Audio.Speech.SpeechCreateParams["voice"] = "nova";

const openaiTTSProvider: TTSProvider = {
  mimeType: "audio/mpeg",

  async synthesize(text: string, voice?: string): Promise<Buffer> {
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: (voice as OpenAI.Audio.Speech.SpeechCreateParams["voice"]) || DEFAULT_VOICE,
      input: text,
      response_format: "mp3",
    });

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  },
};

// ─── Active Provider (swap here to change TTS backend) ───────────────────────

const tts: TTSProvider = openaiTTSProvider;

// ─── Public API ──────────────────────────────────────────────────────────────

export interface AudioResult {
  audioBase64: string;
  mimeType: string;
}

/**
 * Convert text to speech using the active TTS provider.
 * Returns base64-encoded audio and the MIME type.
 * Pass an optional voice name supported by the current provider.
 */
export async function textToSpeech(text: string, voice?: string): Promise<AudioResult> {
  const audioBuffer = await tts.synthesize(text, voice);
  return {
    audioBase64: audioBuffer.toString("base64"),
    mimeType:    tts.mimeType,
  };
}
