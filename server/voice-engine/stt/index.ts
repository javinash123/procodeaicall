import type { AudioChunk, AudioFormat } from '../audio/index.js';

export interface STTConfig {
  readonly languageCode: string;
  readonly model: string;
  readonly interimResults: boolean;
  readonly singleUtterance: boolean;
  readonly profanityFilter: boolean;
}

export interface STTResult {
  readonly transcript: string;
  readonly confidence: number;
  readonly isFinal: boolean;
  readonly languageCode: string;
}

export interface STTStreamHandle {
  readonly isActive: boolean;
  write(chunk: AudioChunk): Promise<void>;
  close(): Promise<void>;
}

export interface STTCapabilities {
  readonly supportsStreaming: boolean;
  readonly supportedLanguages: readonly string[];
  readonly supportedAudioFormats: readonly AudioFormat[];
  readonly supportsInterimResults: boolean;
}
