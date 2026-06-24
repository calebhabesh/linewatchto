# Observability Architecture

This document covers the monitoring, logging, metrics, and visitor analytics architecture for **LineWatchTO**.

## Architecture Overview

Instead of running self-hosted Prometheus, Grafana, and Loki instances on our 2 OCPU / 12 GB Oracle VPS, the production server runs a lightweight **Grafana Alloy** collector. The collector scrapes application telemetry, host telemetry, database metrics, and container logs, forwarding them to a free-tier **Grafana Cloud** stack.

```
Visitors
  └──> Cloudflare Web Analytics (visitor analytics: page views, Core Web Vitals)

Oracle VPS Docker Host
  ├──> Next.js Frontend
  ├──> Spring Boot Backend
  │     └──> /actuator/prometheus on private port 9090
  ├──> PostgreSQL & Redis Containers
  └──> Grafana Alloy Container
        ├──> Scrapes Spring Boot backend:9090/actuator/prometheus
        ├──> Collects host telemetry (unix/node exporter)
        ├──> Collects cAdvisor container metrics (Docker metrics)
        ├──> Collects PostgreSQL & Redis stats
        ├──> Tails Docker logs via Loki docker source
        └──> Ships all telemetry to Grafana Cloud (Prometheus + Loki)
```

## Grafana Cloud Setup

Create a free Grafana Cloud account. The Free Tier includes:
- 10k active metric series.
- 50 GB Loki logs/month with 14-day retention.
- 3 active users.
- Built-in Synthetic Monitoring (uptime checks).

Generate a token on Grafana Cloud with **Metrics Write** and **Logs Write** scopes, then configure the credentials in `.env.production` or `.env.staging`:

```env
LINEWATCH_ENVIRONMENT=production
LINEWATCH_OBSERVABILITY_ENABLED=true
LINEWATCH_OBSERVABILITY_HOST=oracle-vps-1
LINEWATCH_OBSERVABILITY_COMPOSE_PROJECT=<compose-project-name>

GRAFANA_CLOUD_PROMETHEUS_REMOTE_WRITE_URL=https://prometheus-prod-xx.grafana.net/api/prom/push
GRAFANA_CLOUD_PROMETHEUS_USERNAME=<metrics-instance-id>
GRAFANA_CLOUD_LOKI_URL=https://logs-prod-xx.grafana.net/loki/api/v1/push
GRAFANA_CLOUD_LOKI_USERNAME=<logs-instance-id>
GRAFANA_CLOUD_API_TOKEN=<grafana-token>
```

Staging environments keep observability opt-in via `.env.staging`.

## Spring Boot Metrics

Backend Prometheus metrics are collected via **Spring Boot Actuator** and **Micrometer**.

### Endpoint Security & Separation

To prevent exposing internal Actuator endpoints publicly, the actuator listener runs on a private management port:

- `MANAGEMENT_SERVER_PORT` is set to `9090` (configured in docker-compose files).
- Caddy rules explicitly reject `/actuator*` requests with a `404` status code.
- Only the `alloy` container on the private Docker bridge network can access `http://backend:9090/actuator/prometheus`.

### Custom LineWatch Metrics

