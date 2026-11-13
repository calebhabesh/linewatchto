# Provider Feed Incident Runbook

Use this when a TTC or Metrolinx feed starts carrying data LineWatch cannot process: alerts
named "TTC ingestion processing failing", "TTC/GO/UP records quarantined" or "GO/UP ingestion
stale", a dashboard banner reading "Updates Unavailable", or empty notice lists while the
backend is up.

## How ingestion contains bad records

Each TTC and Metrolinx run applies the feed in one transaction, but every provider record is
normalized and written inside its own savepoint (`IngestionRecordIsolation`). A record that
fails is **quarantined**: its writes are undone, its last-good rows stay active, the failure is
logged with the record's kind and source ID, and the rest of the feed applies. The run still
succeeds, so the dashboard stays live.

A run still fails, and the dashboard drops to "Updates Unavailable", when:

- more than 10 items are quarantined, or as many as half of the provider records, which points
  at schema, normalizer or provider-format drift rather than one bad record; or
- a step that covers a whole section fails (reconciliation, deactivating missing rows).

Before Nov 13, 2026 a single bad record rolled back every poll: a 2,000-character TTC title
(Oct 19-20, 4.5 hours) and a TTC bus detour with no text (Nov 13, about 2 hours).

## Triage

1. Health, public and payload-free:
   - TTC: `curl -s https://api.linewatchto.ca/api/health/ingestion | jq '{status, dashboardLive, recordsQuarantined, quarantinedRecords}'`
   - GO/UP: `curl -s https://api.linewatchto.ca/api/health/regional-ingestion | jq '{status, fresh, recordsQuarantined, quarantinedRecords}'`
2. Causes, server-side only (they can quote the raw payload). Use the read-only query pattern
   in [production VPS](production-vps.md):

   ```sql
   select started_at, status, records_quarantined, quarantined_records, error_message
   from ingestion_runs where run_type in ('alerts', 'metrolinx-alerts')
   order by started_at desc limit 5;
   ```

3. Backend log: `scripts/prod-compose.sh logs --since 30m backend | grep -E "Quarantined|ingestion failed"`.

## Mitigate without a release

If a whole run is failing and a fix will take a release (CI takes about 35 minutes), turn off
the source that carries the bad data. Each switch is an environment variable in
`~/apps/linewatchto/.env.production`:

| Variable | Off means |
| --- | --- |
| `LINEWATCH_INGESTION_ALERTS_SURFACE_GTFS_RT_ENABLED` | No TTC bus/streetcar GTFS-RT alerts. Subway, TTC.ca notices and accessibility keep updating. |
| `LINEWATCH_INGESTION_ALERTS_SUBWAY_CLOSURE_SUPPLEMENT_ENABLED` | No TTC.ca subway service-advisory pages; the live alert feed still applies. |
| `LINEWATCH_INGESTION_METROLINX_EXTRACTION_ENABLED` | GO/UP notices use the deterministic classification only. |
| `LINEWATCH_INGESTION_METROLINX_ENABLED` | All GO/UP alert ingestion stops; GO/UP shows "Updates Unavailable". |
| `LINEWATCH_INGESTION_ALERTS_ENABLED` | All TTC alert ingestion stops; TTC shows "Updates Unavailable". |

```bash
cd ~/apps/linewatchto
cp .env.production .env.production.bak-$(date +%Y%m%d-%H%M)
sed -i 's/^LINEWATCH_INGESTION_ALERTS_SURFACE_GTFS_RT_ENABLED=true$/LINEWATCH_INGESTION_ALERTS_SURFACE_GTFS_RT_ENABLED=false/' .env.production
scripts/prod-compose.sh up -d --no-deps backend   # recreates the backend with the new environment
curl -s https://api.linewatchto.ca/api/dashboard | jq -r .availability   # expect "available" within a poll or two
```

Turning a source off is a visible product change: riders lose that data until it is back on.
**Turn it back on after the fix deploys** (same commands, `true`), and note it in the release
record.

## Fix

1. Reproduce: add the failing shape to `TtcProviderRecordContractIntegrationTest` (it runs
   real normalizers and stores against the real schema with null, blank and oversized values
   for every provider field) or to the parser/normalizer unit tests.
2. Make the normalizer guarantee the schema: fall back (as the surface notice title falls back
   to header, then description), drop a token that cannot be an ID, or widen a provider-text
   column with a migration. Never let provider data reach a constraint.
3. Ship through the normal release path; re-enable any switch you turned off.
