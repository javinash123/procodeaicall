/**
 * @module ConfigLoader
 *
 * Merges environment variables, built-in defaults, and optional runtime
 * overrides into a single frozen `VoiceEngineConfig`.
 *
 * ## Purpose
 * Produces the authoritative, immutable configuration object consumed by
 * every Voice Engine component. Validation is performed via the existing
 * Zod schemas from the foundation layer.
 *
 * ## Ownership
 * Called once during bootstrap by `Bootstrap.ts`. The resulting config is
 * passed into the DI container and never mutated.
 *
 * ## Fail-Fast
 * Throws `ConfigurationError` if the merged configuration fails Zod validation.
 */

import { VoiceEngineConfigSchema } from '../config/index.js';
import type { VoiceEngineConfig } from '../config/index.js';
import { ConfigurationError } from '../errors/index.js';
import type { LoadedEnvironment } from './EnvironmentLoader.js';

/** Partial overrides supplied programmatically at bootstrap time. */
export type ConfigOverrides = Partial<{
  logging: Partial<VoiceEngineConfig['logging']>;
  metrics: Partial<VoiceEngineConfig['metrics']>;
  session: Partial<VoiceEngineConfig['session']>;
  transport: Partial<VoiceEngineConfig['transport']>;
  health: Partial<VoiceEngineConfig['health']>;
  security: Partial<VoiceEngineConfig['security']>;
}>;

/**
 * Merges a `LoadedEnvironment` with optional programmatic overrides and
 * produces a fully validated, deeply frozen `VoiceEngineConfig`.
 *
 * Priority (highest → lowest):
 *   1. `overrides` (programmatic, e.g. test fixtures)
 *   2. `env` (environment variables)
 *   3. Schema defaults (declared in `VoiceEngineConfigSchema`)
 *
 * @throws {ConfigurationError} if the merged config fails schema validation.
 */
export function loadConfig(
  env: LoadedEnvironment,
  overrides: ConfigOverrides = {}
): Readonly<VoiceEngineConfig> {
  const merged = {
    providers: {
      telephony: {
        provider: env.providers.telephony.provider,
        apiKey: env.providers.telephony.apiKey,
        apiSecret: env.providers.telephony.apiSecret,
        accountSid: env.providers.telephony.accountSid,
        baseUrl: env.providers.telephony.baseUrl,
        timeoutMs: env.providers.telephony.timeoutMs,
      },
      stt: {
        provider: env.providers.stt.provider,
        apiKey: env.providers.stt.apiKey,
        model: env.providers.stt.model,
        languageCode: env.providers.stt.languageCode,
        timeoutMs: env.providers.stt.timeoutMs,
      },
      llm: {
        provider: env.providers.llm.provider,
        apiKey: env.providers.llm.apiKey,
        model: env.providers.llm.model,
        maxTokens: env.providers.llm.maxTokens,
        temperature: env.providers.llm.temperature,
        timeoutMs: env.providers.llm.timeoutMs,
      },
      tts: {
        provider: env.providers.tts.provider,
        apiKey: env.providers.tts.apiKey,
        defaultVoice: env.providers.tts.defaultVoice,
        timeoutMs: env.providers.tts.timeoutMs,
      },
    },
    logging: {
      level: env.logging.level,
      prettyPrint: env.logging.prettyPrint,
      ...overrides.logging,
    },
    metrics: {
      enabled: env.metrics.enabled,
      prefix: env.metrics.prefix,
      flushIntervalMs: env.metrics.flushIntervalMs,
      ...overrides.metrics,
    },
    session: {
      ttlSeconds: env.session.ttlSeconds,
      maxConcurrentSessions: env.session.maxConcurrentSessions,
      storeType: env.session.storeType,
      redisUrl: env.session.redisUrl,
      ...overrides.session,
    },
    transport: {
      protocol: env.transport.protocol,
      host: env.transport.host,
      port: env.transport.port,
      path: env.transport.path,
      tlsEnabled: env.transport.tlsEnabled,
      timeoutMs: env.transport.timeoutMs,
      maxReconnectAttempts: 3,
      reconnectBackoffMs: 1_000,
      ...overrides.transport,
    },
    health: {
      pingIntervalMs: env.health.pingIntervalMs,
      pingTimeoutMs: env.health.pingTimeoutMs,
      unhealthyThreshold: 3,
      healthyThreshold: 1,
      ...overrides.health,
    },
    security: {
      allowedCallerIds: [],
      maxCallDurationSeconds: env.security.maxCallDurationSeconds,
      validateWebhookSignature: env.security.validateWebhookSignature,
      webhookSecret: env.security.webhookSecret,
      ...overrides.security,
    },
  };

  const result = VoiceEngineConfigSchema.safeParse(merged);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new ConfigurationError(
      `Voice Engine config validation failed:\n${issues}`,
      { issues: result.error.issues }
    );
  }

  return deepFreeze(result.data) as Readonly<VoiceEngineConfig>;
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj as object)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}
