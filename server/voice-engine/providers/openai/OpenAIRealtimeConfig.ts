/**
 * @module OpenAIRealtimeConfig
 *
 * Configuration schema and validated types for the OpenAI Realtime provider.
 *
 * ## Purpose
 * Defines and validates all knobs exposed by the realtime provider. Uses Zod
 * for fail-fast validation at startup, before any WebSocket connection opens.
 *
 * ## Ownership
 * Consumed by `OpenAIRealtimeFactory` during provider construction. Not
 * exported beyond the openai provider module.
 */

import { z } from 'zod';

const RealtimeVoiceSchema = z.enum([
  'alloy', 'ash', 'ballad', 'coral', 'echo',
  'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse',
]);

const RealtimeAudioFormatSchema = z.enum(['pcm16', 'g711_ulaw', 'g711_alaw']);

const ServerVADSchema = z.object({
  type: z.literal('server_vad'),
  threshold: z.number().min(0).max(1).optional(),
  prefix_padding_ms: z.number().int().nonnegative().optional(),
  silence_duration_ms: z.number().int().nonnegative().optional(),
  create_response: z.boolean().optional(),
});

const SemanticVADSchema = z.object({
  type: z.literal('semantic_vad'),
  eagerness: z.enum(['low', 'medium', 'high', 'auto']).optional(),
  create_response: z.boolean().optional(),
  interrupt_response: z.boolean().optional(),
});

const TurnDetectionSchema = z.discriminatedUnion('type', [
  ServerVADSchema,
  SemanticVADSchema,
]);

const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(3),
  initialBackoffMs: z.number().int().positive().default(1_000),
  maxBackoffMs: z.number().int().positive().default(30_000),
  backoffMultiplier: z.number().min(1).max(10).default(2),
});

export const OpenAIRealtimeConfigSchema = z.object({
  /** OpenAI API key. Must not be exposed outside this module. */
  apiKey: z.string().min(1),

  /** Base URL for the OpenAI API. Defaults to official endpoint. */
  baseURL: z.string().url().default('https://api.openai.com/v1'),

  /** Realtime WebSocket URL. */
  realtimeURL: z.string().url().default('wss://api.openai.com/v1/realtime'),

  /** Model to use for realtime conversations. */
  model: z.string().default('gpt-4o-realtime-preview'),

  /** Voice used for audio output. */
  voice: RealtimeVoiceSchema.default('alloy'),

  /** Sampling temperature. */
  temperature: z.number().min(0).max(2).default(0.8),

  /** Maximum tokens in a single response. */
  maxResponseOutputTokens: z.union([
    z.number().int().positive(),
    z.literal('inf'),
  ]).default(4096),

  /** Audio format for input buffers arriving from telephony. */
  inputAudioFormat: RealtimeAudioFormatSchema.default('g711_ulaw'),

  /** Audio format for output audio sent back to telephony. */
  outputAudioFormat: RealtimeAudioFormatSchema.default('g711_ulaw'),

  /**
   * Whether to enable server-side input audio transcription.
   * When enabled, the model transcribes incoming audio automatically.
   */
  enableInputTranscription: z.boolean().default(true),

  /** Whisper model to use for input transcription. */
  transcriptionModel: z.string().default('whisper-1'),

  /** Turn detection configuration. */
  turnDetection: TurnDetectionSchema.default({
    type: 'server_vad',
    threshold: 0.5,
    prefix_padding_ms: 300,
    silence_duration_ms: 800,
    create_response: true,
  }),

  /** Output modalities. 'audio' must be included for voice output. */
  modalities: z.array(z.enum(['text', 'audio'])).default(['text', 'audio']),

  /** Timeout for establishing the WebSocket connection in milliseconds. */
  connectTimeoutMs: z.number().int().positive().default(10_000),

  /** Timeout for the HTTP ping (models list) in milliseconds. */
  pingTimeoutMs: z.number().int().positive().default(5_000),

  /** Retry policy for transient connection failures. */
  retry: RetryPolicySchema.default({}),
});

export type OpenAIRealtimeConfig = z.infer<typeof OpenAIRealtimeConfigSchema>;
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;
