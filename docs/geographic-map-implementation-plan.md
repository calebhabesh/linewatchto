# Geographic map view: implementation handoff

Status: product decisions agreed with the owner; implementation not started.
Prepared: 2026-09-18. Intended implementer: Gemini 3.8 Flash.

Add an optional geographic map to the existing reliability dashboard for both
TTC and GO/UP. Preserve the diagram, dashboard, and existing transit semantics.
This document is the implementation brief, not evidence that features or
performance targets have already been delivered.

## 1. Agreed product decisions

| Decision | Requirement |
| --- | --- |
| Purpose | Relate stations and disruptions to streets and neighbourhoods. |
| Scope | Match existing mapped networks: TTC Lines 1, 2, 4, 5, 6; seven GO rail corridors and UP. |
| Interface | A compact **Diagram / Map** chooser, separate from TTC / GO/UP network selection. Diagram is the initial default. |
| Persistence | Remember view style across networks; retain a separate camera for each network and style. |
| Interactions | Preserve search, station details, impact selection, planned-closure previews, and My Commutes highlighting where geographic coverage exists. |
| Animation | Geographic mode omits estimated moving trains. Prioritize responsive interactions and readable routes; reduce labels and optional motion on phones. |
| Basemap | MapLibre GL JS with OpenFreeMap; restrained light/dark street maps. No recurring map-provider charge, billing account, or paid fallback. |
| Failure | Explain the failure and offer **Retry / Use diagram**, retaining dashboard selection. |
| Accuracy | Use verified coordinates and published geometry. Disclose missing coverage; do not invent connecting tracks or street alignments. |
| Delivery | Responsive website first. Native app integration is deferred; keep geographic data reusable. |

GO bus connections/notices are already observed elsewhere in the dashboard but
are not routes on the existing maps. Keep those features in existing panels;
adding bus or streetcar map layers would expand this agreed release scope.

Also excluded: satellite/terrain/3D backgrounds, location permissions, address
search, walking/driving directions, new journey planning, geographic vehicle
tracking, and downloadable offline basemaps. Existing project hosting still
serves app assets; “free” here means no new paid map service or hosting tier.

## 2. Implementation sequence

Execute one phase per agent session, in order. Each phase below is a mandatory
session boundary, not just a milestone within one long run. After completing
the active phase, update the [checkpoint](geographic-map-checkpoint.md), report
the result, and end the session. Start the next phase only when the owner
initiates a subsequent session or explicitly changes these boundaries. Do not
automatically continue or delegate the next phase to another agent.

If a phase needs more than one session, record it as in progress and resume that
same phase next time. Context compaction is not a new session and does not
authorize crossing a phase boundary. Never mark a phase complete to fit a
session: its completion criterion still applies.

Use the current root/scoped AGENTS.md instructions. Read
[domain invariants](domain-invariants.md) for maps, freshness, arrivals, and
commutes; [source launch gates](source-licensing-launch-gates.md) before source
work; [testing](testing.md) before choosing integrated checks. This feature
does not supersede existing source permissions or public-launch gates.

### Session start and handoff protocol

At session start, read this plan, the checkpoint, and applicable repository
guidance. Inspect current Git status and the relevant diff; verify that saved
artifacts and evidence still match the worktree. Resume the checkpoint's active
phase, or its next phase if the owner has started that session. If the checkpoint
is missing, reconstruct progress from artifacts and checks before proceeding;
do not assume completion or restart everything.

At every session end, update the checkpoint with the active phase/status,
completed work, changed files/artifacts, checks and exact results, unresolved
issues, and the next concrete task. Include the Git HEAD and relevant uncommitted
changes so another session can locate the work. A checkpoint does not require
a commit. Preserve unrelated edits and identify them without claiming ownership.
Store source URLs/checksums and durable artifact paths, never credentials or raw
provider payloads. Temporary download paths alone are not a reproducible handoff.

Keep completed phase evidence in a compact log. Reuse passing checks only while
the code they cover remains unchanged. Report skipped or blocked checks and
missing physical-device evidence explicitly. If a later phase uncovers an
earlier defect, make the bounded prerequisite repair, update its evidence, and
return to the active phase; this does not authorize starting another phase.

