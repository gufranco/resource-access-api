import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.schema';
import { MetricsService } from './metrics.service';

function configWith(values: Partial<Record<keyof Env, unknown>>): ConfigService<Env, true> {
  return {
    get: (key: string): unknown => values[key as keyof Env],
  } as unknown as ConfigService<Env, true>;
}

describe('MetricsService', () => {
  it('records HTTP samples when enabled', async () => {
    // Arrange
    const service = new MetricsService(configWith({ METRICS_ENABLED: true }));

    // Act
    service.observe('GET', '/resources', 200, 0.012);
    const text = await service.metrics();

    // Assert
    expect(service.contentType()).toContain('text/plain');
    expect(text).toContain('http_requests_total');
    expect(text).toContain('method="GET"');
  });

  it('does not collect default metrics when disabled', async () => {
    // Arrange
    const service = new MetricsService(configWith({ METRICS_ENABLED: false }));

    // Act
    service.observe('GET', '/resources', 200, 0.012);
    const text = await service.metrics();

    // Assert
    expect(text).not.toContain('process_cpu_user_seconds_total');
  });
});
