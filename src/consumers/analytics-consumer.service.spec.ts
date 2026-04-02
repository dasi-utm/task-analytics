/**
 *  scenarios:
 *  Handles all four event types and writes them to the DB
 *  Acknowledges a successfully processed message
 *  Nacks (without requeue) a message whose payload cannot be parsed
 *  Nacks (without requeue) when the DB write fails
 *  Ignores null messages without throwing
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConsumeMessage } from 'amqplib';
import { AnalyticsConsumerService } from './analytics-consumer.service';
import { TaskMessage } from '../types/analytics.interface';

type ConsumeCallback = (msg: ConsumeMessage | null) => Promise<void>;

let onMessage: ConsumeCallback | undefined;

const mockChannel = {
  prefetch: jest.fn().mockResolvedValue(undefined),
  consume: jest.fn().mockImplementation(
    (_queue: string, cb: ConsumeCallback) => {
      onMessage = cb;
      return Promise.resolve({ consumerTag: 'analytics-tag' });
    },
  ),
  ack: jest.fn(),
  nack: jest.fn(),
};

const mockRabbitMQ = {
  connect: jest.fn().mockResolvedValue(undefined),
  getChannel: jest.fn().mockReturnValue(mockChannel),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
const mockPool = { query: mockQuery };

function makeMessage(event: Partial<TaskMessage>): ConsumeMessage {
  const full: TaskMessage = {
    eventType: 'TaskCreated',
    timestamp: new Date().toISOString(),
    correlationId: event.payload?.taskId ?? 'task-uuid-0000',
    payload: { taskId: 'task-uuid-0000', ...event.payload },
    ...event,
  };
  return {
    content: Buffer.from(JSON.stringify(full)),
    properties: {} as any,
    fields: {} as any,
  } as ConsumeMessage;
}

function malformed(): ConsumeMessage {
  return {
    content: Buffer.from('not-valid-json'),
    properties: {} as any,
    fields: {} as any,
  } as ConsumeMessage;
}

describe('AnalyticsConsumerService', () => {
  let module: TestingModule;

  beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    mockChannel.ack.mockReset();
    mockChannel.nack.mockReset();
    mockQuery.mockReset().mockResolvedValue({ rows: [] });
    mockRabbitMQ.connect.mockReset().mockResolvedValue(undefined);
    onMessage = undefined;

    module = await Test.createTestingModule({
      providers: [
        AnalyticsConsumerService,
        { provide: 'RABBITMQ_CONNECTION', useValue: mockRabbitMQ },
        { provide: 'DATABASE_POOL', useValue: mockPool },
      ],
    }).compile();

    const service = module.get<AnalyticsConsumerService>(AnalyticsConsumerService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    const service = module.get<AnalyticsConsumerService>(AnalyticsConsumerService);
    await service.onModuleDestroy();
    jest.restoreAllMocks();
  });

  describe('A. Event handling', () => {
    it.each([
      'TaskCreated',
      'TaskUpdated',
      'TaskDeleted',
      'TaskStatusChanged',
    ] as TaskMessage['eventType'][])(
      'inserts a row for eventType=%s',
      async (eventType) => {
        const taskId = `task-${eventType}-001`;
        const msg = makeMessage({
          eventType,
          payload: { taskId },
        });

        await onMessage!(msg);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO task_events'),
          [taskId, eventType, expect.any(String)],
        );
      },
    );

    it('passes the task ID as the first query parameter', async () => {
      const taskId = 'target-task-id-999';
      await onMessage!(makeMessage({ payload: { taskId } }));

      const [, params] = mockQuery.mock.calls[0];
      expect(params[0]).toBe(taskId);
    });

    it('passes the event type as the second query parameter', async () => {
      await onMessage!(makeMessage({ eventType: 'TaskStatusChanged' }));

      const [, params] = mockQuery.mock.calls[0];
      expect(params[1]).toBe('TaskStatusChanged');
    });

    it('serialises payload as JSON string for the third parameter', async () => {
      const taskId = 'task-json-check';
      await onMessage!(makeMessage({ payload: { taskId, newStatus: 'Completed' } }));

      const [, params] = mockQuery.mock.calls[0];
      const parsed = JSON.parse(params[2]);
      expect(parsed.taskId).toBe(taskId);
      expect(parsed.newStatus).toBe('Completed');
    });
  });

  describe('Acknowledgement', () => {
    it('acks the message after a successful DB write', async () => {
      const msg = makeMessage({ payload: { taskId: 'ack-test-001' } });

      await onMessage!(msg);

      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });

    it('acks each message independently', async () => {
      const msg1 = makeMessage({ payload: { taskId: 'multi-001' } });
      const msg2 = makeMessage({ payload: { taskId: 'multi-002' } });

      await onMessage!(msg1);
      await onMessage!(msg2);

      expect(mockChannel.ack).toHaveBeenCalledTimes(2);
    });
  });

  describe('Malformed JSON', () => {
    it('nacks the message without requeue on JSON parse error', async () => {
      await onMessage!(malformed());

      expect(mockChannel.nack).toHaveBeenCalledWith(malformed(), false, false);
      expect(mockChannel.ack).not.toHaveBeenCalled();
    });

    it('does not write to the DB when JSON parsing fails', async () => {
      await onMessage!(malformed());

      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // ── D. Nack on DB failure ──────────────────────────────────────────────────

  describe('D. DB write failure', () => {
    it('nacks the message without requeue when DB.query throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection refused'));
      const msg = makeMessage({ payload: { taskId: 'db-fail-001' } });

      await onMessage!(msg);

      expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
      expect(mockChannel.ack).not.toHaveBeenCalled();
    });

    it('does not throw an uncaught error when DB fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('timeout'));

      await expect(
        onMessage!(makeMessage({ payload: { taskId: 'db-fail-002' } })),
      ).resolves.toBeUndefined();
    });
  });

  // ── E. Null message ────────────────────────────────────────────────────────

  describe('E. Null message guard', () => {
    it('returns immediately on null without acking or nacking', async () => {
      await onMessage!(null);

      expect(mockChannel.ack).not.toHaveBeenCalled();
      expect(mockChannel.nack).not.toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('F. Queue setup', () => {
    it('sets prefetch to 10 on init', () => {
      expect(mockChannel.prefetch).toHaveBeenCalledWith(10);
    });

    it('registers a consumer on the analytics-queue', () => {
      expect(mockChannel.consume).toHaveBeenCalledWith(
        'analytics-queue',
        expect.any(Function),
        { noAck: false },
      );
    });

    it('connects to RabbitMQ on init', () => {
      expect(mockRabbitMQ.connect).toHaveBeenCalledTimes(1);
    });
  });
});