Finish the user-facing handoff with the phase outcome, checkpoint link, material
limitations, and a ready-to-use prompt for the next session. This protocol is
written guidance for the implementing agent; it does not itself launch a new
session or enforce a runtime token limit.

### Session 1 / Phase A: prove geographic coverage

Inspect current authoritative GTFS feeds and existing application topology.
Inventory every mapped station, route, and adjacent link. Record source URLs,
retrieval dates, feed validity, checksums, terms/attribution links, and coverage
gaps. A route in an application fixture is not proof it exists in the current
feed. Keep future, retired, fixture, and published coverage distinguishable.

Completion: a reviewed coverage manifest accounts for every in-scope station
and link as verified or explicitly unavailable. Confirm enough geometry for a
usable view of both networks before investing in styling. A whole missing
network is an incomplete deliverable, not successful partial completion.

Stop: record the coverage/provenance artifacts and unresolved source questions
in the checkpoint. Hand off Phase B; do not start generation tooling this session.

### Session 2 / Phase B: build a reproducible geographic catalog

Create offline preparation tooling that reads downloaded GTFS archives and
emits small versioned geometry assets. Keep source archives outside Git and
outside public assets. A normal application build consumes reviewed generated
files without network access; regeneration is an explicit maintenance command.

Prefer this asset workflow for the first release over extending live schedule
ingestion, database tables, or adding a geometry API. Reuse existing station and
route identity mappings where practical. Keep schedule imports unaffected.

Completion: deterministic generation, provenance and gap reports, geometry
validation, and small fixture-based tests pass; generated artifacts are fit
for public redistribution under the selected sources' terms.

Stop: record regeneration commands, generated assets, validation results, and
remaining gaps. Hand off Phase C; do not start renderer work this session.

### Session 3 / Phase C: deliver one complete vertical slice

Lazy-load a geographic renderer behind the chooser. Start with TTC routes and
station selection through the existing station panel. Implement loading,
unsupported-device, and error states immediately. Connect light/dark styling,
zoom/recenter, separate camera persistence, and unmount cleanup.

Completion: Diagram opens without loading geographic resources; Map loads on
demand, station clicks reach existing details, and failures leave the dashboard
usable. Validate a production build and a representative phone early.

Stop: record the working TTC slice, lifecycle/recovery evidence, and early
performance results or measurement gaps. Hand off Phase D; do not expand into
regional rendering or overlay parity this session.

### Session 4 / Phase D: finish both networks and overlay parity

Add regional geometry, branch/shared-corridor handling, impact and planned
overlays, commute previews, search/focus actions, and accessibility alternatives.
Validate source freshness changes independently of map loading. Update legends
and control capabilities for the active view.

Completion: every acceptance case below works for both networks; unavailable
geographic coverage is visible and does not discard the underlying panel data.

Stop: record delivered interaction coverage and focused check results. Hand off
Phase E for the final validation sweep; do not begin that sweep this session.
Phase-local verification remains required before this handoff.

### Session 5 / Phase E: verify and hand off

Run affected final checks once the implementation is stable. Record coverage,
performance measurements, test results, and any remaining limitations. Update
product claims only to reflect delivered behavior. Provide the regeneration
command and source-update procedure alongside the generated manifest.
When updating domain documentation, scope its authored-SVG placement wording to
Diagram and document geographic placement separately; retain the same impact
and freshness invariants.

Completion: the final report distinguishes measured results from targets,
identifies any missing real-device validation, and does not describe incomplete
geometry or failed checks as complete. No deployment is part of this brief.

Stop: record final validation evidence and remaining limitations. Mark the work
complete only when the agreed acceptance criteria are met; otherwise leave the
specific unfinished work recorded for a follow-up session. End with the final
implementation handoff, not an automatic deployment or additional feature work.

## 3. Existing seams and proposed ownership

These paths were inspected during planning; re-check relevant code before edits.
Proposed new filenames are suggestions, not requirements to reorganize the app.

