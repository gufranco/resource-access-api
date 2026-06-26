import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.constants';

@Injectable()
export class DbHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async isHealthy(key = 'database'): Promise<HealthIndicatorResult> {
    const check = this.indicator.check(key);
    try {
      await this.pool.query('SELECT 1');
      return check.up();
    } catch (error: unknown) {
      return check.down({ message: String(error) });
    }
  }
}
