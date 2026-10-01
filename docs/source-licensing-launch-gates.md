# Source Licensing and Naming Launch Gates

Last reviewed: 2026-09-30

LineWatchTO is an unofficial, independent project. Technical readiness does not by itself authorize public use of a source, name, map, or mark.

## Public Data Boundaries

- Public source-status panels may expose only allowlisted availability, freshness, timestamps, counts, and normalized processing summaries.
- Public APIs must not return retained TTC Live Alerts or Metrolinx source payloads. `GET /api/alerts?type=raw` and `GET /api/regional/alerts/raw` are retired.
- Retained source records are available through the disabled-by-default operator endpoints under `/api/admin/raw-alerts/*`. Those endpoints require a bearer token, paginate responses, send `Cache-Control: no-store`, and are blocked by every checked-in Caddy configuration.
- Development and staging may explicitly enable the paginated browser diagnostic endpoints under `/api/diagnostics/raw-alerts/*`. They send `Cache-Control: no-store`, carry a non-production warning in the UI, and must remain disabled and edge-blocked in production. The checked-in production and AWS-lab Caddy configurations return `404` for these paths; staging enables them explicitly.
- Public health contracts must not include persisted exception messages. Detailed failures belong in protected application logs.

## Attribution

The public acknowledgements panel must include the exact statement:

> Contains information licensed under the Open Government Licence – Toronto.

That statement applies only to identified City of Toronto open-data inputs, including the official TTC GTFS Realtime dataset. It must not be presented as licensing TTC Live Alerts, TTC website assets, or Metrolinx API records.

## Repository publication decision

On September 30, 2026, the owner chose to publish the Inkscape-authored TTC and regional schematic maps with explicit reference credits. Keep those drawings, their raster planes, and the README screenshots; preserve the [credits and third-party notices](../THIRD_PARTY_NOTICES.md), visible map attribution, and unofficial-project wording. This records the owner's publication decision, not a claim that a transit agency granted permission or endorsement.

Use synthetic alert/parser examples in the public repository. Exclude captured provider responses and credentials from both the published tree and its reachable history. Sanitize personal workstation paths and addresses while preserving the development commit history.

## Live integration terms

The owner is responsible for confirming the applicable source terms before enabling or changing live integrations, including:

- TTC Live Alerts use and normalized republication;
- TTC website monitoring and reviewed republication of station-page notices;
- Metrolinx API source use under the registered agreement.

Store agreements and approval correspondence outside the public repository. Record only the scope, date, expiry or revocation terms, and internal document location in a private operational checklist. Publishing source code and credited authored maps does not establish permission for every deployed integration. Transit names and marks remain with their respective owners and must not suggest affiliation or endorsement.

## Operator Raw Access

Operator raw access is off unless both variables are configured on a trusted backend instance:

```text
LINEWATCH_ADMIN_RAW_LOGS_ENABLED=true
LINEWATCH_ADMIN_RAW_LOGS_TOKEN=<long-random-secret>
```

The endpoint is intended for direct backend access from a trusted administrative path, not through the public LineWatchTO or API hosts. Example paths are `/api/admin/raw-alerts/ttc?limit=50&offset=0` and `/api/admin/raw-alerts/regional?limit=50&offset=0` with an `Authorization: Bearer ...` header.

Never add the operator token to frontend variables, browser code, checked-in environment files, URLs, or logs.

## Development and Staging Viewer

The shared desktop/mobile source-status panel discovers the non-production viewer through `/api/diagnostics/capabilities`. The retained-record tab is absent unless the backend reports `rawAlertsEnabled: true`.

`application-dev-live.yml` enables the viewer for local live and alert-scenario profiles. `docker-compose.staging.yml` enables it for the isolated staging stack. Production must keep `LINEWATCH_DIAGNOSTICS_RAW_ALERTS_ENABLED=false`; the production edge block is an independent safeguard and must not be removed when changing frontend visibility.
