# R — Schedule-derived map and search data at runtime

Owner request, 2026-11-05: new TTC and GO schedules must reach riders the way
departures already do, with no pull request, rebuild or deploy. Deploys are for
code. The Map View routes and stops, the search indexes and the backend's GO
stop list must come from the same feed, so the map, search and stop
departures never disagree.

Read first: [source launch gates](../source-licensing-launch-gates.md) (TTC
vehicle positions, GO bus routes and stop departures, GO bus positions), the
surface line of [domain invariants](../domain-invariants.md),
[plan 13](13-surface-network.md) (S5, S6, S10) and [plan 14](14-unified-search.md)
(U1, U5), and the [operations guide](../operations-guide.md) and
[production VPS](../production-vps.md) before changing deployment.

## Decisions (2026-11-05, owner approved; details refined here)

- **A small Node service, `schedule-assets`, in its own ARM64 image**, built
  and published with the others and pinned by digest like them. It runs the
  existing generators unchanged (`generate-surface-catalog.mjs`,
  `generate-go-bus-catalog.mjs`, `generate-search-index.mjs`) as child
  processes into a work directory. Not a Java port. It has no npm
  dependencies.
- **Change detection ignores a re-zip.** TTC: the CKAN `package_show`
  resource (URL plus `last_modified`) is read hourly, the backend's cadence;
  the zip is downloaded only when that changes. GO: a conditional GET
  (`If-None-Match`, `If-Modified-Since`) every 6 hours, more often than the
  backend's daily import. A downloaded archive regenerates only when the hash
  of its extracted tables differs from the last published one, so Open Data
  Toronto re-zipping an unchanged feed is a no-op.
- **A change in generator code or baked inputs also regenerates**, from the
  last downloaded archive (kept in the volume), so a release that changes a
  generator or `ttc-catalog.json` / `ttc-station-bays.json` (read by the TTC
  search index) takes effect on start without waiting for a new feed.
- **Publishing:** content-hashed files (`files/<name>.<sha256:16>.json`, with
  `.gz` and `.br` siblings) and one small `manifest.json` mapping logical names
  to hashed paths, with each network's feed version and period. Files first,
  manifest last, each written to a temporary name and renamed. Files of the last
  three manifests are kept, and none younger than two days is removed, so open
  sessions never 404.
- **Never publish output that fails validation.** `scripts/lib/schedule-asset-validation.mjs`
  holds the invariants the frontend tests already check on the committed
  assets (catalog shape and layer, drawn flags match drawn features, every
  drawn route has a stop list, GO stop numbers, the search index has every
  route and stop with matching name, routes and position, one feed per
  network), plus a shrink guard against the current generation (routes or
  stops falling below half). A failure keeps the last good set. The frontend
  tests run the same module over the committed files, so the two cannot drift.
- **TTC and GO are independent.** Each network regenerates, validates and
  publishes on its own; a new manifest takes the changed network's files and
  keeps the other's. A GO failure never blocks TTC, and the reverse.
- **Served by Caddy from a shared volume at `/data/schedule/`**, not
  `/assets/`: only `manifest.json` and `files/*`. Hashed files are
  `public, max-age=31536000, immutable`; the manifest `public, max-age=60`;
  anything missing is a `no-store` 404 (a missing hashed file must never be
  cached as immutable). One Cloudflare cache rule makes `/data/schedule/`
  eligible and respects the origin's TTLs, with 4xx at 60 s and 5xx no-store.
- **The client reads the manifest, then the hashed URLs.** One manifest read
  per page (started when the shell mounts, so the Map View does not wait an
  extra round trip), a 5 s timeout, and one re-read if a hashed file 404s. When
  the manifest is missing or invalid (local `next dev`, Playwright's prod
  server, a first deploy before the service runs) the client uses the
  release's own files through `releaseAssetUrl`, for the whole page, so a page
  never mixes generations. Out of scope and still per release:
  `ttc-catalog.json`, `regional-catalog.json`, `ttc-station-plans.json` and
  `ttc-station-bays.json`.
