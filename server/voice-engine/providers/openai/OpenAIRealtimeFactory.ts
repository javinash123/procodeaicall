/**
 * @module OpenAIRealtimeFactory
 *
 * Dependency-injected factory for constructing an `OpenAIRealtimeProvider`.
 *
 * ## Purpose
 * The single, authorised way to create an `OpenAIRealtimeProvider`. Accepts
 * all dependencies from the bootstrap DI container so no `process.env`
 * access occurs inside the provider.
 *
 * ## Ownership
 * Called by the bootstrap layer (or test fixtures) when registering the
 * OpenAI provider into the `DependencyContainer`.
 *
 * ## Thread Safety
 * `createOpenAIRealtimeProvider()` is stateless and safe to call multiple
 * times to produce independent provider instances.
 */

import { OpenAIRealtimeConfigSchema } from './OpenAIRealtimeConfig.js';
import type { OpenAIRealtimeConfig } from './OpenAIRealtimeConfig.js';
import { OpenAIRealtimeProvider } from './OpenAIRealtimeProvider.js';
import { ConfigurationError } from '../../errors/index.js';
import type { ILogger } from '../../logger/index.js';
import type { IMetricsCollector } from '../../metrics/index.js';

/**
 * Raw options accepted by the factory. All fields except `apiKey` are optional
 * and fall back to the defaults declared in `OpenAIRealtimeConfigSchema`.
 */
export type OpenAIRealtimeProviderOptions = Partial<OpenAIRealtimeConfig> &
  Pick<OpenAIRealtimeConfig, 'apiKey'>;

/**
 * Constructs a fully configured `OpenAIRealtimeProvider` from injected dependencies.
 *
 * @param options  - Configuration overrides including the required `apiKey`.
 * @param logger   - Logger injected from the DI container.
 * @param metrics  - Metrics collector injected from the DI container.
 * @returns A ready-to-use `OpenAIRealtimeProvider` instance.
 * @throws {ConfigurationError} if the merged configuration fails Zod validation.
 *
 * @example
 * ```typescript
 * const provider = createOpenAIRealtimeProvider(
 *   { apiKey: process.env.OPENAI_API_KEY! },
 *   container.resolve(Tokens.LOGGER),
 *   container.resolve(Tokens.METRICS),
 * );
 * container.registerInstance(Tokens.LLM_PROVIDER, provider);
 * ```
 */
export function createOpenAIRealtimeProvider(
  options: OpenAIRealtimeProviderOptions,
  logger: ILogger,
  metrics: IMetricsCollector
): OpenAIRealtimeProvider {
  const result = OpenAIRealtimeConfigSchema.safeParse(options);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new ConfigurationError(
      `OpenAIRealtimeProvider configuration invalid:\n${issues}`,
      { issues: result.error.issues }
    );
  }

  return new OpenAIRealtimeProvider(result.data, logger, metrics);
}
