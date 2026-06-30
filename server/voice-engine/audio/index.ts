export type AudioEncoding =
  | 'LINEAR16'
  | 'MULAW'
  | 'ALAW'
  | 'OPUS'
  | 'MP3'
  | 'OGG_OPUS';

export type AudioSampleRate = 8000 | 16000 | 22050 | 44100 | 48000;

export interface AudioFormat {
  readonly encoding: AudioEncoding;
  readonly sampleRate: AudioSampleRate;
  readonly channels: 1 | 2;
  readonly bitDepth?: 8 | 16 | 24 | 32;
}

export interface AudioChunk {
  readonly data: Buffer;
  readonly format: AudioFormat;
  readonly sequenceNumber: number;
  readonly durationMs: number;
}

export interface AudioProcessingConfig {
  readonly inputFormat: AudioFormat;
  readonly outputFormat: AudioFormat;
  readonly silenceThresholdMs: number;
  readonly maxChunkDurationMs: number;
}