- **Service worker:** hashed files cache-first by full URL, one copy per
  logical name; the manifest network-first with a 4 s timeout and an offline
  fallback to the last cached copy, so offline map and search keep working. No
  API response is cached.
- **The backend's GO stop list comes from the same output.** The volume is
  mounted read-only into the backend; `GoBusStopCatalog` checks the manifest
  every minute and swaps in the published CSV when it changes (after a
  non-empty, shrink-guarded parse), keeping the classpath CSV until the first
  publish and whenever the volume is unreadable.
- **TTC stop departures keep their own source.** The backend's TTC stop
  catalog (V91) is filled by its own hourly import of the same CKAN resource,
  so it already follows new feeds without a release. The two can differ for at
  most one check interval after a new publication; the health endpoint shows
  both periods so a lasting disagreement is visible.
- **Station bays stay per release.** `ttc-station-bays.json` is written by the
  station plan generator, which joins GTFS bays to the ArcGIS station plans the
  map draws, and bays change rarely. Moving bays would mean moving the plans.
  The TTC search index reads the image's copy; a release with new bays
  regenerates the index on start (fingerprint above).
- **Bootstrap:** the image carries the release's committed files. On an empty
  volume (first deploy, staging, CI) the service first publishes them as the
  initial generation, marked `origin: "release"`, then checks the feeds.
  Local development is unchanged: no service, the client falls back.
- **Observability:** the service writes `status.json` beside the manifest
  (per network: state, last check, last success, last publish, last failure
  stage, consecutive failures, published feed) and logs one JSON line per
  event to stdout, which Alloy already ships. The backend serves an allowlisted
  view at `GET /api/health/schedule-assets` (no error messages). Status is
  `failing` after a failed check and `stale` when no check has succeeded for
  three intervals. The manifest carries only the feeds it was built from; it
  never claims a check it did not make.
- **The deploy gate changes once.** A fourth pinned image means the
  root-owned `/usr/local/sbin/linewatch-deploy-gate` must accept four images
  (and still three, for rollbacks to older releases). It has to be reinstalled
  on the VPS before the first four-image deploy, with the owner's go-ahead.

## Findings

- The surface generator writes its siblings next to `--output` and then runs
  the TTC search index over that directory, which reads the station catalog
  and bays too, so the work directory is seeded with the current generation
  and the image's baked inputs. Night mode reads the streetcar and bus stop
  files written by the earlier modes, so the order stays streetcar, bus, night.
- `archiveSha256` is part of every catalog, so a regeneration from a re-zipped
  archive would change every hash; the table-hash check prevents that.
- `cachedLoader` (`geographic-bus-catalog.ts`) serves the bus, GO bus, night,
  route-stop, bay and search loads; the streetcar catalog has its own fetch.
  Both move to the manifest resolver. Station plans are handed to MapLibre as
  a URL and stay per release.
- Production volumes are external (`scripts/prod-init-volumes.sh`), so the new
  `linewatchto_schedule_assets_data` volume is created there first.

## Phases

| Phase | Owns | Detail |
| --- | --- | --- |
| R1 | Service: detection, generation, validation, publishing, status | Done (2026-11-05) |
| R2 | Client manifest resolver and service worker | Done (2026-11-05) |
| R3 | Backend GO stop reload and health endpoint | Done (2026-11-05) |
| R4 | Image, Compose, Caddy, release pipeline and deploy gate | Done (2026-11-05) |
| R5 | Staging end to end | Done (2026-11-05) |
| R6 | Production: Cloudflare rule, gate, deploy and checks (owner go-ahead) | |
| R7 | Remove the interim PR workflow; docs | |

### R1 — Service

`services/schedule-assets/`: `server.mjs` (loop, HTTP `/healthz`), `lib/`
(feeds, tables hash, generation, publish, retention, status). Tests in
`scripts/tests/schedule-assets-*.test.mjs` (`test:scripts`): hashed names,
manifest atomicity, keep-last-good on a validation failure, re-zip no-op,
network independence, retention, bootstrap from baked files.

**Done (2026-11-05).**

