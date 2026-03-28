# task-analytics

Event-driven analytics microservice for the distributed task management system. It consumes task lifecycle events from RabbitMQ, persists them to PostgreSQL, and exposes a REST API with metrics, trends, and performance data for the dashboard.

## Table of contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Docker](#docker)
- [API reference](#api-reference)
- [Message queue](#message-queue)
- [Scheduled jobs](#scheduled-jobs)
- [Project structure](#project-structure)
- [Inter-service dependencies](#inter-service-dependencies)

---

## Architecture

```
RabbitMQ (task-events exchange)
        │
        │  task.created / task.updated
        │  task.deleted / task.status-changed
        ▼
 analytics-consumer
        │
        ▼
  task_events table          ←─ PostgreSQL (taskflow DB)
        │
        ▼
  analytics-service  ──────► REST API  (:3003/api/analytics/*)
        │
  metrics-aggregator         ← cron: every minute / every hour
```

The service is intentionally read-heavy: all writes come from the queue consumer and cron jobs; all reads come from the HTTP API.

---

## Prerequisites

- Node.js >= 20
- npm >= 10
- PostgreSQL 16
- RabbitMQ 3

---

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env   # or create .env manually (see below)

# 3. Start in development mode (ts-node + nodemon, hot reload)
npm run start:dev
```

The service will be available at `http://localhost:3003`.

---

## Environment variables

Create a `.env` file in the project root:

```env
PORT=3003
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/taskflow
RABBITMQ_URL=amqp://localhost:5672
CORS_ORIGIN=*
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3003` | HTTP server port |
| `NODE_ENV` | No | `development` | Runtime environment |
| `DATABASE_URL` | Yes | `postgresql://localhost:5432/taskflow` | PostgreSQL connection string |
| `RABBITMQ_URL` | Yes | `amqp://localhost:5672` | RabbitMQ connection string |
| `CORS_ORIGIN` | No | `*` | Allowed CORS origin |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start with nodemon + ts-node (hot reload) |
| `npm start` | Start compiled output (`dist/main.js`) |
| `npm run build` | Compile TypeScript to `dist/` |

---

## Docker

**Development** (source mounted, hot reload):

```bash
docker compose up
```

**Production image only:**

```bash
docker build --target production -t task-analytics .
docker run -p 3003:3003 \
  -e DATABASE_URL=postgresql://... \
  -e RABBITMQ_URL=amqp://... \
  task-analytics
```

The `docker-compose.yml` in this directory spins up the service alongside PostgreSQL and RabbitMQ. To run the full stack with all services see the root `docker-compose.yml`.

---

## API reference

Base URL: `http://localhost:3003/api`

### `GET /analytics/metrics`

Snapshot of the current task state aggregated from the `Tasks` table.

**Response:**

```json
{
  "total": 142,
  "byStatus": { "Pending": 30, "InProgress": 12, "Completed": 95, "Cancelled": 5 },
  "byPriority": { "Low": 40, "Medium": 60, "High": 30, "Critical": 12 },
  "successRate": 95.0,
  "avgProcessingTimeMs": 4200
}
```

---

### `GET /analytics/trends?hours=24`

Hourly completion and failure counts for the past N hours.

| Query param | Type | Default | Description |
|-------------|------|---------|-------------|
| `hours` | integer | `24` | Look-back window in hours |

**Response:**

```json
[
  { "hour": "2024-01-15T10:00:00Z", "completed": 8, "failed": 1 },
  { "hour": "2024-01-15T11:00:00Z", "completed": 12, "failed": 0 }
]
```

---

### `GET /analytics/performance`

Processing time statistics broken down by priority and worker.

**Response:**

```json
{
  "avgProcessingTimeByType": { "High": 3200, "Critical": 2800 },
  "workerStats": [...],
  "throughputPerHour": 14.5
}
```

---

## Message queue

**Exchange:** `task-events` (topic, durable)
**Queue:** `analytics-queue` (durable)

| Routing key | Trigger |
|-------------|---------|
| `task.created` | New task inserted in the .NET API |
| `task.updated` | Task fields edited |
| `task.deleted` | Task soft-deleted |
| `task.status-changed` | Task status transition |

Each message is acknowledged only after it is successfully written to the `task_events` table.

**Event payload shape:**

```ts
{
  eventType: string;        // e.g. "TaskCreated"
  timestamp: string;        // ISO 8601
  correlationId: string;
  payload: {
    taskId: string;
    // additional fields vary by event type
  };
}
```

---

## Scheduled jobs

Defined in `src/schedulers/metrics-aggregator.service.ts`:

| Schedule | Action |
|----------|--------|
| Every minute | Log a live task status snapshot to stdout |
| Every hour | Cancel `InProgress` tasks that have been stuck for > 30 minutes |

---

## Project structure

```
src/
├── config/
│   ├── database.ts              # pg Pool initialisation
│   ├── database.module.ts       # Provides DATABASE_POOL token
│   ├── rabbitmq.ts              # Channel setup, exchange/queue/binding declarations
│   └── rabbitmq.module.ts       # Provides RABBITMQ_CONNECTION token
├── consumers/
│   └── analytics-consumer.service.ts   # Subscribes to analytics-queue, writes to task_events
├── analytics/
│   ├── analytics.controller.ts  # HTTP route handlers
│   └── analytics.service.ts     # SQL queries for metrics/trends/performance
├── schedulers/
│   └── metrics-aggregator.service.ts   # Cron jobs
├── types/
│   └── analytics.interface.ts   # TaskMessage, TaskMetrics, TrendPoint, PerformanceMetrics
├── app.module.ts
└── main.ts
```

---

## Inter-service dependencies

| Dependency | Role |
|------------|------|
| RabbitMQ (`task-events` exchange) | Source of all task events |
| PostgreSQL (`taskflow` database) | Reads from `Tasks` table (written by .NET API), writes to `task_events` |
| task-ui | Calls this service's API to render the analytics dashboard |

This service does **not** publish any events to RabbitMQ — it is a pure consumer.
