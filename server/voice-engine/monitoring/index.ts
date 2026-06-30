import type { Timestamp } from '../types/index.js';

export type HealthStatusLevel = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthStatus {
  readonly status: HealthStatusLevel;
  readonly message: string;
  readonly checkedAt: Timestamp;
}

export interface ProviderHealth {
  readonly providerName: string;
  readonly health: HealthStatus;
  readonly latencyMs: number;
}

export interface ReadyStatus {
  readonly ready: boolean;
  readonly providers: readonly ProviderHealth[];
  readonly timestamp: Timestamp;
}