We expose custom gauges in [LinewatchHealthMetrics.java](file://~/dev/ttc-reliability-navigator/backend/src/main/java/com/calebhabesh/linewatch/observability/LinewatchHealthMetrics.java):

#### Ingestion Status Gauges
- `linewatch_ingestion_dashboard_live`: `1.0` if the last alert ingestion run was successful and fresh, `0.0` otherwise.
- `linewatch_ingestion_run_age_seconds`: Age of the latest alert ingestion run in seconds.
- `linewatch_ingestion_records_fetched`: Total records fetched in the latest run.
- `linewatch_ingestion_records_staged`: Total records staged.
- `linewatch_ingestion_records_normalized`: Total records normalized.
- `linewatch_ingestion_records_unmatched`: Total records unmatched.
- `linewatch_ingestion_latest_status{status="success|failed|running|not-run"}`: A set of gauges indicating the latest run state.

#### GTFS Schedule Status Gauges
- `linewatch_schedule_active`: `1.0` if a GTFS schedule import is active and not expired, `0.0` otherwise.
- `linewatch_schedule_service_days_remaining`: Number of days remaining in the active GTFS schedule.
- `linewatch_schedule_refresh_age_seconds`: Age of the latest GTFS schedule refresh run in seconds.
- `linewatch_schedule_refresh_records_processed`: Total records processed during the latest schedule refresh.
- `linewatch_schedule_refresh_status{status="success|failed|running|never-run"}`: A set of gauges indicating the latest schedule refresh state.

## Grafana Alloy Configuration

Alloy configuration is defined in [config.alloy](file://~/dev/ttc-reliability-navigator/infra/observability/alloy/config.alloy).

- **App Scrape (30s)**: pulls metrics from `backend:9090/actuator/prometheus`.
- **Host Scrape (60s)**: collects CPU, memory, network, and disk metrics via the built-in unix/node exporter.
- **Container Scrape (60s)**: collects Docker container metrics via the built-in cAdvisor exporter.
- **PostgreSQL Exporter (60s)**: connects to postgres to extract connection counts, transaction rates, and lock details.
- **Redis Exporter (60s)**: collects memory usage, command rate, and eviction stats.
- **Loki Docker Source**: tails Docker logs via the Docker API socket `/var/run/docker.sock`, relabeling container attributes to low-cardinality tags.

Logs are filtered to the current Compose project using `LINEWATCH_OBSERVABILITY_COMPOSE_PROJECT` so that log shipping is isolated and low-cardinality.

## Dashboards

Create a folder named **LineWatchTO** in Grafana Cloud with the following dashboards:

1. **LineWatch Overview**:
   - Site Uptime (from Synthetic Monitoring).
   - Ingestion freshness & GTFS active state.
   - HTTP request throughput, latency (p95), and error (5xx) rates.
2. **JVM / Backend**:
   - Heap and non-heap memory utilization.
   - GC pause durations and thread count.
   - HikariCP pool connection stats.
3. **VPS / Docker**:
   - Host CPU, RAM, and Disk space.
   - Container-specific resource consumption.
4. **Postgres / Redis**:
   - Active database connections, locks, size.
   - Redis memory footprint and client connections.
5. **Logs Explorer**:
   - Dedicated dashboard panels searching logQL streams e.g., `{project="linewatch", service_name="backend"}`.

## Alerts

Configure Grafana Alerting rules on Grafana Cloud:

### Critical Alerts
1. **Public Site Down**: Uptime synthetic check fails for `https://linewatchto.ca/` for 2 consecutive runs.
2. **API Health Down**: Uptime synthetic check fails for `https://api.linewatchto.ca/api/health`.
3. **Backend Scrape Missing**: `up{job="linewatch-backend"} == 0` for 2 minutes.
4. **Dashboard Ingestion Stale**: `linewatch_ingestion_dashboard_live == 0` for 5 minutes.
5. **GTFS Refresh Failed**: `linewatch_schedule_refresh_status{status="failed"} == 1` for 5 minutes.

### Warning Alerts
1. **JVM Heap High**: Heap memory usage `> 80%` for 10 minutes.
2. **Disk Low**: Free disk space `< 20%` for 10 minutes.
3. **HTTP 5xx Elevated**: HTTP 5xx rate `> 5%` of total requests over 5 minutes.
4. **Schedule Expiring Soon**: `linewatch_schedule_service_days_remaining < 7` for 30 minutes.

## Visitor Analytics (Cloudflare)

Rider/visitor behavior analytics are tracked via **Cloudflare Web Analytics** on all proxied traffic. This avoids placing script tags or cookies directly in the markup for general visitors unless automatic beacon injection fails.

If automatic setup is disabled, the script beacon can be explicitly loaded:
- Add `NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN` to your production frontend environment.
- Next.js will automatically load the Cloudflare Web Analytics beacon in the background.

## Commands and Validation

### Verify metrics endpoint internally on backend container:
```bash
scripts/prod-compose.sh exec backend \
  curl -fsS http://127.0.0.1:9090/actuator/prometheus | grep linewatch
```

### Validate public access is blocked (Expected: 404):
```bash
curl -i https://api.linewatchto.ca/actuator/prometheus
```

### Start Alloy:
Production:
```bash
scripts/prod-observability-up.sh
```

Staging:
```bash
scripts/staging-observability-up.sh
```
