import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RabbitHealthIndicator } from './rabbitmq.health';
import { DatabaseHealthIndicator } from './database.health';

@Module({
    imports: [TerminusModule],
    controllers: [HealthController],
    providers: [RabbitHealthIndicator, DatabaseHealthIndicator],

})
export class HealthModule {}
