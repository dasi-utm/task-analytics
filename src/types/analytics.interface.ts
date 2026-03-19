// Event schema published by the .NET TaskManager.API
export interface TaskMessage {
  eventType: 'TaskCreated' | 'TaskUpdated' | 'TaskDeleted' | 'TaskStatusChanged';
  timestamp: string;
  correlationId: string;
  payload: {
    taskId: string;
    // TaskCreated / TaskUpdated
    title?: string;
    createdBy?: string;
    // TaskStatusChanged
    oldStatus?: string;
    newStatus?: string;
  };
}

export interface TaskMetrics {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
  successRate: number;
  avgProcessingTimeMs: number;
}

export interface TrendPoint {
  hour: string;
  completed: number;
  failed: number;
}

export interface PerformanceMetrics {
  avgProcessingTimeByType: Record<string, number>;
  workerStats: Array<{ worker: string; completed: number; failed: number; avgDurationMs: number }>;
  throughputPerHour: number;
}
