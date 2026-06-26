import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it } from 'vitest';
import type { Env } from '../config/env.schema';
import { CacheService } from './cache.service';

function configWith(values: Partial<Record<keyof Env, unknown>>): ConfigService<Env, true> {
  return {
    get: (key: string): unknown => values[key as keyof Env],
  } as unknown as ConfigService<Env, true>;
}

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6380';

describe('CacheService', () => {
  let service: CacheService;

  afterEach(async () => {
    await service.onApplicationShutdown();
  });

  it('returns the factory value when caching is disabled', async () => {
    // Arrange
    service = new CacheService(
      configWith({ CACHE_ENABLED: false, CACHE_TTL_SECONDS: 30, REDIS_URL }),
    );

    // Act
    const value = await service.getOrSet('disabled-key', () => Promise.resolve('fresh'));

    // Assert
    expect(value).toBe('fresh');
  });

  it('reports a healthy ping when caching is disabled', async () => {
    // Arrange
    service = new CacheService(
      configWith({ CACHE_ENABLED: false, CACHE_TTL_SECONDS: 30, REDIS_URL }),
    );

    // Act
    const healthy = await service.ping();

    // Assert
    expect(healthy).toBe(true);
  });

  it('serves the cached value on the second call against real Redis', async () => {
    // Arrange
    service = new CacheService(
      configWith({ CACHE_ENABLED: true, CACHE_TTL_SECONDS: 30, REDIS_URL }),
    );
    const key = `cache-test-${Date.now().toString()}`;

    // Act
    const first = await service.getOrSet(key, () => Promise.resolve({ n: 1 }));
    const second = await service.getOrSet(key, () =>
      Promise.reject(new Error('factory must not run on a cache hit')),
    );

    // Assert
    expect(first).toEqual({ n: 1 });
    expect(second).toEqual({ n: 1 });
  });

  it('pings real Redis successfully', async () => {
    // Arrange
    service = new CacheService(
      configWith({ CACHE_ENABLED: true, CACHE_TTL_SECONDS: 30, REDIS_URL }),
    );

    // Act
    const healthy = await service.ping();

    // Assert
    expect(healthy).toBe(true);
  });

  it('falls through to the factory when Redis is unreachable', async () => {
    // Arrange
    service = new CacheService(
      configWith({
        CACHE_ENABLED: true,
        CACHE_TTL_SECONDS: 30,
        REDIS_URL: 'redis://localhost:6399',
      }),
    );

    // Act
    const value = await service.getOrSet('down-key', () => Promise.resolve('computed'));
    const healthy = await service.ping();

    // Assert
    expect(value).toBe('computed');
    expect(healthy).toBe(false);
  });
});
