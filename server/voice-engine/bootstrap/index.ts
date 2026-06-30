/**
 * @module bootstrap
 *
 * Public barrel export for the Voice Engine bootstrap layer.
 *
 * ## Usage
 * ```typescript
 * import { createVoiceEngineRuntime } from '../voice-engine/bootstrap/index.js';
 * ```
 */

export { loadEnvironment } from './EnvironmentLoader.js';
export type { LoadedEnvironment } from './EnvironmentLoader.js';

export { loadConfig } from './ConfigLoader.js';
export type { ConfigOverrides } from './ConfigLoader.js';

export { DependencyContainer, token } from './DependencyContainer.js';
export type { Token } from './DependencyContainer.js';

export { ProviderResolver, Tokens } from './ProviderResolver.js';
export type { IProviderResolver } from './ProviderResolver.js';

export { HealthRegistry } from './HealthRegistry.js';
export type { HealthCallback } from './HealthRegistry.js';

export {
  createVoiceEngineRuntime,
  CONFIG_TOKEN,
  PROVIDER_RESOLVER_TOKEN,
} from './Bootstrap.js';
export type { BootstrapOptions, VoiceEngineRuntime } from './Bootstrap.js';
