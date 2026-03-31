import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, HealthCheck } from '@nestjs/terminus';
import { RabbitHealthIndicator } from './rabbitmq.health';
import { DatabaseHealthIndicator } from './database.health';

@Controller('health')
export class HealthController {
    constructor(
    private readonly health: HealthCheckService,
    private readonly db: DatabaseHealthIndicator,
    private readonly rabbit: RabbitHealthIndicator,
    ) {}

    @Get()
    @HealthCheck()
    check() {
    return this.health.check([
        () => this.db.isHealthy('database'),
        () => this.rabbit.isHealthy('rabbitmq'),
    ]);
    }

    @Get('live')
    liveness() {
    return { status: 'ok' };
    }
}