- `services/schedule-assets/`: `server.mjs` (schedule loop, `/healthz` and
  `/status` on 8095), `lib/feeds.mjs` (CKAN release key, conditional download
  with a 512 MB cap, `unzip -tq`, table hash), `lib/generate.mjs` (the three
  TTC modes and GO into a work directory; generator fingerprint),
  `lib/publish.mjs` (hashed files with `.gz`/`.br`, manifest, retention),
  `lib/service.mjs` (bootstrap, per-network check, status). Validation in
  `scripts/lib/schedule-asset-validation.mjs`.
- Measured on the owner's machine with the feeds of 2026-11-04/05: the TTC run
  takes 41 s (bus mode peaks at 1.4 GB RSS; streetcar 0.34, night 0.38), GO
  2.5 s (0.44 GB). The container needs about 2 GB; the generators get a 2 GB
  heap (`SCHEDULE_ASSETS_GENERATOR_HEAP_MB`).
- From an empty volume: bootstrap published the committed files, then both
  networks regenerated. The new TTC files differed from the committed ones only
  in `archiveSha256` (the re-zip), so every hashed name, and the generation,
  stayed the same; only each network's `origin` changed to `runtime`. A
  restart checked both feeds without downloading (`unchanged`).
- A rejected feed is remembered by table hash and fingerprint, so it is not
  regenerated every hour; the network stays `failing` until a new feed or
  generator passes. The archive that failed is kept as the cached archive, so a
  fixed generator can retry it on start.
- Tests: `scripts/tests/schedule-assets-service.test.mjs` (14) and
  `frontend/tests/schedule-asset-validation.test.mjs` (3, in `test:fast`).

### R2 — Client

`src/app/schedule-assets.ts` resolves logical names; `cachedLoader` and the
streetcar loader use it. `sw.js` adds the manifest and hashed-file routes.
Tests: resolver fallback and retry in `test:fast`, the service worker cases in
`offline-service-worker.test.mjs`, and a smoke case that the map and search
load through a routed manifest. `test:surface` stays green.

**Done (2026-11-05).**

