import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.schema';

/**
 * Best-effort response cache. A Redis outage must never fail a request, so
 * every cache operation logs and falls through to the source of truth.
 */
@Injectable()
export class CacheService implements OnApplicationShutdown {
  private readonly logger = new Logger(CacheService.name);
  private readonly client: Redis | null;
  private readonly ttlSeconds: number;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.ttlSeconds = config.get('CACHE_TTL_SECONDS', { infer: true });
    const enabled = config.get('CACHE_ENABLED', { infer: true });
    this.client = enabled
      ? new Redis(config.get('REDIS_URL', { infer: true }), {
          maxRetriesPerRequest: 2,
          enableOfflineQueue: true,
        })
      : null;
    this.client?.on('error', (error: Error) => {
      this.logger.warn(`Redis error: ${error.message}`);
    });
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>): Promise<T> {
    if (!this.client) {
      return factory();
    }
    try {
      const cached = await this.client.get(key);
      if (cached !== null) {
        return JSON.parse(cached) as T;
      }
    } catch (error: unknown) {
      this.logger.warn(`Cache read failed for ${key}: ${String(error)}`);
    }

    const value = await factory();

    try {
      await this.client.set(key, JSON.stringify(value), 'EX', this.ttlSeconds);
    } catch (error: unknown) {
      this.logger.warn(`Cache write failed for ${key}: ${String(error)}`);
    }
    return value;
  }

  async ping(): Promise<boolean> {
    if (!this.client) {
      return true;
    }
    try {
      await this.client.ping();
      return true;
    } catch (error: unknown) {
      this.logger.warn(`Redis ping failed: ${String(error)}`);
      return false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      await this.client.quit();
    } catch (error: unknown) {
      this.logger.warn(`Redis quit failed: ${String(error)}`);
    }
  }
}
