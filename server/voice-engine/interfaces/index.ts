import type { AudioChunk, AudioFormat } from '../audio/index.js';
import type { STTConfig, STTResult, STTStreamHandle, STTCapabilities } from '../stt/index.js';
import type { LLMConfig, LLMRequest, LLMResponse, LLMStreamChunk, LLMCapabilities } from '../llm/index.js';
import type { TTSConfig, TTSRequest, TTSResult, TTSStreamChunk, TTSCapabilities } from '../tts/index.js';
import type { CallSid, SessionId } from '../types/index.js';
import type { HealthStatus } from '../monitoring/index.js';

export interface ITelephonyProvider {
  readonly name: string;
  readonly capabilities: TelephonyCapabilities;
  ping(): Promise<HealthStatus>;
  getCallStatus(callSid: CallSid): Promise<TelephonyCallStatus>;
  hangUp(callSid: CallSid, reason?: string): Promise<void>;
  sendDigits(callSid: CallSid, digits: string): Promise<void>;
  muteCall(callSid: CallSid): Promise<void>;
  unmuteCall(callSid: CallSid): Promise<void>;
}

export interface TelephonyCapabilities {
  readonly supportsStreaming: boolean;
  readonly supportsDigitDetection: boolean;
  readonly supportsCallRecording: boolean;
  readonly supportedCountries: readonly string[];
}

export interface TelephonyCallStatus {
  readonly callSid: CallSid;
  readonly status: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer';
  readonly direction: 'inbound' | 'outbound';
  readonly durationSeconds: number;
}

export interface ISTTProvider {
  readonly name: string;
  readonly capabilities: STTCapabilities;
  ping(): Promise<HealthStatus>;
  transcribe(chunk: AudioChunk, config: STTConfig): Promise<STTResult>;
  openStream(config: STTConfig, onResult: (result: STTResult) => void): Promise<STTStreamHandle>;
}

export interface ISTTStreamingProvider extends ISTTProvider {
  readonly supportsStreaming: true;
  openStream(config: STTConfig, onResult: (result: STTResult) => void): Promise<STTStreamHandle>;
}

export interface ILLMProvider {
  readonly name: string;
  readonly capabilities: LLMCapabilities;
  ping(): Promise<HealthStatus>;
  complete(request: LLMRequest, config: LLMConfig): Promise<LLMResponse>;
}

export interface ILLMStreamingProvider extends ILLMProvider {
  readonly supportsStreaming: true;
  stream(
    request: LLMRequest,
    config: LLMConfig,
    onChunk: (chunk: LLMStreamChunk) => void
  ): Promise<LLMResponse>;
}

export interface ITTSProvider {
  readonly name: string;
  readonly capabilities: TTSCapabilities;
  ping(): Promise<HealthStatus>;
  synthesize(request: TTSRequest, config: TTSConfig): Promise<TTSResult>;
}

export interface ITTSStreamingProvider extends ITTSProvider {
  readonly supportsStreaming: true;
  synthesizeStream(
    request: TTSRequest,
    config: TTSConfig,
    onChunk: (chunk: TTSStreamChunk) => void
  ): Promise<TTSResult>;
}