- `src/app/schedule-assets.ts`: `loadScheduleManifest` (one read per page, 5 s
  timeout; a 404, HTML, invalid or unreachable manifest is null),
  `scheduleAssetUrl` (a name the manifest lists resolves to
  `/data/schedule/files/...`, anything else to `releaseAssetUrl`) and
  `fetchScheduleAsset` (a hashed file's 404 rereads the manifest once; a
  failed reread keeps the page's choice). `cachedLoader` and the streetcar
  loader use it, so every schedule-derived load goes through the manifest and
  station bays keep the release's copy. `LineWatchShell` starts the manifest
  read on mount. Manifest paths must match `files/<safe name>`.
- `sw.js`: the manifest is network-first (4 s), kept on a JSON 200 and served
  from cache offline or on a 5xx; a 404 passes through (no manifest at this
  deployment), and HTML is never kept. Hashed files (`<name>.<16 hex>.json`, no
  query) are cache-first by URL, one copy per name. Both sit in the static
  cache, which outlives a release.
- Tests: `schedule-assets.test.mjs` (10), five service worker cases in
  `offline-service-worker.test.mjs`, `release-asset-url.test.mjs` updated (the
  manifest read comes first), and the bus and streetcar loader tests no longer
  count the manifest read as a catalog request. `test:fast` 2,361, typecheck
  and lint (no errors) pass.
- `tests/smoke/schedule-manifest.spec.ts` (in `test:surface`): with a routed
  manifest, the streetcar catalog and both search indexes load from hashed
  URLs, a stop search answers, no schedule file comes from the release and the
  manifest is read once; without one, the release's copies load. `test:surface`
  on the Playwright production build: 95 passed, 42 skipped, 1 failed
  (`surface-notice-view` "Back returns to the list", mobile-chromium, the map
  not ready in 20 s); that spec and the new one then passed 81 of 81 over three
  repeats on both projects.
- Phone cost: one manifest request (about 0.6 KB compressed) started on mount,
  before the Map View asks for its first layer; the hashed files are the same
  bytes as before, now precompressed at the origin. Not yet traced on the
  production build under Slow 4G; R5 does that against staging.

### R3 — Backend

`GoBusStopCatalog` reloads from the manifest; `ScheduleAssetsHealthController`
reads the manifest and `status.json`. Tests for reload, fallback, shrink guard
and the health contract; `mvn -f backend/pom.xml test` in a scratch copy.

**Done (2026-11-05).**

- `scheduleassets/ScheduleAssetsVolume` reads `manifest.json` and `status.json`
  from `linewatch.schedule-assets.dir` (`LINEWATCH_SCHEDULE_ASSETS_DIR`, empty
  by default: disabled) and resolves only `files/<safe name>` inside the volume.
- `GoBusStopCatalog` keeps an immutable snapshot with its source (`bundled` or
  `published`, path, feed version, size). `refresh()` runs at start and every
  `linewatch.schedule-assets.reload-interval` (1 min) and swaps in the
  manifest's `go-bus-stops.csv` when its path changes; an unreadable, empty or
  under-half list keeps the current one, with a warning.
- `GET /api/health/schedule-assets` (`ScheduleAssetsHealthController`):
  `disabled`, `unavailable` (no manifest), `pending`, `ok`, `failing` or
  `stale` (no successful check for three intervals); per network the published
  origin, feed version and period, last check, success, publish and failure
  time, failure stage and count; and the GO stop list's origin, size and feed.
  Failure messages are not returned. `/api/health*` is already `no-store`.
- Tests: `GoBusStopCatalogReloadTest` (5) and
  `ScheduleAssetsHealthControllerTest` (5).
- TTC: unchanged. The TTC stop departures catalog (V91) comes from the
  backend's own hourly import of the same CKAN resource.

### R4 — Deployment

Compose service and volume in production and staging; Caddy route and headers
in all three Caddyfiles with tests; the release scripts, digest manifest,
remote release, deploy gate and workflows learn the fourth image; their Bash
suites stay green.

**Done (2026-11-05).**

- `services/schedule-assets/Dockerfile` (context: repository root): Node 24
  Alpine with `unzip`, the three generators and `scripts/lib`, the service, and
  the release's files in `/app/baked`; runs as `node` with `/srv/schedule`
  owned by it (Docker copies that ownership into an empty named volume, also
  when another container mounted it read-only first; checked). 177 MB. In a
  container with a 3 GB limit and an empty volume it bootstrapped, then
  regenerated TTC in 63 s and GO in 4 s, to the same generation as on the host.
- Compose: `schedule-assets` in production (pinned image, `mem_limit: 3g`,
  external volume `linewatchto_schedule_assets_data`, created by
  `scripts/prod-init-volumes.sh`) and staging (built locally; feed and interval
  overrides `LINEWATCH_STAGING_SCHEDULE_*`). The backend mounts the volume
  read-only at `/srv/schedule` with `LINEWATCH_SCHEDULE_ASSETS_DIR`; Caddy at
  `/srv/linewatch/data/schedule`. Nothing depends on the service's health, so a
  failing service never holds back the site; `up --wait` still fails the deploy.
  The AWS lab gets the Caddy route but no service: its manifest is a 404 and
  clients use the release's files.
- Caddy (`linewatch_schedule_assets`, all three Caddyfiles, imported by the app
  site only): the manifest `public, max-age=60`; hashed JSON
  `public, max-age=31536000, immutable`, served from the `.br`/`.gz` copies;
  anything else under `/data/schedule/` (status, state, the CSV, a missing hash)
  a `no-store` 404. Checked against the container's volume: the 1.6 MB TTC stop
  file is sent as 116 KB of brotli. `caddy validate` passes for all three.
- Release pipeline: `schedule-assets` is a fourth component. It is optional
  wherever an older release can appear (its digest file has three images), and
  required by `prod-verify-release-manifest.sh` for any commit that contains
  the service, so a new release cannot fall back to a mutable tag. The deploy
  gate accepts two, five or six arguments; the sixth must be a pinned
  `linewatch-schedule-assets` image. CI checks the published image bootstraps
  and reports healthy without reading any feed (`SCHEDULE_ASSETS_NETWORKS=none`).
- Tests: `prod-release-tools.test.sh` 30 (new: verification with and without
  the image, plus image cases in the render, pin, build, publish and remote
  release tests), `prod-ssh-deploy-gate.test.sh` 10 (3 new),
  `caddy-cache-headers.test.mjs` 7 (2 new), staging and AWS lab suites pass.

### R5 — Staging

`scripts/staging-up.sh` from an empty volume: bootstrap, first check, a
simulated new feed (a local feed override), a new manifest, and a client that
picks it up without a deploy.

**Done (2026-11-05)**, on the owner's machine, staging rebuilt from this branch
with `scripts/staging-up.sh`.

- Empty volume: the service bootstrapped the release's files, the backend took
  the published GO stop list at start (813 stops), and Caddy served the manifest
  (`max-age=60`) and 404'd `status.json` (`no-store`). The first real checks
  downloaded both feeds and regenerated TTC in 52 s and GO in 3 s; the data
  matched the release, so every URL stayed the same.
- Browser (Chromium, service worker in control): search read both hashed
  indexes and showed GO stop 00008 as "Yonge St. @ Sheppard Ave.".
- Simulated new GO feed (the real archive with `feed_version` 20261105990000 and
  stop 00008 renamed "… (Staging Test)"), given to the running service as a
  `file:` override and a service restart, nothing rebuilt: GO published a new
  generation 3 s later and TTC stayed `unchanged`. The backend's GO stop list
  followed within the minute, and `/api/regional/bus-stops/00008/departures`
  named the stop "… (Staging Test)". The same browser profile, reopened after the
  manifest's 60 s, loaded the new GO index (the TTC index URL unchanged) and
  search showed the new name. Health: `ok`, both networks `runtime`. Staging was
  then returned to the real GO feed.
- Phone cost on staging's production build (Pixel 7, Slow 4G, 4x CPU, cold,
  service worker blocked, three runs each): the manifest read ends about 10.4 s
  in, some 11 s before the Map View asks for its first layer, so nothing waits
  on it; Map View ready 21.3–21.6 s with the manifest and 21.3–21.9 s with it
  answered 404. The streetcar file moved 13.6 KB (precompressed brotli) instead
  of 21.2 KB (gzip on the fly). The added cost is one request of under 1 KB.

