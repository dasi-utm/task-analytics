import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './config/database.module';
import { RabbitMQModule } from './config/rabbitmq.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ConsumerModule } from './consumers/consumer.module';
import { SchedulersModule } from './schedulers/schedulers.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    RabbitMQModule,
    AnalyticsModule,
    ConsumerModule,
    SchedulersModule,
  ],
})
export class AppModule {}
