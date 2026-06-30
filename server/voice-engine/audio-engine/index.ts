/**
 * @module audio-engine
 *
 * Public barrel export for the Voice Engine Audio Engine.
 *
 * ## Usage
 * ```typescript
 * import {
 *   createAudioEngine,
 *   AudioEngine,
 *   AudioChunk,
 *   createAudioChunk,
 * } from '../voice-engine/audio-engine/index.js';
 * ```
 *
 * ## Important
 * No OpenAI, Exotel, WebSocket, transport, or codec implementation exists
 * within this module. All codec concerns are limited to descriptor interfaces
 * and the registry in `AudioCodec.ts`.
 */

// ─── Audio Chunk ─────────────────────────────────────────────────────────────
export { createAudioChunk, deriveAudioChunk } from './AudioChunk.js';
export type { AudioChunk, AudioDirection, AudioPayloadFormat, AudioEncoding } from './AudioChunk.js';

// ─── Audio Clock ─────────────────────────────────────────────────────────────
export { SystemAudioClock } from './AudioClock.js';
export type { IAudioClock } from './AudioClock.js';

// ─── Audio Codec ─────────────────────────────────────────────────────────────
export { CodecRegistry, CODEC_DESCRIPTORS } from './AudioCodec.js';
export type { ICodecDescriptor } from './AudioCodec.js';

// ─── Audio Buffer ─────────────────────────────────────────────────────────────
export { AudioBuffer } from './AudioBuffer.js';
export type { AudioBufferSnapshot } from './AudioBuffer.js';

// ─── Audio Scheduler ─────────────────────────────────────────────────────────
export { AudioScheduler, DEFAULT_SCHEDULER_CONFIG } from './AudioScheduler.js';
export type {
  SchedulingAction,
  AudioSchedulingDecision,
  AudioSchedulerConfig,
  AudioSchedulingInput,
} from './AudioScheduler.js';

// ─── Audio Latency ───────────────────────────────────────────────────────────
export { AudioLatency } from './AudioLatency.js';
export type { LatencySample, AudioLatencySnapshot } from './AudioLatency.js';

// ─── Audio Statistics ────────────────────────────────────────────────────────
export { AudioStatistics } from './AudioStatistics.js';
export type { DirectionalStats, AudioStatisticsSnapshot } from './AudioStatistics.js';

// ─── Audio Pipeline ──────────────────────────────────────────────────────────
export { AudioPipeline } from './AudioPipeline.js';
export type { PipelineResult, AudioPipelineConfig } from './AudioPipeline.js';

// ─── Audio Engine ─────────────────────────────────────────────────────────────
export { AudioEngine } from './AudioEngine.js';
export type { IAudioEngine, AudioEngineConfig, AudioEngineSnapshot } from './AudioEngine.js';

// ─── Factory ──────────────────────────────────────────────────────────────────
export { createAudioEngine } from './AudioEngineFactory.js';
export type { AudioEngineFactoryOptions } from './AudioEngineFactory.js';
