# Backend

Java 21 / Spring Boot owns ingestion, normalization, persistence, freshness,
API contracts, account authorization, commute matching, and push delivery.
Preserve fixture/demo boundaries for isolated tests and demos.

## Implementation constraints

- Read the affected section of [domain invariants](../docs/domain-invariants.md) before changing transit data behavior. Keep provider credentials/raw payloads private and health responses safe.
- Preserve source-ID upserts, source namespaces, run tracking, independently gated provider freshness, and last-good data on failed refreshes. Retention is not permission to present stale rows as current.
- GTFS imports must remain bounded-memory: streaming passes, transactional batches of 1,000, and a 1 GB heap budget. Failed imports must not deactivate the active schedule.
- Preserve Flyway migration history; add migrations for schema changes. Verify persistence and API compatibility, account ownership checks, input caps, and rate limits when affected.
- Redis misses/outages fall back to computation; successful ingestion evicts affected dashboard keys. Keep cache keys network-scoped.
- Actuator stays on private management port 9090 with edge blocking.

## Checks and development

- Targeted test: `mvn -f backend/pom.xml -Dtest=ClassName test`.
- Finished backend change: `mvn -f backend/pom.xml test` once, with integration coverage for affected persistence, ingestion, security, and contracts.
- Local backend: `mvn -f backend/pom.xml spring-boot:run`. TTC alert polling is off by default; `scripts/dev-live-backend.sh` enables the dev-live profile.
- For isolated alert reproduction or generated scenario changes, read [scenario workflow](../docs/operations-guide.md#alert-scenarios); edit catalogs, then regenerate fixtures.
