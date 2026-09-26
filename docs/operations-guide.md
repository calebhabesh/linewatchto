# Operations and scenario routing

Read the relevant runbook before changing deployment/configuration or running an
operational workflow. Routine frontend styling does not require these documents.

## Infrastructure

- Local data services: `docker compose up -d postgres redis`.
- Production: [VPS runbook](production-vps.md). ARM64 images are built on the development server and published to public GHCR; the VPS pulls releases selected through `.env.release` and does not build them. The custom PostGIS image uses official multi-architecture PostgreSQL 17 because the selected `postgis/postgis` tag is AMD64-only.
- Staging: [staging runbook](staging.md). Keep `.env.staging`, volumes, and locally built images isolated. Never point staging at `.env.production`, `.env.release`, production volumes/tags, or copy production secrets into staging.
- Metrics/logging: [observability](observability.md). Actuator is private on port 9090 and blocked at Caddy; configured collectors/tokens are required for data claims.
- Load incidents: [traffic-spike runbook](traffic-spike-runbook.md).
- Performance measurements: `node scripts/measure-portfolio-performance.mjs --help`; retain workload/environment/success/failure metadata.
- Script and tooling catalog: [script inventory](script-inventory.md).

## Alert scenarios

Edit source catalogs, then regenerate; generated fixtures are not the source of truth.

| Network | Catalog | Generator | Fixture directory |
| --- | --- | --- | --- |
| TTC | `scripts/alert-scenario-catalog.mjs` | `node scripts/generate-alert-scenarios.mjs` | `backend/src/test/resources/fixtures/ttc-alert-scenarios/` |
| Regional | `scripts/regional-alert-scenario-catalog.mjs` | `node scripts/generate-regional-alert-scenarios.mjs` | `backend/src/test/resources/fixtures/metrolinx-alert-scenarios/` |

Use `scripts/dev-alert-scenario-backend.sh <scenario-name>` and
`scripts/dev-alert-scenario-frontend.sh <scenario-name>` for TTC, or the corresponding
`dev-regional-alert-scenario-backend.sh` / `dev-regional-alert-scenario-frontend.sh`
scripts for GO/UP. The shared `all-alert-types` backend serves both source shapes;
TTC-focused scenarios disable regional ingestion to avoid leaking configured live
regional data into a synthetic scenario. Reviewed captures and synthetic gap-fill
records are never current public service information.
