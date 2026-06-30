import type { Timestamp } from '../types/index.js';

export type MetricName = string;
export type MetricLabels = Readonly<Record<string, string>>;

export interface MetricEvent {
  readonly name: MetricName;
  readonly value: number;
  readonly labels: MetricLabels;
  readonly timestamp: Timestamp;
}

export interface Histogram {
  observe(value: number, labels?: MetricLabels): void;
  startTimer(labels?: MetricLabels): () => void;
}

export interface Counter {
  increment(labels?: MetricLabels, amount?: number): void;
  reset(labels?: MetricLabels): void;
}

export interface Gauge {
  set(value: number, labels?: MetricLabels): void;
  increment(labels?: MetricLabels, amount?: number): void;
  decrement(labels?: MetricLabels, amount?: number): void;
}

export interface IMetricsCollector {
  histogram(name: MetricName, buckets?: readonly number[]): Histogram;
  counter(name: MetricName): Counter;
  gauge(name: MetricName): Gauge;
  emit(event: MetricEvent): void;
}
