import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { HealthIndicatorService } from '@nestjs/terminus';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    @Inject('DATABASE_POOL') private readonly pool: Pool,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    try {
      await this.pool.query('SELECT 1');
      return indicator.up();
    } catch (error) {
      return indicator.down(
        error instanceof Error ? error.message : 'Database check failed',
      );
    }
  }
}
