/**
 * @module EnvironmentLoader
 *
 * The sole authorised point of contact with `process.env`.
 *
 * ## Purpose
 * Reads raw environment variables and converts them into a strongly typed,
 * validated intermediate object. No caller outside this module may read
 * `process.env` directly.
 *
 * ## Ownership
 * Created once during bootstrap. Immutable after construction.
 *
 * ## Thread Safety
 * `process.env` is read exactly once at construction time. All subsequent
 * accesses go through the frozen result object.
 *
 * ## Fail-Fast
 * Missing or malformed required variables throw a `ConfigurationError`
 * immediately at load time, before any provider is initialised.
 */

import { z } from 'zod';
import { ConfigurationError } from '../errors/index.js';

const RawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  VOICE_ENGINE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  VOICE_ENGINE_PRETTY_LOGS: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  VOICE_ENGINE_METRICS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  VOICE_ENGINE_METRICS_PREFIX: z.string().default('nijvox_voice_'),
  VOICE_ENGINE_METRICS_FLUSH_MS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 10_000))
    .pipe(z.number().int().positive()),

  VOICE_ENGINE_SESSION_TTL_SECONDS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 3600))
    .pipe(z.number().int().positive()),
  VOICE_ENGINE_MAX_SESSIONS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 100))
    .pipe(z.number().int().positive()),
  VOICE_ENGINE_SESSION_STORE: z.enum(['memory', 'redis']).default('memory'),
  VOICE_ENGINE_REDIS_URL: z.string().url().optional(),

  VOICE_ENGINE_TRANSPORT_PROTOCOL: z.enum(['websocket', 'webhook']).default('websocket'),
  VOICE_ENGINE_TRANSPORT_HOST: z.string().default('0.0.0.0'),
  VOICE_ENGINE_TRANSPORT_PORT: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 8080))
    .pipe(z.number().int().min(1).max(65535)),
  VOICE_ENGINE_TRANSPORT_PATH: z.string().default('/voice-engine/ws'),
  VOICE_ENGINE_TRANSPORT_TLS: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  VOICE_ENGINE_TRANSPORT_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 30_000))
    .pipe(z.number().int().positive()),

  VOICE_ENGINE_HEALTH_PING_INTERVAL_MS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 30_000))
    .pipe(z.number().int().positive()),
  VOICE_ENGINE_HEALTH_PING_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 5_000))
    .pipe(z.number().int().positive()),

  VOICE_ENGINE_MAX_CALL_DURATION_SECONDS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1800))
    .pipe(z.number().int().positive()),
  VOICE_ENGINE_VALIDATE_WEBHOOK_SIG: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  VOICE_ENGINE_WEBHOOK_SECRET: z.string().optional(),

  TELEPHONY_PROVIDER: z.string().default('exotel'),
  TELEPHONY_API_KEY: z.string().default(''),
  TELEPHONY_API_SECRET: z.string().optional(),
  TELEPHONY_ACCOUNT_SID: z.string().optional(),
  TELEPHONY_BASE_URL: z.string().url().default('https://api.exotel.com'),
  TELEPHONY_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 10_000))
    .pipe(z.number().int().positive()),

  STT_PROVIDER: z.string().default('google'),
  STT_API_KEY: z.string().default(''),
  STT_MODEL: z.string().default('default'),
  STT_LANGUAGE: z.string().default('en-US'),
  STT_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 5_000))
    .pipe(z.number().int().positive()),

  LLM_PROVIDER: z.string().default('openai'),
  LLM_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default('gpt-4o'),
  LLM_MAX_TOKENS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 512))
    .pipe(z.number().int().positive()),
  LLM_TEMPERATURE: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : 0.7))
    .pipe(z.number().min(0).max(2)),
  LLM_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 15_000))
    .pipe(z.number().int().positive()),

  TTS_PROVIDER: z.string().default('openai'),
  TTS_API_KEY: z.string().default(''),
  TTS_DEFAULT_VOICE: z.string().default('alloy'),
  TTS_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 8_000))
    .pipe(z.number().int().positive()),
});

export type RawEnv = z.infer<typeof RawEnvSchema>;

/**
 * The fully typed, validated representation of all environment variables
 * consumed by the Voice Engine.
 */
