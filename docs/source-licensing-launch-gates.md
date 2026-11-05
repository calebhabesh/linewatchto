# Source Licensing and Naming Launch Gates

Last reviewed: 2026-11-05

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

## TTC vehicle positions (plan 13, S4)

Recorded 2026-11-02. Live streetcar positions read the TTC GTFS-RT VehiclePosition feed at `https://bustime.ttc.ca/gtfsrt/vehicles` (text form `?debug`). Open Data Toronto lists it under *TTC BusTime Real-Time Next Vehicle Arrival (NVAS)* (Open Government Licence – Toronto), which describes vehicle locations and is to be used with TTC static GTFS; the OGL–Toronto acknowledgement above covers it. `gtfsrt.ttc.ca/vehicles/position` serves the same data, but its dataset page (*TTC GTFS-Realtime Service Disruptions*) describes only alerts, so it is not the default. The feed is off unless `LINEWATCH_TTC_STREETCAR_POSITIONS_ENABLED=true`. Only normalized streetcar positions are served (route, headsign, coordinates, bearing, report age, vehicle number); the raw payload is not stored or returned. Vehicle numbers are published in the open feed; enabling the source in production remains the owner's decision.

Widened 2026-11-03 (plan 13, S8): live TTC bus positions use the same feed read (one poll serves streetcars and buses; nothing new is polled) under their own flag, `LINEWATCH_TTC_BUS_POSITIONS_ENABLED`, off by default. Only normalized bus positions on trips of the active schedule are served (the same fields, plus whether the trip is a streetcar route's replacement bus), and only for the area the Map View asks for. The licence and attribution are unchanged. Enabling bus positions in production remains the owner's decision. GO bus vehicle positions are a Metrolinx source with their own entry below (S9); TTC sources never authorize them.

## TTC station plans (plan 13, S7)

Owner decision, 2026-11-03: station floor plans may be drawn from the TTC's public ArcGIS Online feature service `StationFootprints_View` (`services2.arcgis.com/4bxnkNIQISOHuO8V`, owned by the TTC GIS account; the data behind livemap.ttc.ca), credited to the TTC in Privacy & Acknowledgements and on the map. The service publishes no licence, access or copyright text and is not an Open Data Toronto dataset, so OGL–Toronto does not cover it; attribution is a courtesy, not a licence. Using it rests on the owner's decision, not on written permission. A request to the TTC for written permission (OGL–Toronto reuse with attribution) is still advisable; if the TTC objects, the layer and its asset are removed. Only geometry and public station-feature attributes are used; nothing is fetched from the service at runtime. Built 2026-11-03: `scripts/generate-station-plans.mjs` reads layers 1 (StationPaths) and 3 (StationExits) once and writes `frontend/public/assets/linewatch/geographic/ttc-station-plans.json` (footprints with floor numbers, entrances with bearing, name and letter, elevator, stair and escalator positions with the source's up/down; the service's styling, icon artwork and other feature types are not copied). Bus bays on the plans, and the bay index `ttc-station-bays.json` behind the station panel's bay signs, come from TTC static GTFS station stops under OGL–Toronto, not from this service. Raw service responses are not kept in the repository. To remove the layer, delete that asset, the generator and `geographic-station-plan-layers.ts`, and the credits.

## GO bus routes and stop departures (plan 13, S6)

Recorded 2026-11-03. GO bus corridors and stops on the GO/UP Map View come from the GO Transit static GTFS archive (Metrolinx Open Data, the archive the regional rail catalog already uses). GO bus stop departures widen the existing Metrolinx API use: the backend calls GO Next Service (`Stop/NextService/{stopCode}`, the call already made for GO Bus rows at GO/UP stations) for any GO stop number in `backend/src/main/resources/regional/go-bus-stops.csv`, on demand when a rider opens that stop, instead of only the stop codes listed at stations. It is off unless `LINEWATCH_REGIONAL_SURFACE_ARRIVALS_ENABLED=true`, caches each stop for 30 s, and makes at most `LINEWATCH_REGIONAL_SURFACE_ARRIVALS_STOP_FETCHES_PER_MINUTE` (60) upstream reads across all stops. Only normalized departures are returned (route, route name, destination, times, bay when published, trip number, live or scheduled); the raw payload is not stored or returned and the key stays backend-only. The owner confirmed on 2026-11-05 that the registered Metrolinx API agreement covers per-stop reads at this scope: any GO stop a rider opens on the GO/UP Map View, as any TTC stop can be opened on the TTC Map View.

## Runtime schedule assets (plan 16)

Recorded 2026-11-05. The `schedule-assets` service reads the same two public static GTFS archives the generators already used, at runtime instead of at build time: the TTC *Merged GTFS - TTC Routes and Schedules* zip listed by Open Data Toronto's CKAN package (Open Government Licence – Toronto; the OGL–Toronto acknowledgement above covers it), checked hourly as the backend's schedule import does, and the GO Transit GTFS zip from Metrolinx Open Data, checked every 6 hours with conditional requests. Archives stay in the service's private volume state and are never served. Only the normalized generated files (route corridors, stops with pole numbers and names, route stop lists, search indexes, each carrying its source name, licence, feed version and period) are public, at `/data/schedule/files/` with `/data/schedule/manifest.json`, as they were before under `/assets/linewatch/geographic/`. The backend's GO stop list for stop departures is read from the same output; the Metrolinx API use it gates is unchanged (S6 above). No new source, credential or API call is added.

## GO bus positions (plan 13, S9)

Recorded 2026-11-03. The owner confirmed on 2026-11-03 that the registered Metrolinx API agreement covers this use. Live GO bus positions on the GO/UP Map View come from the Metrolinx GO GTFS-RT VehiclePosition feed (`api/V1/Gtfs/Feed/VehiclePosition`), the read the backend already makes for GO estimated train markers; the bus entities in it are dropped today. One read serves both trains and buses; nothing new is polled upstream. Service at a Glance (`api/V1/ServiceataGlance/Buses/All`) is not used. It is off unless its own flag is on (`LINEWATCH_REGIONAL_GO_BUS_POSITIONS_ENABLED`, off by default) and independent of the regional train-marker flag's claims: GO buses never affect GO/UP rail status or train markers, and no TTC source authorizes them. Only normalized positions are served (route, trip, coordinates, bearing, report age, vehicle number, next stop number), only for the area the Map View asks for, `no-store`; the raw payload is not stored or returned, and the key stays backend-only. Vehicle numbers are in the feed. Enabling it in production remains the owner's decision, with the other live integration terms below.

Production, 2026-11-05: the owner enabled TTC streetcar positions, TTC bus positions and GO bus positions (`LINEWATCH_TTC_STREETCAR_POSITIONS_ENABLED`, `LINEWATCH_TTC_BUS_POSITIONS_ENABLED`, `LINEWATCH_REGIONAL_GO_BUS_POSITIONS_ENABLED`) for the next release. The backend still answers `no-store`. At the public edge, Caddy gives the three position endpoints the train-marker policy (`s-maxage=4`), so Cloudflare may share a response for a few seconds. Each response keeps its vehicles' report times and the source's freshness. Stop departures stay uncached.

## Repository publication decision

On September 30, 2026, the owner chose to publish the Inkscape-authored TTC and regional schematic maps with explicit reference credits. Keep those drawings, their raster planes, and the README screenshots; preserve the [credits and third-party notices](../THIRD_PARTY_NOTICES.md), visible map attribution, and unofficial-project wording. This records the owner's publication decision, not a claim that a transit agency granted permission or endorsement.

Use synthetic alert/parser examples in the public repository. Exclude captured provider responses and credentials from both the published tree and its reachable history. Sanitize personal workstation paths and addresses while preserving the development commit history.

## Live integration terms

The owner is responsible for confirming the applicable source terms before enabling or changing live integrations, including:

- TTC Live Alerts use and normalized republication;
- TTC website monitoring and reviewed republication of station-page notices;
- Metrolinx API source use under the registered agreement.

Store agreements and approval correspondence outside the public repository. Record only the scope, date, expiry or revocation terms, and internal document location in a private operational checklist. Publishing source code and credited authored maps does not establish permission for every deployed integration. Transit names and marks remain with their respective owners and must not suggest affiliation or endorsement.

## Model-assisted notice reading

Optional Metrolinx notice extraction (`LINEWATCH_INGESTION_METROLINX_EXTRACTION_*`, off by default) sends each new GO/UP rail notice's title, body, tagged stops, and line station list to the configured Gemini API model. Before enabling it, the owner confirms that:

- the Metrolinx API agreement permits passing notice text to a third-party processor;
- the provider tier's data terms are acceptable. On Google's free tier, prompts and responses may be used to improve Google's products; the paid tier excludes that.

Only public notice text leaves the backend: never account data, credentials, or the Metrolinx developer key. The Gemini key is backend-only, travels in a request header, and must not appear in frontend variables, checked-in environment files, URLs, or logs. Stored readings hold catalog station IDs and enumerated values, never provider responses; rider-facing text stays the Metrolinx wording.

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
