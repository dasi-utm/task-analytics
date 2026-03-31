import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitHealthIndicator {
    private connectionUrl = process.env.RABBITMQ_URL!;

    constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    ) {}

    async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    try {
        const conn = await amqp.connect(
        this.connectionUrl ?? 'amqp://localhost:5672',
        );
        const channel = await conn.createChannel();

        await channel.checkQueue(
        process.env.RABBITMQ_QUEUE ?? 'health_check_queue',
        );

        await channel.close();
        await conn.close();

        return indicator.up();
    } catch (error) {
        return indicator.down(
        typeof error === 'object' && error && 'message' in error
            ? (error as Error).message
            : 'RabbitMQ unavailable',
        );
    }
    }
}