export interface LoadedEnvironment {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly logging: {
    readonly level: 'debug' | 'info' | 'warn' | 'error';
    readonly prettyPrint: boolean;
  };
  readonly metrics: {
    readonly enabled: boolean;
    readonly prefix: string;
    readonly flushIntervalMs: number;
  };
  readonly session: {
    readonly ttlSeconds: number;
    readonly maxConcurrentSessions: number;
    readonly storeType: 'memory' | 'redis';
    readonly redisUrl?: string;
  };
  readonly transport: {
    readonly protocol: 'websocket' | 'webhook';
    readonly host: string;
    readonly port: number;
    readonly path: string;
    readonly tlsEnabled: boolean;
    readonly timeoutMs: number;
  };
  readonly health: {
    readonly pingIntervalMs: number;
    readonly pingTimeoutMs: number;
  };
  readonly security: {
    readonly maxCallDurationSeconds: number;
    readonly validateWebhookSignature: boolean;
    readonly webhookSecret?: string;
  };
  readonly providers: {
    readonly telephony: {
      readonly provider: string;
      readonly apiKey: string;
      readonly apiSecret?: string;
      readonly accountSid?: string;
      readonly baseUrl: string;
      readonly timeoutMs: number;
    };
    readonly stt: {
      readonly provider: string;
      readonly apiKey: string;
      readonly model: string;
      readonly languageCode: string;
      readonly timeoutMs: number;
    };
    readonly llm: {
      readonly provider: string;
      readonly apiKey: string;
      readonly model: string;
      readonly maxTokens: number;
      readonly temperature: number;
      readonly timeoutMs: number;
    };
    readonly tts: {
      readonly provider: string;
      readonly apiKey: string;
      readonly defaultVoice: string;
      readonly timeoutMs: number;
    };
  };
}

/**
 * Reads and validates all Voice Engine environment variables exactly once.
 *
 * @throws {ConfigurationError} if any required variable is missing or invalid.
 */
export function loadEnvironment(): LoadedEnvironment {
  const result = RawEnvSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new ConfigurationError(
      `Voice Engine environment validation failed:\n${issues}`,
      { issues: result.error.issues }
    );
  }

  const e = result.data;

  return Object.freeze({
    nodeEnv: e.NODE_ENV,
    logging: Object.freeze({
      level: e.VOICE_ENGINE_LOG_LEVEL,
      prettyPrint: e.VOICE_ENGINE_PRETTY_LOGS,
    }),
    metrics: Object.freeze({
      enabled: e.VOICE_ENGINE_METRICS_ENABLED,
      prefix: e.VOICE_ENGINE_METRICS_PREFIX,
      flushIntervalMs: e.VOICE_ENGINE_METRICS_FLUSH_MS,
    }),
    session: Object.freeze({
      ttlSeconds: e.VOICE_ENGINE_SESSION_TTL_SECONDS,
      maxConcurrentSessions: e.VOICE_ENGINE_MAX_SESSIONS,
      storeType: e.VOICE_ENGINE_SESSION_STORE,
      redisUrl: e.VOICE_ENGINE_REDIS_URL,
    }),
    transport: Object.freeze({
      protocol: e.VOICE_ENGINE_TRANSPORT_PROTOCOL,
      host: e.VOICE_ENGINE_TRANSPORT_HOST,
      port: e.VOICE_ENGINE_TRANSPORT_PORT,
      path: e.VOICE_ENGINE_TRANSPORT_PATH,
      tlsEnabled: e.VOICE_ENGINE_TRANSPORT_TLS,
      timeoutMs: e.VOICE_ENGINE_TRANSPORT_TIMEOUT_MS,
    }),
    health: Object.freeze({
      pingIntervalMs: e.VOICE_ENGINE_HEALTH_PING_INTERVAL_MS,
      pingTimeoutMs: e.VOICE_ENGINE_HEALTH_PING_TIMEOUT_MS,
    }),
    security: Object.freeze({
      maxCallDurationSeconds: e.VOICE_ENGINE_MAX_CALL_DURATION_SECONDS,
      validateWebhookSignature: e.VOICE_ENGINE_VALIDATE_WEBHOOK_SIG,
      webhookSecret: e.VOICE_ENGINE_WEBHOOK_SECRET,
    }),
    providers: Object.freeze({
      telephony: Object.freeze({
        provider: e.TELEPHONY_PROVIDER,
        apiKey: e.TELEPHONY_API_KEY,
        apiSecret: e.TELEPHONY_API_SECRET,
        accountSid: e.TELEPHONY_ACCOUNT_SID,
        baseUrl: e.TELEPHONY_BASE_URL,
        timeoutMs: e.TELEPHONY_TIMEOUT_MS,
      }),
      stt: Object.freeze({
        provider: e.STT_PROVIDER,
        apiKey: e.STT_API_KEY,
        model: e.STT_MODEL,
        languageCode: e.STT_LANGUAGE,
        timeoutMs: e.STT_TIMEOUT_MS,
      }),
      llm: Object.freeze({
        provider: e.LLM_PROVIDER,
        apiKey: e.LLM_API_KEY,
        model: e.LLM_MODEL,
        maxTokens: e.LLM_MAX_TOKENS,
        temperature: e.LLM_TEMPERATURE,
        timeoutMs: e.LLM_TIMEOUT_MS,
      }),
      tts: Object.freeze({
        provider: e.TTS_PROVIDER,
        apiKey: e.TTS_API_KEY,
        defaultVoice: e.TTS_DEFAULT_VOICE,
        timeoutMs: e.TTS_TIMEOUT_MS,
      }),
    }),
  }) satisfies LoadedEnvironment;
}
