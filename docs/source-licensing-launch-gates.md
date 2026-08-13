# Source Licensing and Naming Launch Gates

Last reviewed: 2026-08-13

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

## Written Approval Required Before Public Launch

Public launch remains blocked until the project owner records appropriate written confirmation for:

- TTC Live Alerts use and normalized republication;
- the adapted TTC map asset;
- Metrolinx API source use under the registered agreement; and
- rider-facing use of GO, GO Transit, and UP Express names or marks.

Store approvals outside the public repository and record only the approver, scope, date, expiry or revocation terms, and internal document location in the private launch checklist. If approval is not obtained, disable the affected integration and replace permission-sensitive names/assets before launch.

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
