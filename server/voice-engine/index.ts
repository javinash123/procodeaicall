import type { VoiceEngineConfig } from './config/index.js';
import type { IEventBus } from './events/index.js';
import type { ILogger } from './logger/index.js';
import type { IMetricsCollector } from './metrics/index.js';
import type { ITelephonyProvider, ISTTProvider, ILLMProvider, ITTSProvider } from './interfaces/index.js';
import type { ReadyStatus } from './monitoring/index.js';
import type { ProviderRegistry } from './providers/index.js';

export interface VoiceEngineDependencies {
  readonly config: VoiceEngineConfig;
  readonly eventBus: IEventBus;
  readonly logger: ILogger;
  readonly metrics: IMetricsCollector;
  readonly telephonyProvider: ITelephonyProvider;
  readonly sttProvider: ISTTProvider;
  readonly llmProvider: ILLMProvider;
  readonly ttsProvider: ITTSProvider;
}

export interface VoiceEngine {
  readonly config: Readonly<VoiceEngineConfig>;
  readonly eventBus: IEventBus;
  readonly logger: ILogger;
  readonly metrics: IMetricsCollector;
  readonly telephony: ITelephonyProvider;
  readonly stt: ISTTProvider;
  readonly llm: ILLMProvider;
  readonly tts: ITTSProvider;
  readyStatus(): Promise<ReadyStatus>;
  shutdown(): Promise<void>;
}

export interface VoiceEngineFactory {
  create(dependencies: VoiceEngineDependencies): VoiceEngine;
}

export function createVoiceEngine(dependencies: VoiceEngineDependencies): VoiceEngine {
  const {
    config,
    eventBus,
    logger,
    metrics,
    telephonyProvider,
    sttProvider,
    llmProvider,
    ttsProvider,
  } = dependencies;

  return {
    config: Object.freeze(config),
    eventBus,
    logger,
    metrics,
    telephony: telephonyProvider,
    stt: sttProvider,
    llm: llmProvider,
    tts: ttsProvider,

    async readyStatus(): Promise<ReadyStatus> {
      const timestamp = Date.now();
      const checks = await Promise.allSettled([
        telephonyProvider.ping(),
        sttProvider.ping(),
        llmProvider.ping(),
        ttsProvider.ping(),
      ]);

      const providerNames = ['telephony', 'stt', 'llm', 'tts'] as const;
      const providers = checks.map((result, i) => ({
        providerName: providerNames[i],
        health:
          result.status === 'fulfilled'
            ? result.value
            : { status: 'unhealthy' as const, message: (result.reason as Error).message, checkedAt: timestamp },
        latencyMs: 0,
      }));

      const ready = providers.every((p) => p.health.status !== 'unhealthy');

      return { ready, providers, timestamp };
    },

    async shutdown(): Promise<void> {
      logger.info('VoiceEngine shutting down');
    },
  };
}

export * from './config/index.js';
export * from './events/index.js';
export * from './errors/index.js';
export * from './interfaces/index.js';
export * from './logger/index.js';
export * from './metrics/index.js';
export * from './monitoring/index.js';
export * from './providers/index.js';
export * from './session/index.js';
export * from './transport/index.js';
export * from './audio/index.js';
export * from './stt/index.js';
export * from './llm/index.js';
export * from './tts/index.js';
export * from './pipeline/index.js';
export * from './types/index.js';
