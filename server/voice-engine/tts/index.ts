import type { AudioFormat } from '../audio/index.js';

export interface TTSConfig {
  readonly voice: string;
  readonly speed: number;
  readonly pitch: number;
  readonly outputFormat: AudioFormat;
  readonly timeoutMs: number;
}

export interface TTSRequest {
  readonly text: string;
  readonly voice?: string;
  readonly speed?: number;
  readonly pitch?: number;
}

export interface TTSResult {
  readonly audio: Buffer;
  readonly format: AudioFormat;
  readonly durationMs: number;
  readonly characterCount: number;
}

export interface TTSStreamChunk {
  readonly audio: Buffer;
  readonly isFinal: boolean;
  readonly sequenceNumber: number;
}

export interface TTSCapabilities {
  readonly supportsStreaming: boolean;
  readonly supportedVoices: readonly string[];
  readonly supportedOutputFormats: readonly AudioFormat[];
  readonly supportsSSML: boolean;
}