| Existing owner | Integration role |
| --- | --- |
| [NetworkMap.tsx](../frontend/src/components/NetworkMap.tsx) | Chooses current TTC/regional renderers. Add view-style dispatch here. |
| [LineWatchShell.tsx](../frontend/src/components/LineWatchShell.tsx) | Owns network, selection, preferences, and dashboard interactions. Keep shared state above renderer lifetimes. |
| [visual-preferences.ts](../frontend/src/app/visual-preferences.ts) | Add a separately named map-view preference; existing `defaultNetwork` still means TTC versus regional. |
| [map-viewport-preference.ts](../frontend/src/app/map-viewport-preference.ts) and [persistence hook](../frontend/src/hooks/useMapViewportPersistence.ts) | Existing diagram cameras are SVG coordinates. Geographic cameras need a separate validated schema/key. |
| [station-data.ts](../frontend/src/app/station-data.ts) | `StationSummary.mapX/mapY` are schematic coordinates. Preserve that meaning. |
| [regional-data.ts](../frontend/src/app/regional-data.ts) | Existing route IDs, station IDs, branches, and shared-corridor identities. |
| [linewatch-data.ts](../frontend/src/app/linewatch-data.ts) | TTC topology, impact shapes, and source-labeled dashboard contracts. |
| [TTC import models](../backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsImportModels.java) | Current schedule rows omit geographic coordinates and shape IDs. |
| [regional importer](../backend/src/main/java/com/calebhabesh/linewatch/regional/RegionalGtfsScheduleImportService.java) | Current GO schedule import is rail-only and does not retain geographic shapes. |

Use three small boundaries:

1. `geographic-catalog`: static coordinates, route-link geometry, coverage, and
   provenance; independent of React and MapLibre.
2. `geographic-overlays`: pure projection of existing normalized impact,
   selection, and commute data onto known catalog IDs. No new alert inference.
3. `GeographicNetworkMap`: MapLibre lifecycle, rendering, hit-testing, and camera.
   Inputs and callbacks speak application IDs, not MapLibre event objects.

```text
Published GTFS + reviewed identity mappings
                 |
          offline preparation
                 |
       versioned geographic catalog ----+
                                        |
Existing dashboard state --> overlay adapter --> geographic renderer
          |                                      ^
          +--> existing panels <--- ID callbacks -+

NetworkMap chooses Diagram or Map; the shell retains dashboard state.
```

Extract only renderer-neutral props needed by both views. The current wrapper
derives its prop type from `InteractiveTtcMap`; avoid making the geographic
component depend on SVG path measurements, image planes, or diagram transforms.
Keep existing diagram preparation intact; consult the
[map asset contract](ttc-map-asset-contract.md) if touching that pipeline.

## 4. Geometry and data contract

### Sources and preparation

