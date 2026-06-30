/**
 * @module AudioEngineFactory
 *
 * Dependency-injected factory for constructing `AudioEngine` instances.
 *
 * ## Purpose
 * The single authorised entry point for creating audio engines. Validates
 * configuration, wires the clock, and returns a fully constructed `IAudioEngine`
 * in the IDLE (not yet started) state.
 *
 * ## Ownership
 * Called by the call-coordinator once per live call, immediately before
 * `ConversationOrchestrator.start()`. The returned engine is passed to the
 * orchestrator through the DI container.
 *
 * ## Thread Safety
 * `createAudioEngine()` is stateless and reentrant. Concurrent calls each
 * produce an independent engine with no shared mutable state.
 */

import { z } from 'zod';
import { AudioEngine } from './AudioEngine.js';
import type { IAudioEngine, AudioEngineConfig } from './AudioEngine.js';
import { SystemAudioClock } from './AudioClock.js';
import type { IAudioClock } from './AudioClock.js';
import { ConfigurationError } from '../errors/index.js';

/**
 * Options accepted by `createAudioEngine()`.
 */
export interface AudioEngineFactoryOptions {
  /**
   * Custom clock implementation.
   * Defaults to `SystemAudioClock` when not provided.
   * Inject a controlled clock in tests for deterministic timing.
   */
  readonly clock?: IAudioClock;

  /**
   * Audio engine configuration overrides.
   */
  readonly config?: AudioEngineConfig;
}

const AudioEngineFactoryOptionsSchema = z.object({
  clock: z.any().optional(),
  config: z
    .object({
      rollingWindowSize: z.number().int().positive().optional(),
      inboundScheduler: z
        .object({
          minBufferMs: z.number().int().nonnegative().optional(),
          maxBufferMs: z.number().int().positive().optional(),
          targetChunkMs: z.number().int().positive().optional(),
          maxBatchSize: z.number().int().positive().optional(),
          preferMerge: z.boolean().optional(),
        })
        .optional(),
      outboundScheduler: z
        .object({
          minBufferMs: z.number().int().nonnegative().optional(),
          maxBufferMs: z.number().int().positive().optional(),
          targetChunkMs: z.number().int().positive().optional(),
          maxBatchSize: z.number().int().positive().optional(),
          preferMerge: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

/**
 * Creates and returns a new `IAudioEngine` in the IDLE state.
 *
 * The caller must invoke `engine.start()` before ingesting any audio.
 *
 * @param options - Optional clock override and config overrides.
 * @returns A fully constructed audio engine, not yet started.
 * @throws {ConfigurationError} if any option fails schema validation.
 *
 * @example
 * ```typescript
 * const engine = createAudioEngine({
 *   config: {
 *     inboundScheduler: { minBufferMs: 20, maxBufferMs: 500 },
 *     outboundScheduler: { preferMerge: true, targetChunkMs: 40 },
 *   },
 * });
 *
 * engine.start();
 * engine.ingestInbound(chunk);
 * const result = engine.tickInbound();
 * ```
 */
export function createAudioEngine(options: AudioEngineFactoryOptions = {}): IAudioEngine {
  const parsed = AudioEngineFactoryOptionsSchema.safeParse(options);
  if (!parsed.success) {
    throw new ConfigurationError(
      `AudioEngineFactory: invalid options — ${parsed.error.issues.map((i) => i.message).join(', ')}`
    );
  }

  const clock: IAudioClock = options.clock ?? new SystemAudioClock();
  const config: AudioEngineConfig = options.config ?? {};

  return new AudioEngine(clock, config);
}
