import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { TaskMetrics, TrendPoint, PerformanceMetrics } from '../types/analytics.interface';

// .NET EF Core stores TaskItemStatus and TaskPriority as integers
const STATUS_NAMES: Record<number, string> = {
  0: 'Pending',
  1: 'InProgress',
  2: 'Completed',
  3: 'Cancelled',
};

const PRIORITY_NAMES: Record<number, string> = {
  0: 'Low',
  1: 'Medium',
  2: 'High',
  3: 'Critical',
};

@Injectable()
export class AnalyticsService {
  constructor(@Inject('DATABASE_POOL') private readonly db: Pool) {}

  async getMetrics(): Promise<TaskMetrics> {
    const [statusRows, priorityRows, totalRow] = await Promise.all([
      this.db.query(`
        SELECT "Status" AS status, COUNT(*) AS count
        FROM "Tasks"
        WHERE "IsDeleted" = false
        GROUP BY "Status"
      `),
      this.db.query(`
        SELECT "Priority" AS priority, COUNT(*) AS count
        FROM "Tasks"
        WHERE "IsDeleted" = false
        GROUP BY "Priority"
      `),
      this.db.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE "Status" = 2) AS completed
        FROM "Tasks"
        WHERE "IsDeleted" = false
      `),
    ]);

    const byStatus = Object.fromEntries(
      statusRows.rows.map(r => [STATUS_NAMES[r.status] ?? String(r.status), parseInt(r.count)]),
    );
    const byPriority = Object.fromEntries(
      priorityRows.rows.map(r => [PRIORITY_NAMES[r.priority] ?? String(r.priority), parseInt(r.count)]),
    );

    const { total, completed } = totalRow.rows[0];
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total: parseInt(total),
      byStatus,
      byType: {},  // .NET schema has no task-type column
      byPriority,
      successRate,
      avgProcessingTimeMs: 0,  // .NET schema has no duration column
    };
  }

  async getTrends(hours = 24): Promise<TrendPoint[]> {
    // Use UpdatedAt as a proxy for completion time (no dedicated completed_at column)
    const { rows } = await this.db.query(
      `
      SELECT
        date_trunc('hour', "UpdatedAt") AS hour,
        COUNT(*) FILTER (WHERE "Status" = 2) AS completed,
        COUNT(*) FILTER (WHERE "Status" = 3) AS failed
      FROM "Tasks"
      WHERE "IsDeleted" = false
        AND "UpdatedAt" >= NOW() - ($1 || ' hours')::INTERVAL
      GROUP BY hour
      ORDER BY hour ASC
      `,
      [hours],
    );

    return rows.map(r => ({
      hour: r.hour,
      completed: parseInt(r.completed),
      failed: parseInt(r.failed),
    }));
  }

  async getPerformance(): Promise<PerformanceMetrics> {
    const [priorityRows, assigneeRows, throughputRow] = await Promise.all([
      // Avg time from CreatedAt to UpdatedAt for completed tasks, grouped by priority
      this.db.query(`
        SELECT
          "Priority" AS priority,
          AVG(EXTRACT(EPOCH FROM ("UpdatedAt" - "CreatedAt")) * 1000) AS avg_duration_ms
        FROM "Tasks"
        WHERE "IsDeleted" = false AND "Status" = 2
        GROUP BY "Priority"
      `),
      this.db.query(`
        SELECT
          "AssignedToId" AS worker,
          COUNT(*) FILTER (WHERE "Status" = 2) AS completed,
          COUNT(*) FILTER (WHERE "Status" = 3) AS failed,
          AVG(EXTRACT(EPOCH FROM ("UpdatedAt" - "CreatedAt")) * 1000)
            FILTER (WHERE "Status" = 2) AS avg_duration_ms
        FROM "Tasks"
        WHERE "IsDeleted" = false AND "AssignedToId" IS NOT NULL
        GROUP BY "AssignedToId"
      `),
      this.db.query(`
        SELECT COUNT(*) AS count
        FROM "Tasks"
        WHERE "IsDeleted" = false
          AND "Status" = 2
          AND "UpdatedAt" >= NOW() - INTERVAL '1 hour'
      `),
    ]);

    return {
      avgProcessingTimeByType: Object.fromEntries(
        priorityRows.rows.map(r => [
          PRIORITY_NAMES[r.priority] ?? String(r.priority),
          Math.round(parseFloat(r.avg_duration_ms) || 0),
        ]),
      ),
      workerStats: assigneeRows.rows.map(r => ({
        worker: r.worker,
        completed: parseInt(r.completed),
        failed: parseInt(r.failed),
        avgDurationMs: Math.round(parseFloat(r.avg_duration_ms) || 0),
      })),
      throughputPerHour: parseInt(throughputRow.rows[0].count),
    };
  }
}
