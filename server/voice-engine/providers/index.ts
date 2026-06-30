import type { ITelephonyProvider, ISTTProvider, ILLMProvider, ITTSProvider } from '../interfaces/index.js';
import type { ProviderConfig } from '../config/index.js';
import type { ILogger } from '../logger/index.js';

export interface TelephonyProviderFactory {
  create(config: ProviderConfig['telephony'], logger: ILogger): ITelephonyProvider;
  readonly supportedProviders: readonly string[];
}

export interface STTProviderFactory {
  create(config: ProviderConfig['stt'], logger: ILogger): ISTTProvider;
  readonly supportedProviders: readonly string[];
}

export interface LLMProviderFactory {
  create(config: ProviderConfig['llm'], logger: ILogger): ILLMProvider;
  readonly supportedProviders: readonly string[];
}

export interface TTSProviderFactory {
  create(config: ProviderConfig['tts'], logger: ILogger): ITTSProvider;
  readonly supportedProviders: readonly string[];
}

export interface ProviderRegistry {
  telephony: TelephonyProviderFactory;
  stt: STTProviderFactory;
  llm: LLMProviderFactory;
  tts: TTSProviderFactory;
}
