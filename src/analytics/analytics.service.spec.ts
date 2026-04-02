import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';

type QueryResult = { rows: Record<string, unknown>[] };

function makePool(responses: QueryResult[]) {
  let call = 0;
  return { query: jest.fn().mockImplementation(() => Promise.resolve(responses[call++])) };
}

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let mockPool: { query: jest.Mock };

  async function build(responses: QueryResult[]) {
    mockPool = makePool(responses);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: 'DATABASE_POOL', useValue: mockPool },
      ],
    }).compile();
    service = module.get<AnalyticsService>(AnalyticsService);
  }

  describe('getMetrics()', () => {
    it('returns correct totals and success rate from DB rows', async () => {
      await build([
        // status query
        { rows: [{ status: 0, count: '3' }, { status: 2, count: '5' }] },
        // priority query
        { rows: [{ priority: 1, count: '4' }, { priority: 2, count: '4' }] },
        // total/completed query
        { rows: [{ total: '8', completed: '5' }] },
      ]);

      const metrics = await service.getMetrics();

      expect(metrics.total).toBe(8);
      expect(metrics.successRate).toBe(63);          // round(5/8 * 100)
      expect(metrics.byStatus['Pending']).toBe(3);
      expect(metrics.byStatus['Completed']).toBe(5);
      expect(metrics.byPriority['Medium']).toBe(4);
      expect(metrics.byPriority['High']).toBe(4);
    });

    it('returns successRate=0 when there are no tasks', async () => {
      await build([
        { rows: [] },
        { rows: [] },
        { rows: [{ total: '0', completed: '0' }] },
      ]);

      const metrics = await service.getMetrics();

      expect(metrics.total).toBe(0);
      expect(metrics.successRate).toBe(0);
    });

    it('maps unknown numeric status to its string representation', async () => {
      await build([
        { rows: [{ status: 99, count: '1' }] },
        { rows: [] },
        { rows: [{ total: '1', completed: '0' }] },
      ]);

      const metrics = await service.getMetrics();

      expect(metrics.byStatus['99']).toBe(1);
    });

    it('maps all known statuses correctly', async () => {
      await build([
        {
          rows: [
            { status: 0, count: '1' },  // Pending
            { status: 1, count: '2' },  // InProgress
            { status: 2, count: '3' },  // Completed
            { status: 3, count: '4' },  // Cancelled
          ],
        },
        { rows: [] },
        { rows: [{ total: '10', completed: '3' }] },
      ]);

      const { byStatus } = await service.getMetrics();

      expect(byStatus['Pending']).toBe(1);
      expect(byStatus['InProgress']).toBe(2);
      expect(byStatus['Completed']).toBe(3);
      expect(byStatus['Cancelled']).toBe(4);
    });

    it('maps all known priorities correctly', async () => {
      await build([
        { rows: [] },
        {
          rows: [
            { priority: 0, count: '1' },  // Low
            { priority: 1, count: '2' },  // Medium
            { priority: 2, count: '3' },  // High
            { priority: 3, count: '4' },  // Critical
          ],
        },
        { rows: [{ total: '10', completed: '0' }] },
      ]);

      const { byPriority } = await service.getMetrics();

      expect(byPriority['Low']).toBe(1);
      expect(byPriority['Medium']).toBe(2);
      expect(byPriority['High']).toBe(3);
      expect(byPriority['Critical']).toBe(4);
    });

    it('runs exactly 3 DB queries', async () => {
      await build([
        { rows: [] },
        { rows: [] },
        { rows: [{ total: '0', completed: '0' }] },
      ]);

      await service.getMetrics();

      expect(mockPool.query).toHaveBeenCalledTimes(3);
    });

    it('always returns empty byType object (no type column in schema)', async () => {
      await build([
        { rows: [] },
        { rows: [] },
        { rows: [{ total: '0', completed: '0' }] },
      ]);

      const { byType } = await service.getMetrics();

      expect(byType).toEqual({});
    });

    it('always returns avgProcessingTimeMs=0 (no duration column in schema)', async () => {
      await build([
        { rows: [] },
        { rows: [] },
        { rows: [{ total: '0', completed: '0' }] },
      ]);

      const { avgProcessingTimeMs } = await service.getMetrics();

      expect(avgProcessingTimeMs).toBe(0);
    });
  });

  describe('getTrends()', () => {
    const sampleRows = [
      { hour: '2026-04-01T10:00:00.000Z', completed: '3', failed: '1' },
      { hour: '2026-04-01T11:00:00.000Z', completed: '5', failed: '0' },
    ];

    it('returns mapped trend points', async () => {
      await build([{ rows: sampleRows }]);

      const trends = await service.getTrends(24);

      expect(trends).toHaveLength(2);
      expect(trends[0].completed).toBe(3);
      expect(trends[0].failed).toBe(1);
      expect(trends[1].completed).toBe(5);
    });

    it('passes the hours parameter to the DB query', async () => {
      await build([{ rows: [] }]);

      await service.getTrends(168);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        [168],
      );
    });

    it('defaults to 24 hours', async () => {
      await build([{ rows: [] }]);

      await service.getTrends();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        [24],
      );
    });

    it('returns an empty array when there are no rows', async () => {
      await build([{ rows: [] }]);

      const trends = await service.getTrends(24);

      expect(trends).toEqual([]);
    });
  });

  // ── getPerformance ─────────────────────────────────────────────────────────

  describe('getPerformance()', () => {
    it('returns mapped performance metrics', async () => {
      await build([
        // priority / avg duration
        { rows: [{ priority: 2, avg_duration_ms: '1500.5' }] },
        // worker stats
        {
          rows: [
            {
              worker: 'worker-uuid-1',
              completed: '10',
              failed: '2',
              avg_duration_ms: '2000',
            },
          ],
        },
        // throughput
        { rows: [{ count: '7' }] },
      ]);

      const perf = await service.getPerformance();

      expect(perf.avgProcessingTimeByType['High']).toBe(1501); // Math.round
      expect(perf.workerStats).toHaveLength(1);
      expect(perf.workerStats[0].worker).toBe('worker-uuid-1');
      expect(perf.workerStats[0].completed).toBe(10);
      expect(perf.workerStats[0].failed).toBe(2);
      expect(perf.workerStats[0].avgDurationMs).toBe(2000);
      expect(perf.throughputPerHour).toBe(7);
    });

    it('handles null avg_duration_ms (no completed tasks for that worker)', async () => {
      await build([
        { rows: [] },
        {
          rows: [
            {
              worker: 'worker-uuid-2',
              completed: '0',
              failed: '5',
              avg_duration_ms: null,
            },
          ],
        },
        { rows: [{ count: '0' }] },
      ]);

      const perf = await service.getPerformance();

      expect(perf.workerStats[0].avgDurationMs).toBe(0);
    });

    it('returns empty workerStats and zero throughput with no data', async () => {
      await build([
        { rows: [] },
        { rows: [] },
        { rows: [{ count: '0' }] },
      ]);

      const perf = await service.getPerformance();

      expect(perf.workerStats).toEqual([]);
      expect(perf.throughputPerHour).toBe(0);
      expect(perf.avgProcessingTimeByType).toEqual({});
    });

    it('runs exactly 3 DB queries', async () => {
      await build([
        { rows: [] },
        { rows: [] },
        { rows: [{ count: '0' }] },
      ]);

      await service.getPerformance();

      expect(mockPool.query).toHaveBeenCalledTimes(3);
    });
  });
});
