import { Injectable, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Pool } from 'pg';

@Injectable()
export class MetricsAggregatorService {
  constructor(@Inject('DATABASE_POOL') private readonly db: Pool) {}

  // Runs every minute — logs a quick summary to stdout
  @Cron(CronExpression.EVERY_MINUTE)
  async logMinuteSnapshot(): Promise<void> {
    const { rows } = await this.db.query(`
      SELECT "Status" AS status, COUNT(*) AS count
      FROM "Tasks"
      WHERE "IsDeleted" = false
      GROUP BY "Status"
    `);

    // Map integer status values to names
    const statusNames: Record<number, string> = { 0: 'Pending', 1: 'InProgress', 2: 'Completed', 3: 'Cancelled' };
    const summary = Object.fromEntries(rows.map(r => [statusNames[r.status] ?? String(r.status), parseInt(r.count)]));
    console.log('[MetricsAggregator] Task snapshot:', summary);
  }

  // Runs every hour — marks long-running InProgress tasks as Cancelled (Status=3)
  @Cron(CronExpression.EVERY_HOUR)
  async resetStaleTasks(): Promise<void> {
    // Status 1 = InProgress, Status 3 = Cancelled
    const { rowCount } = await this.db.query(`
      UPDATE "Tasks"
      SET "Status" = 3,
          "UpdatedAt" = NOW()
      WHERE "Status" = 1
        AND "UpdatedAt" < NOW() - INTERVAL '30 minutes'
        AND "IsDeleted" = false
    `);

    if (rowCount > 0) {
      console.log(`[MetricsAggregator] Cancelled ${rowCount} stale InProgress task(s)`);
    }
  }
}