### R6 — Production

With the owner's go-ahead: create the volume, reinstall the gate, add the
Cloudflare rule (snapshot, `--validate-only`), deploy from green main CI, then
check headers and HIT through Cloudflare, feed versions against
`/api/health/schedule` and `/api/health/regional-schedule`, search and Map
View, and GO stop departures for the published stop list.

Prepared (2026-11-05): the cache ruleset was snapshotted and the rule below
passes `cf rulesets rules create ... --validate-only` (placed after "Authored
Public Assets"); the live ruleset is unchanged. To apply, drop `--validate-only`
and record it in the traffic-spike runbook.

```json
{
  "description": "Schedule Assets",
  "expression": "(starts_with(http.request.uri.path, \"/data/schedule/\"))",
  "action": "set_cache_settings",
  "action_parameters": {
    "cache": true,
    "edge_ttl": {
      "mode": "respect_origin",
      "status_code_ttl": [
        { "status_code_range": { "from": 400, "to": 499 }, "value": 60 },
        { "status_code_range": { "from": 500, "to": 599 }, "value": -1 }
      ]
    },
    "browser_ttl": { "mode": "respect_origin" }
  },
  "enabled": true
}
```

Order for the go-ahead: merge to main and let CI publish the four images; on
the VPS run `scripts/prod-init-volumes.sh` and reinstall the gate; add the
Cloudflare rule; run Deploy Production with the new SHA; then the checks above.
Do not curl `/data/schedule/` through Cloudflare before the deploy: the 404
would be held at the edge for 60 s.

### R7 — Close

Delete `.github/workflows/refresh-schedule-assets.yml`; keep
`scripts/refresh-schedule-assets.sh` for refreshing the committed bootstrap
copies; decide on `ci.yml`'s `workflow_dispatch`. Update the README, feature
reference, operations guide, production VPS guide, script inventory,
traffic-spike runbook, testing guide and launch gates.
