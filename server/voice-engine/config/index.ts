import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  telephony: z.object({
    provider: z.string(),
    apiKey: z.string(),
    apiSecret: z.string().optional(),
    accountSid: z.string().optional(),
    baseUrl: z.string().url(),
    timeoutMs: z.number().int().positive().default(10000),
  }),
  stt: z.object({
    provider: z.string(),
    apiKey: z.string(),
    model: z.string(),
    languageCode: z.string().default('en-US'),
    timeoutMs: z.number().int().positive().default(5000),
  }),
  llm: z.object({
    provider: z.string(),
    apiKey: z.string(),
    model: z.string(),
    maxTokens: z.number().int().positive().default(512),
    temperature: z.number().min(0).max(2).default(0.7),
    timeoutMs: z.number().int().positive().default(15000),
  }),
  tts: z.object({
    provider: z.string(),
    apiKey: z.string(),
    defaultVoice: z.string(),
    timeoutMs: z.number().int().positive().default(8000),
  }),
});

export const AudioConfigSchema = z.object({
  inputEncoding: z.enum(['LINEAR16', 'MULAW', 'ALAW', 'OPUS', 'MP3', 'OGG_OPUS']).default('MULAW'),
  outputEncoding: z.enum(['LINEAR16', 'MULAW', 'ALAW', 'OPUS', 'MP3', 'OGG_OPUS']).default('MULAW'),
  inputSampleRate: z.union([
    z.literal(8000),
    z.literal(16000),
    z.literal(22050),
    z.literal(44100),
    z.literal(48000),
  ]).default(8000),
  outputSampleRate: z.union([
    z.literal(8000),
    z.literal(16000),
    z.literal(22050),
    z.literal(44100),
    z.literal(48000),
  ]).default(8000),
  silenceThresholdMs: z.number().int().nonnegative().default(800),
  maxChunkDurationMs: z.number().int().positive().default(200),
});

export const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  prettyPrint: z.boolean().default(false),
  redactFields: z.array(z.string()).default(['apiKey', 'apiSecret', 'password', 'token']),
});

export const MetricsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  prefix: z.string().default('nijvox_voice_'),
  flushIntervalMs: z.number().int().positive().default(10000),
});

export const SessionConfigSchema = z.object({
  ttlSeconds: z.number().int().positive().default(3600),
  maxConcurrentSessions: z.number().int().positive().default(100),
  storeType: z.enum(['memory', 'redis']).default('memory'),
  redisUrl: z.string().url().optional(),
});

export const TransportConfigSchema = z.object({
  protocol: z.enum(['websocket', 'webhook']).default('websocket'),
  host: z.string().default('0.0.0.0'),
  port: z.number().int().min(1).max(65535).default(8080),
  path: z.string().default('/voice-engine/ws'),
  tlsEnabled: z.boolean().default(false),
  timeoutMs: z.number().int().positive().default(30000),
  maxReconnectAttempts: z.number().int().nonnegative().default(3),
  reconnectBackoffMs: z.number().int().positive().default(1000),
});

export const HealthConfigSchema = z.object({
  pingIntervalMs: z.number().int().positive().default(30000),
  pingTimeoutMs: z.number().int().positive().default(5000),
  unhealthyThreshold: z.number().int().positive().default(3),
  healthyThreshold: z.number().int().positive().default(1),
});

export const SecurityConfigSchema = z.object({
  allowedCallerIds: z.array(z.string()).default([]),
  validateWebhookSignature: z.boolean().default(true),
  webhookSecret: z.string().optional(),
  maxCallDurationSeconds: z.number().int().positive().default(1800),
});

export const VoiceEngineConfigSchema = z.object({
  providers: ProviderConfigSchema,
  audio: AudioConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
  metrics: MetricsConfigSchema.default({}),
  session: SessionConfigSchema.default({}),
  transport: TransportConfigSchema.default({}),
  health: HealthConfigSchema.default({}),
  security: SecurityConfigSchema.default({}),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type AudioConfig = z.infer<typeof AudioConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type MetricsConfig = z.infer<typeof MetricsConfigSchema>;
export type SessionConfig = z.infer<typeof SessionConfigSchema>;
export type TransportConfig = z.infer<typeof TransportConfigSchema>;
export type HealthConfig = z.infer<typeof HealthConfigSchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type VoiceEngineConfig = z.infer<typeof VoiceEngineConfigSchema>;
