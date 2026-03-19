import { Module } from '@nestjs/common';
import { MetricsAggregatorService } from './metrics-aggregator.service';

@Module({
  providers: [MetricsAggregatorService],
})
export class SchedulersModule {}
