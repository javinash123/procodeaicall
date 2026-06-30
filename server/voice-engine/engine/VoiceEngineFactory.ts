/**
 * @module VoiceEngineFactory
 *
 * Top-level factory for constructing a fully wired `VoiceEngine`.
 *
 * ## Purpose
 * `VoiceEngineFactory` is the SINGLE authoritative entry point for the
 * entire engine assembly. It orchestrates:
 * 1. Bootstrap — environment load, config merge, DI container construction.
 * 2. Builder   — dependency graph assembly.
 * 3. Engine    — lifecycle initialisation.
 *
 * ## Rules
 * - No OpenAI SDK imports.
 * - No Exotel protocol imports.
 * - No Audio Engine internals.
 * - No `process.env` (delegated entirely to the bootstrap layer).
 * - No global singletons or static state.
 * - All dependencies are injected.
 *
 * ## Usage
 * ```typescript
 * // Minimal usage — reads everything from environment variables.
 * const factory = new VoiceEngineFactory();
 * const engine = await factory.create();
 *
 * // With overrides:
 * const engine = await factory.create({
 *   bootstrapOptions: { providers: { logger: pinoLogger } },
 *   builderOptions:   { gateway: myTestGateway },
 *   autoStart:        true,
 * });
 * ```
 */

import { createVoiceEngineRuntime } from '../bootstrap/Bootstrap.js';
import type { BootstrapOptions, VoiceEngineRuntime } from '../bootstrap/Bootstrap.js';
import { VoiceEngineBuilder } from './VoiceEngineBuilder.js';
import type { VoiceEngineBuilderOptions, IVoiceEngineBuilder } from './VoiceEngineBuilder.js';
import type { IVoiceEngine } from './VoiceEngine.js';

// ─── Factory Options ──────────────────────────────────────────────────────────

/**
 * Options for `VoiceEngineFactory.create()`.
 */
export interface VoiceEngineFactoryOptions {
  /**
   * Options forwarded to `createVoiceEngineRuntime()`.
   * Use to inject concrete providers and config overrides.
   */
  readonly bootstrapOptions?: BootstrapOptions;

  /**
   * Options forwarded to the `VoiceEngineBuilder`.
   * Use to override individual subsystems (e.g. in tests).
   */
  readonly builderOptions?: VoiceEngineBuilderOptions;

  /**
   * If `true`, `initialize()` and `start()` are called automatically before
   * the engine is returned. Defaults to `false`.
   *
   * When `false`, the caller is responsible for calling
   * `engine.initialize()` and `engine.start()` at the appropriate time.
   */
  readonly autoStart?: boolean;
}

// ─── Public Interface ─────────────────────────────────────────────────────────

/**
 * Public contract for the engine factory.
 */
export interface IVoiceEngineFactory {
  /**
   * Constructs, optionally initialises, and returns a `IVoiceEngine`.
   *
   * @param options - Bootstrap, builder, and lifecycle options.
   * @returns A fully wired `IVoiceEngine`.
   */
  create(options?: VoiceEngineFactoryOptions): Promise<IVoiceEngine>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Production implementation of `IVoiceEngineFactory`.
 *
 * Accepts an optional `IVoiceEngineBuilder` for testability.
 */
export class VoiceEngineFactory implements IVoiceEngineFactory {
  private readonly _builder: IVoiceEngineBuilder;

  constructor(builder: IVoiceEngineBuilder = new VoiceEngineBuilder()) {
    this._builder = builder;
  }

  async create(options: VoiceEngineFactoryOptions = {}): Promise<IVoiceEngine> {
    const runtime = this._buildRuntime(options.bootstrapOptions ?? {});
    const engine = this._builder.build(runtime, options.builderOptions ?? {});

    if (options.autoStart) {
      await engine.initialize();
      await engine.start();
    }

    return engine;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _buildRuntime(bootstrapOptions: BootstrapOptions): VoiceEngineRuntime {
    return createVoiceEngineRuntime(bootstrapOptions);
  }
}

// ─── Convenience Function ─────────────────────────────────────────────────────

/**
 * Top-level convenience function for creating a `VoiceEngine`.
 *
 * Equivalent to `new VoiceEngineFactory().create(options)`.
 *
 * @param options - Bootstrap, builder, and lifecycle options.
 * @returns A fully wired `IVoiceEngine`.
 *
 * @example
 * ```typescript
 * import { createVoiceEngine } from './voice-engine/engine/index.js';
 *
 * const engine = await createVoiceEngine({
 *   bootstrapOptions: { providers: { logger } },
 *   autoStart: true,
 * });
 *
 * process.on('SIGTERM', () => {
 *   engine.stop('sigterm').then(() => engine.destroy());
 * });
 * ```
 */
export async function createVoiceEngine(
  options: VoiceEngineFactoryOptions = {}
): Promise<IVoiceEngine> {
  return new VoiceEngineFactory().create(options);
}
