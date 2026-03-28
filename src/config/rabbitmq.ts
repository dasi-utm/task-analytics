import { Channel, ChannelModel, connect } from 'amqplib';

export class RabbitMQConnection {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private connectionUrl = process.env.RABBITMQ_URL!;

  async connect(): Promise<void> {
    try {
      this.connection = await connect(this.connectionUrl);
      this.channel = await this.connection.createChannel();

      await this.channel.assertExchange('task-events', 'topic', { durable: true });
      await this.channel.assertQueue('analytics-queue', { durable: true });

      // list to events published by task-api
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

  getChannel(): Channel {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }
    return this.channel;
  }

  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
    } catch (e) {
      console.error("Error while closing RabbitMQ server: ", e);
      throw e;
    }
  }
}
