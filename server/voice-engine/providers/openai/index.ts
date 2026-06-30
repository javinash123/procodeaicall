/**
 * @module openai-realtime-provider
 *
 * Public barrel export for the OpenAI Realtime provider.
 *
 * ## Usage
 * ```typescript
 * import {
 *   createOpenAIRealtimeProvider,
 *   OpenAIRealtimeProvider,
 * } from '../voice-engine/providers/openai/index.js';
 * ```
 *
 * ## Important
 * The OpenAI SDK (`import OpenAI from 'openai'`) is imported ONLY inside
 * `OpenAIRealtimeProvider.ts`. No other module in the Voice Engine may
 * import the OpenAI SDK directly.
 */

export { OpenAIRealtimeProvider } from './OpenAIRealtimeProvider.js';
export type { OpenSessionOptions } from './OpenAIRealtimeProvider.js';

export { OpenAIRealtimeSession } from './OpenAIRealtimeSession.js';
export type { IOpenAIRealtimeSession } from './OpenAIRealtimeSession.js';

export { createOpenAIRealtimeProvider } from './OpenAIRealtimeFactory.js';
export type { OpenAIRealtimeProviderOptions } from './OpenAIRealtimeFactory.js';

export { OpenAIRealtimeConfigSchema } from './OpenAIRealtimeConfig.js';
export type { OpenAIRealtimeConfig, RetryPolicy } from './OpenAIRealtimeConfig.js';

export type {
  RealtimeConnectedEvent,
  RealtimeDisconnectedEvent,
  RealtimeSessionUpdatedEvent,
  RealtimeAudioReceivedEvent,
  RealtimeAudioSentEvent,
  RealtimeTranscriptDeltaEvent,
  RealtimeTranscriptCompletedEvent,
  RealtimeResponseStartedEvent,
  RealtimeResponseDeltaEvent,
  RealtimeResponseCompletedEvent,
  RealtimeToolCallEvent,
  RealtimeToolResultEvent,
  RealtimeSpeechStartedEvent,
  RealtimeSpeechStoppedEvent,
  RealtimeRateLimitEvent,
  RealtimeErrorEvent,
  RealtimeProviderEvent,
  RealtimeProviderEventType,
  RealtimeProviderEventMap,
  RealtimeEventHandler,
} from './OpenAIRealtimeEvents.js';

export type {
  RealtimeAudioFormat,
  RealtimeVoice,
  ServerVADTurnDetection,
  SemanticVADTurnDetection,
  TurnDetection,
  Tool,
  FunctionTool,
  ConversationItem,
  RealtimeSessionResource,
  ClientEvent,
  ServerEvent,
  ServerEventType,
  ServerEventMap,
  RateLimitResource,
  UsageResource,
} from './OpenAIRealtimeTypes.js';