Configured source starting points are the Toronto CKAN package
`merged-gtfs-ttc-routes-and-schedules` and the public GO/UP GTFS archives linked
from the [GO developer page](https://www.gotransit.com/en/partner-with-us/software-developers).
Resolve current feed resources during regeneration, not on a user's device.
Verify actual feed contents before assuming a line or station has shapes.

Direct planning-time archive inspection confirmed the following. This checks
shape references, not coordinate correctness, complete station mapping, or every
branch alignment; Phase A still validates those details against the app.

| Feed | Observed on 2026-09-18 |
| --- | --- |
| TTC | Stop latitude/longitude and shapes present. Every trip on Lines 1/2/4/5/6 references an existing shape. Line 1 references 62 distinct shapes and Line 2 references 80, making consolidation important. |
| GO | Stop coordinates and shapes present for all seven rail corridors. Unmatched shape references affect 1 LW trip, 65 LE trips, 128 KI trips, and 8 BR trips; none found for MI/RH/ST. LW has 15 referenced shapes. |
| UP | Stop coordinates and two shapes present; every trip references an existing shape. |

These are dated feed observations, not permanent counts or proof that every
in-scope app station/link is geographically covered. Source archives were
inspected without adding raw feed files to the repository.

Read the relevant GTFS files: stops, routes, trips, stop times, shapes, and
service calendars/exceptions. Join `trips.shape_id` to ordered shape points.
Use feed service dates to exclude obsolete variants from the chosen published
network snapshot; rendering a corridor does not assert that a train runs now.
GTFS details: [official schedule reference](https://gtfs.org/documentation/schedule/reference/).

Use reviewed mappings from operator-scoped GTFS IDs to existing app IDs.
GTFS IDs can change between feed versions. Parent stations and platform stops
need explicit treatment: prefer valid published station coordinates, otherwise
use a documented, reviewed platform-derived location with provenance. Do not
geocode station names automatically or join stations solely by proximity.
Preserve persisted spelling quirks such as `station-greenwoood` and
`station-o_connor`; correcting identity is outside this feature.

For route geometry, retain verified physical variants needed to cover the
existing network graph. Deduplicate identical/reversed alignments; don't draw
every scheduled trip as a line. Select representative shapes through reviewed
rules, not arbitrary first rows. Split geometry into existing adjacent-link
identities so disruptions and commutes can address the same logical segments.
Use ordered stops and shape distances where valid; reject ambiguous projection
around loops, crossings, branches, and express trips that skip intermediate
stations. Keep branches separate (notably Aldershot–Hamilton versus
Aldershot–West Harbour); preserve shared KI/UP corridors.

Simplify outside the browser, retaining station/link boundaries and recognizable
alignment. Validate coordinate order `[longitude, latitude]`, finite values,
regional bounds, IDs, continuity, endpoints, and unexpected long jumps. Avoid
claims of surveyed or track-level precision: these are published route shapes.

### Public artifact shape

Use one manifest and a separately loadable catalog per network. Each catalog
contains GeoJSON station points and adjacent-link lines (or explicit multipart
geometry), plus coverage metadata. A suitable minimal contract is:

| Entity | Required information |
| --- | --- |
| Manifest | Schema version, content version/hash, network asset URLs, generation date, source/feed validity dates, provenance/attribution references. |
| Station | Stable feature ID, network, existing station ID, line IDs, verified point coordinates. |
| Link | Stable feature ID, network, existing segment/link ID, route ID, endpoint station IDs, variant/direction mapping, published geometry. |
| Coverage | Every unsupported station/link ID, reason, applicable source version, and whether station-only display remains possible. |

Keep line colors/names tied to existing route definitions. Avoid embedding
changing alert status, arrival predictions, account data, or raw provider rows
in geographic assets. Artifact timestamps describe geometry, not live service.
Publish generated files atomically with content-versioned URLs; reject invalid
refreshes and retain the previous reviewed version with its dates visible.
Document regeneration when feeds/topology change; compare coverage against the
application topology in CI so additions cannot silently disappear from Map.

If geometry is missing, show verified stations and an explicit coverage notice.
Keep the corresponding route/impact available in existing panels and Diagram.
Never fabricate a line, fill coordinates with zeroes, or imply a temporary
diversion matches scheduled geometry. Partial commute highlights must disclose
their gaps rather than appear to be a complete route.

## 5. Rendering and interaction rules

### Lifecycle and layers

Load `maplibre-gl` only inside the geographic client boundary. Pin a stable
compatible release in the lockfile during implementation. Load only the active
network's catalog. Do not preload geographic scripts, tiles, or geometry for a
Diagram session. Reuse the existing shell and map control area for the chooser.

Keep only the selected renderer mounted and painting. Capture the outgoing
camera before unmount; remove the MapLibre instance, listeners, observers, and
owned work on cleanup. Cancel or ignore stale async loads after switching modes
or networks. Hidden-page updates must not drive continuous animation. Keep
dashboard polling/source ownership outside the renderer.

Draw routes, station circles, symbols, and overlays with batched MapLibre
sources/layers; avoid one React/DOM marker per station. Keep static geometry
separate from small changing impact features. Update feature state or the
affected source only; an alert refresh must not rebuild the map or refetch tiles.
Install custom layers idempotently after a theme/style load, preserving camera
and selection. Keep layer IDs application-owned and stable.

Use a flat, north-up, 2D map. Disable pitch and rotation, including touch
rotation; diagram portrait-rotation transforms must not rotate geographic text.
Use zoom-dependent line widths and collision-managed labels. Selected stations
and major interchanges remain identifiable; progressively reveal ordinary
station labels. Distinguish shared routes with deterministic visual offsets or
casing and consistent hit-testing. Offsets are graphic separation, not separate
physical track claims. Resolve overlapping impact hits through an accessible
list/chooser instead of selecting an arbitrary incident.

Preserve existing route colors and impact meanings: red suspension/closure,
orange delay, explicit RSZ treatment, blue planned preview. Station-only impacts
remain station rings. Direction-aware matching stays in application topology;
ordinary delays do not become RSZs. Keep the route identity legible beneath
overlays and distinguish state through more than color. Commute highlighting
must not obscure active disruption information.

### Selection and camera

Use a `diagram | geographic` preference distinct from `ttc | regional`.
Persist view choice using the existing visual-preference conventions, with
safe defaults for old/malformed storage and consistent server/client hydration.
Maintain separate cameras for all four network/view combinations. Retain
existing diagram storage; store geographic longitude/latitude/zoom separately,
validated and bounded, following the current mobile-local/desktop-session camera
storage convention. Save on movement end, not every animation frame.

Camera precedence: explicit “show on map” request, active selection on view
entry, valid saved camera, then whole-network fit. An ordinary data refresh or
selection-clear action must not recenter. A user pan after selection remains
respected until a new explicit focus request. If selection lacks coordinates,
retain its panel and explain why it cannot be focused geographically.
Recenter fits the active network. Fit/focus accounts for sidebar, bottom sheet,
safe areas, and controls; size changes call resize without repeatedly fitting.
Persist cameras independently when switching networks; preserve existing
network-specific rules for clearing or translating selection.

Hide or disable geographic-inapplicable controls with a clear accessible reason
(estimated trains, diagram rotation). Keep the stored estimated-train preference
so returning to Diagram restores it. Update the legend to describe actual layers.

### Accessibility and failure

The canvas cannot be the only way to choose a station or inspect an impact.
Reuse keyboard-accessible search/lists and panels, add accessible map/control
names, preserve visible focus, and retain an obvious exit from keyboard map
navigation. Honor reduced motion and high contrast; no automatic camera flights
under reduced motion. Attribution must remain visible above sheets/safe areas.
Inspect at 360px and 1440px and either side of modified breakpoints.

Distinguish loading, ready, partial coverage, and unavailable. Bound initial
loading (initial engineering default: 12 seconds before a recoverable error)
and keep Retry/Use diagram available. An isolated tile error should not tear
down an otherwise usable map; persistent style/catalog failure and unsupported
WebGL must reach the recovery UI. Handle WebGL context loss, with bounded
recovery rather than repeated reload loops. Reset timeout/error state on retry.

Basemap failure never changes transit freshness. Loss of live transit data uses
the existing stale/offline rules even if tiles still render. Geographic mode
does not promise offline availability; provide Diagram recovery. Preserve the
existing public snapshot policy. The service worker must not start caching map
provider requests, API responses, account data, or bulk offline tile packs.

## 6. Provider, attribution, and deployment boundaries

Use OpenFreeMap's documented MapLibre style endpoint; select its restrained
light/dark styles after inspecting Toronto at network and station zoom levels.
Keep provider/style URLs in one small configuration seam so hosting can change
later without rewriting transit logic. Avoid a generic multi-provider framework.

OpenFreeMap advertises no registration, key, or request/view limit and provides
the service as-is. These are current service terms, not a promise of permanent
availability. Use direct browser requests with no credentials. Review actual
style dependencies (tiles, glyphs, sprites) and allow only necessary origins in
deployment policy; verify worker/CSP behavior in the production build. Preserve
provider/data attribution, including OpenFreeMap, OpenMapTiles and OpenStreetMap
as applicable to the selected style. Do not replace it with only “Data © TTC.”

Document that loading Map contacts the basemap provider/CDN and update relevant
privacy/acknowledgements copy. No geolocation permission is needed. Basemap
requests must never include account identifiers, tokens, or private commute
records. Only public geometry is shared with the rendering layer/provider URLs.

For transit inputs, record the exact source and applicable terms. The Metrolinx
open-data overview and GO download agreement use different licensing language;
do not treat either as blanket permission for all other inputs. Preserve the
repository's existing launch gates. Source approval issues limit the affected
source/public release, not unrelated local implementation work. Contacting
providers or publishing is outside this implementation brief.

## 7. Acceptance and performance evidence

Performance numbers below are engineering targets, not existing measurements
or guarantees about a free external service. Establish a baseline in Phase C
and record hardware, browser, connection/throttling, and cold versus warm cache.

| Check | Acceptance evidence |
| --- | --- |
| Diagram isolation | Network/bundle inspection shows no geographic JS, catalog, tile, sprite, or glyph downloads until Map is selected or restored as the saved preference. Existing Diagram interactions remain responsive. |
| Geometry weight | Aim for at most 500 KB compressed per network catalog, excluding basemap resources. Measure emitted bytes and justify any exception with profiling before adding complexity such as vector tiling. |
| First use | Target usable initial routes/stations within 3 seconds under a documented ordinary mobile connection; a slower/failed provider reaches bounded recovery, never an endless spinner. Report p50/p95 across repeated cold/warm runs. |
| Interaction | Target roughly 60 fps on desktop and at least 30 fps during sustained pan/zoom on a representative midrange phone; map selection gives visible feedback within 200 ms once loaded. Profile stutters instead of assuming GPU rendering solves them. |
| Idle/lifecycle | No continuous custom render loop while idle. After 20 view/network switches, only one active map instance remains, with no accumulating canvases/listeners/contexts or monotonic retained-memory growth. |
| Layout | Both networks in light/dark/high contrast, 360px phone and 1440px desktop; labels, attribution, chooser, selection, and bottom sheet remain usable without page-level overflow. |
| Resilience | Slow/failed styles, tiles and catalogs; malformed preference; denied storage; absent/lost WebGL; offline/reconnect; rapid switches during load; theme change during load. |

Profile the production build on Android Chrome and iOS Safari when available.
Desktop CPU throttling and automated WebKit checks supplement, but do not prove,
real-device GPU/memory performance. Report missing physical-device evidence.

Add meaningful regression coverage for:

- Catalog identity/coverage and coordinate validation; branch topology, ordered
  shape slicing, direction variants, missing geometry, and deterministic output.
- Existing impact semantics: station-only rings, direction-aware spans, explicit
  RSZs, planned previews, stale/offline data, and partial commute coverage.
- View preference and independent geographic cameras, corrupt storage, explicit
  focus versus restore, and keeping selection through a view change/failure.
- Integrated flows on both networks: search to station, station/impact click to
  panel, commute/closure preview, mode/network/theme switches, and recovery.
- Attribution, accessible controls/list alternatives, reduced motion, cleanup,
  and no geographic downloads before use.

Use deterministic local geometry/style/tile fixtures for CI, including a real
renderer integration where supported; a mocked canvas alone cannot prove map
rendering. Keep external-provider smoke checks separate from deterministic CI.
Run the frontend final checks prescribed by its scoped guide, including build
and full smoke/E2E for this broad map interaction change. Use focused visual
coverage for both new views; run broader visual checks if global styling changes.
Run backend tests only if backend code changes. Consult the testing guide for
build reuse, serial stub suites, and existing platform/test limitations.

## 8. Research and implementation follow-ups

Primary references checked during planning (2026-09-18):

- [MapLibre GL JS](https://maplibre.org/projects/gl-js/) and its
  [GeoJSON performance guide](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/):
  vector rendering and practical data-size/layer optimization guidance.
- [OpenFreeMap](https://openfreemap.org/), [quick start](https://openfreemap.org/quick_start/),
  [terms](https://openfreemap.org/tos/), and [privacy](https://openfreemap.org/privacy/):
  chosen free hosted basemap, integration and attribution, and availability limits.
- [Leaflet](https://leafletjs.com/) and [OpenLayers](https://openlayers.org/):
  credible alternatives considered. MapLibre was selected for vector styling,
  label management, and theme control, not a measured universal speed advantage.
- [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/):
  standard OSM public raster tiles are not an unlimited guaranteed fallback.
- [GTFS reference](https://gtfs.org/documentation/schedule/reference/),
  [GO developer downloads](https://www.gotransit.com/en/partner-with-us/software-developers),
  and [Metrolinx open data](https://www.metrolinx.com/en/about-us/open-data):
  geometry format and source discovery; specific feed coverage needs validation.

The remaining work is factual validation and implementation, not a new product
interview: verify actual feed coverage/terms, choose concrete styles and a stable
library version, and measure performance. Preserve the agreed scope. If a
verified gap makes a whole network unusable or requires a paid dependency,
report that concrete constraint rather than silently expanding the feature.
