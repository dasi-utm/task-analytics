import { Module } from '@nestjs/common';
import { AnalyticsConsumerService } from './analytics-consumer.service';

@Module({
  providers: [AnalyticsConsumerService],
})
export class ConsumerModule {}
