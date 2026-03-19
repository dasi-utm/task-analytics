import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('metrics')
  getMetrics() {
    return this.analyticsService.getMetrics();
  }

  @Get('trends')
  getTrends(@Query('hours') hours?: string) {
    return this.analyticsService.getTrends(hours ? parseInt(hours) : 24);
  }

  @Get('performance')
  getPerformance() {
    return this.analyticsService.getPerformance();
  }
}
