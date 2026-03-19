import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { RabbitMQConnection } from '../config/rabbitmq';
import { TaskMessage } from '../types/analytics.interface';

@Injectable()
export class AnalyticsConsumerService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject('RABBITMQ_CONNECTION') private readonly rabbitMQ: RabbitMQConnection,
    @Inject('DATABASE_POOL') private readonly db: Pool,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitMQ.connect();
    await this.startConsuming();
  }

  async onModuleDestroy(): Promise<void> {
    await this.rabbitMQ.close();
  }

  private async startConsuming(): Promise<void> {
    const channel = this.rabbitMQ.getChannel();
    await channel.prefetch(10);

    await channel.consume('analytics-queue', async (msg) => {
      if (!msg) return;

      try {
        const message: TaskMessage = JSON.parse(msg.content.toString());
        await this.handleTaskEvent(message);
        channel.ack(msg);
      } catch (error) {
        console.error('Failed to process analytics message:', error);
        channel.nack(msg, false, false);
      }
    }, { noAck: false });

    console.log('Analytics consumer started, waiting for task events (task.created, task.updated, task.deleted, task.status-changed)...');
  }

  private async handleTaskEvent(message: TaskMessage): Promise<void> {
    const { eventType, payload } = message;
    const taskId = payload.taskId;

    // Audit-log every event to task_events (table created from project schema)
    await this.db.query(
      `INSERT INTO task_events (task_id, event_type, payload)
       VALUES ($1, $2, $3)`,
      [taskId, eventType, JSON.stringify(payload)],
    );

    console.log(`Analytics: recorded ${eventType} for task ${taskId}`);
  }
}
