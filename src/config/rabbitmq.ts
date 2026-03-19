import * as amqp from 'amqplib';

export class RabbitMQConnection {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;

  async connect(): Promise<void> {
    try {
      const url = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();

      await this.channel.assertExchange('task-events', 'topic', { durable: true });
      await this.channel.assertQueue('analytics-queue', { durable: true });

      // Bind to all task lifecycle events published by the .NET API
      await this.channel.bindQueue('analytics-queue', 'task-events', 'task.created');
      await this.channel.bindQueue('analytics-queue', 'task-events', 'task.updated');
      await this.channel.bindQueue('analytics-queue', 'task-events', 'task.deleted');
      await this.channel.bindQueue('analytics-queue', 'task-events', 'task.status-changed');

      console.log('Analytics Service connected to RabbitMQ');
    } catch (error) {
      console.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  getChannel(): amqp.Channel {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }
    return this.channel;
  }

  async close(): Promise<void> {
    if (this.channel) await this.channel.close();
    if (this.connection) await this.connection.close();
  }
}
