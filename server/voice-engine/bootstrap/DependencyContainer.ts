/**
 * @module DependencyContainer
 *
 * A lightweight, type-safe dependency injection container with no external
 * library dependencies.
 *
 * ## Purpose
 * Centralises service registration and resolution. Supports singleton
 * instances, lazy factory functions, and pre-constructed instances.
 *
 * ## Ownership
 * One container is created per Voice Engine runtime. It is owned by
 * `Bootstrap.ts` and passed (read-only) to modules that need resolution.
 *
 * ## Thread Safety
 * Registration must complete before any concurrent resolution begins.
 * After the bootstrap phase, the container is considered sealed.
 * `resolve()` is safe to call concurrently once sealed.
 *
 * ## Lifecycle
 * 1. Bootstrap registers all services.
 * 2. Container is sealed (no further registration).
 * 3. Components resolve dependencies during initialisation.
 * 4. `clear()` is called on shutdown to release references.
 */

import { ConfigurationError } from '../errors/index.js';
import { ErrorCode } from '../errors/index.js';

/** The type of registration stored for each token. */
type RegistrationKind = 'singleton' | 'factory' | 'instance';

interface Registration<T> {
  readonly kind: RegistrationKind;
  readonly factory?: () => T;
  instance?: T;
  readonly readonly: boolean;
}

/**
 * An opaque token used to identify a registered service.
 * Use `token<T>(name)` to create typed tokens.
 */
export interface Token<T> {
  readonly _type: T;
  readonly name: string;
}

/**
 * Creates a typed DI token with the given human-readable name.
 *
 * @example
 * ```typescript
 * const LOGGER_TOKEN = token<ILogger>('ILogger');
 * container.registerInstance(LOGGER_TOKEN, myLogger);
 * const logger = container.resolve(LOGGER_TOKEN);
 * ```
 */
export function token<T>(name: string): Token<T> {
  return { name } as Token<T>;
}

/**
 * A lightweight dependency injection container.
 *
 * Supports singleton (lazy), factory (called fresh on each resolve), and
 * pre-constructed instance registrations.
 */
export class DependencyContainer {
  private readonly _registry = new Map<string, Registration<unknown>>();
  private _sealed = false;

  /**
   * Registers a singleton: the factory is called at most once, and the
   * result is cached for all subsequent `resolve()` calls.
   *
   * @throws {ConfigurationError} if the token is already registered as readonly.
   */
  registerSingleton<T>(tok: Token<T>, factory: () => T): this {
    this._assertWritable(tok.name);
    this._registry.set(tok.name, { kind: 'singleton', factory, readonly: false });
    return this;
  }

  /**
   * Registers a factory: the factory is called on every `resolve()` call.
   * No caching occurs.
   *
   * @throws {ConfigurationError} if the token is already registered as readonly.
   */
  registerFactory<T>(tok: Token<T>, factory: () => T): this {
    this._assertWritable(tok.name);
    this._registry.set(tok.name, { kind: 'factory', factory, readonly: false });
    return this;
  }

  /**
   * Registers a pre-constructed instance. The instance is returned directly
   * on every `resolve()` call.
   *
   * @param readonly_ - If true, the registration cannot be overwritten.
   * @throws {ConfigurationError} if the token is already registered as readonly.
   */
  registerInstance<T>(tok: Token<T>, instance: T, readonly_: boolean = false): this {
    this._assertWritable(tok.name);
    this._registry.set(tok.name, { kind: 'instance', instance, readonly: readonly_ });
    return this;
  }

  /**
   * Resolves a registered token to its value.
   *
   * @throws {ConfigurationError} if the token has not been registered.
   */
  resolve<T>(tok: Token<T>): T {
    const reg = this._registry.get(tok.name) as Registration<T> | undefined;
    if (!reg) {
      throw new ConfigurationError(`DependencyContainer: token "${tok.name}" is not registered.`);
    }

    if (reg.kind === 'instance') {
      return reg.instance as T;
    }

    if (reg.kind === 'factory') {
      return reg.factory!() as T;
    }

    if (reg.kind === 'singleton') {
      if (reg.instance === undefined) {
        (reg as Registration<T>).instance = reg.factory!() as T;
      }
      return reg.instance as T;
    }

    throw new ConfigurationError(
      `DependencyContainer: unknown registration kind for "${tok.name}".`,
      { kind: (reg as { kind: string }).kind }
    );
  }

  /**
   * Returns true if the given token has a registration.
   */
  has<T>(tok: Token<T>): boolean {
    return this._registry.has(tok.name);
  }

  /**
   * Removes all registrations. Intended for use during shutdown or in tests.
   */
  clear(): void {
    this._sealed = false;
    this._registry.clear();
  }

  /**
   * Seals the container. After sealing, no new registrations are permitted.
   */
  seal(): void {
    this._sealed = true;
  }

  /** Whether the container has been sealed against further registration. */
  get isSealed(): boolean {
    return this._sealed;
  }

  private _assertWritable(name: string): void {
    if (this._sealed) {
      throw new ConfigurationError(
        `DependencyContainer: container is sealed; cannot register "${name}".`
      );
    }
    const existing = this._registry.get(name);
    if (existing?.readonly) {
      throw new ConfigurationError(
        `DependencyContainer: token "${name}" is marked readonly and cannot be overwritten.`
      );
    }
  }
}
