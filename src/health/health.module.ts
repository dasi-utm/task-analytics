import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RabbitHealthIndicator } from './rabbitmq.health';

@Module({
    imports: [TerminusModule],
    controllers: [HealthController],
    providers: [RabbitHealthIndicator],

})
export class HealthModule {}
