import { Injectable } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    private readonly cache: CacheService,
  ) {}

  async isHealthy(key = 'redis'): Promise<HealthIndicatorResult> {
    const check = this.indicator.check(key);
    const healthy = await this.cache.ping();
    return healthy ? check.up() : check.down();
  }
}
