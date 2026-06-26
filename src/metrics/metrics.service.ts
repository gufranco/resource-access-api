import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type { Env } from '../config/env.schema';

type HttpLabel = 'method' | 'route' | 'status';

/**
 * Prometheus registry plus RED-style HTTP metrics. The /metrics endpoint
 * exposes these for a Prometheus, Grafana Agent, or Datadog OpenMetrics scrape.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  private readonly enabled: boolean;
  private readonly httpDuration: Histogram<HttpLabel>;
  private readonly httpTotal: Counter<HttpLabel>;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.enabled = config.get('METRICS_ENABLED', { infer: true });
    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });
    this.httpTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });
    if (this.enabled) {
      collectDefaultMetrics({ register: this.registry });
    }
  }

  observe(method: string, route: string, status: number, durationSeconds: number): void {
    if (!this.enabled) {
      return;
    }
    const labels = { method, route, status: status.toString() };
    this.httpDuration.observe(labels, durationSeconds);
    this.httpTotal.inc(labels);
  }

  contentType(): string {
    return this.registry.contentType;
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
