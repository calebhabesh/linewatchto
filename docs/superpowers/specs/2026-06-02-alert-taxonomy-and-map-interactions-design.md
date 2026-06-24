# LineWatchTO Alert Taxonomy And Map Interactions Design

**Date:** 2026-06-02
**Status:** Awaiting written-spec review

## Objective

Separate ordinary TTC delays from Reduced Speed Zones (RSZs), make alert timing accurate, and make every rendered disruption overlay useful as a map interaction.

This is the first implementation slice in a broader LineWatchTO iteration roadmap. It focuses on alert ingestion semantics, dashboard read models, map rendering, and test fixtures. Nightly closure scheduling, complete station accessibility data, live station outage reads, emergency station impacts, and source-labeled live arrivals remain follow-on slices.

The dashboard remains an unofficial TTC reliability dashboard. It must only claim live alert state while the latest successful ingestion run is fresh.

## Current State

The existing implementation already provides a strong foundation:

- TTC Live Alerts route and accessibility records are staged and normalized.
- Fresh normalized alert records can drive `/api/alerts`, `/api/status`, and `/api/map`.
- Suspensions render with red-and-white candy stripes.
- Records currently treated as delays render with orange directional chevrons.
- Reduced Speed Zone projection walks adjacent rapid-transit topology links.
- Opposite-direction RSZ records can merge into a bidirectional grouped card.
- Ordinary topology links resolve from SVG station-dot anchors.
- Nonlinear links can resolve from authored SVG guide paths.
- Overlay paths already include clickable SVG hit targets.
- Card selection already supports a temporary blue map flash.
- TTC child alert periods are persisted for future time-aware planned closure reads.
- Accessibility outages are normalized and linked to seeded stations where names resolve.

The current behavior is incomplete:

- `effect=SIGNIFICANT_DELAYS` is sufficient to route a record through the RSZ projector, even when TTC has not identified the record as an RSZ.
- The frontend has no separate Delays submenu or delay-specific visual treatment.
- Cards expose only a derived `Updated` age, which does not distinguish incident inception from TTC's latest revision.
- Structured direction values such as `Both ways` are not parsed as bidirectional.
- Clicking an overlay can select a card ID, but it does not open the matching submenu or scroll the corresponding card into view.
- Station hit circles can intercept clicks near station-centered impacts.
- Segment-only overlays cannot represent an impact that resolves to one station.
- The supplied edited SVG and repository SVG do not expose identical hidden guide layers.

## Official Source Semantics

The official TTC sources distinguish RSZs from broader delays:

- TTC Live Alerts feed: `https://alerts.ttc.ca/api/alerts/live-alerts`
- TTC Reduced Speed Zones page: `https://www.ttc.ca/riding-the-ttc/Updates/Reduced-Speed-Zones`

Observed RSZ route records include:

```text
effect=SIGNIFICANT_DELAYS
effectDesc=Reduced Speed Zone
rszLength
distance
trackPercent
reducedSpeed
averageSpeed
targetRemoval
```

`SIGNIFICANT_DELAYS` is a broad service-impact effect. It must not be treated as proof that a record is an RSZ.

## Scope

### Included

- Add an explicit normalized dashboard impact kind.
- Classify RSZs conservatively using TTC-specific RSZ evidence.
- Classify other degraded rapid-transit records as ordinary delays.
- Preserve suspension and planned-closure behavior.
- Add a dedicated Delays submenu using the supplied delay SVG icon.
- Render ordinary delays with animated monochrome TV static inside an amber outline.
- Render a static TV-static variant when reduced-motion mode is enabled.
- Preserve directional RSZ chevrons and suspension candy stripes.
- Parse `Both ways` case-insensitively as bidirectional.
- Render rider-facing line-axis copy for bidirectional records.
- Expose and render separate `Started` and `Updated` values.
- Persist and expose useful RSZ fields already present in the TTC payload.
- Make map overlay clicks open the correct submenu, scroll to the corresponding card, and trigger a 2.5-second blue flash.
- Add station-node disruption projection for one-station impacts.
- Render clickable pulsing station-node rings.
- Add fixtures and tests for ordinary delays, station-node impacts, and nonlinear overlay guides.
- Vet the supplied edited SVG before replacing the repository map asset.

### Excluded

- Time-aware nightly closure overlays.
- Joining normalized accessibility outages into station-detail responses.
- Loading the station accessibility CSV.
- Populating every station-line association.
- Wheelchair and elevator station badges.
- Source-labeled live arrivals.
- Station-specific emergency alert enrichment beyond the generic one-station node projection.
- TTC RSZ webpage scraping.
- GTFS import.
- Populated PostGIS geometry.
- Redis caching.
- Commute-impact matching.
- Reliability aggregation.

## Roadmap

### Slice 1: Alert Taxonomy And Map Interactions

Implement this design first. It produces a complete, independently testable improvement:

- ordinary delays no longer appear as RSZs;
- RSZ cards become richer;
- timing is unambiguous;
- bidirectionality is handled correctly;
- map overlays open their corresponding cards;
- one-station impacts have a visible map representation;
- authored nonlinear map guides are verified.

### Slice 2: Time-Aware Nightly Closures

Use persisted `alert_active_periods` child rows to distinguish:

- an upcoming closure card;
- an actively closed segment during a nightly window;
- a broad parent date range that should not paint the map continuously.

Planned closure overlays should activate only while the Toronto clock is inside a child window. The card remains visible before the closure so riders can plan ahead.

### Slice 3: Station Metadata And Accessibility

Load `~/Pictures/Assets/LineWatch/ttc_station_accessibility_lines_1_2_4_5_6.csv`, copy the supplied accessibility icons into frontend assets, and enrich station reads:

- every mapped stop has accurate line membership;
- static station metadata distinguishes wheelchair accessibility from elevator presence;
- Spadina Line 1 and Spadina Line 2 accessibility are represented separately while the rider-facing station panel remains coherent;
- normalized elevator and escalator outage rows appear in station details;
- outage state does not overwrite static station capability.

### Slice 4: Source-Labeled Live Arrivals

Select and integrate a public arrival provider. Replace demo estimates only after the source contract, freshness behavior, and failure fallback are verified. Until then, arrivals remain labeled as demo placeholders.

### Slice 5: Station Emergency Enrichment

Join resolvable station-specific alerts into station details and node overlays, including police, fire, track-level emergency, and similar TTC-published impacts. Do not infer sensitive details that TTC did not publish.

## Architecture

### Additive Impact-Kind Model

Keep the existing normalized `alerts` table and snapshot flow. Add an explicit `impact_kind` column and matching normalized field:

```text
suspension
delay
reduced-speed-zone
planned-closure
```

The existing `type` remains useful for broad persistence grouping:

```text
active-alert
planned-closure
```

The existing `severity` remains useful for line-status priority:

```text
delay
suspension
planned
```

`impact_kind` owns dashboard routing and visual behavior. This avoids overloading broad severity values with rider-facing semantics.

### Classification Rules

Classify rapid-transit route records in priority order:

1. Planned closure:
   - `alertType=Planned`, and
   - child periods or closure wording are present.
2. Suspension:
   - `effect=NO_SERVICE`, or
   - closure wording identifies an active no-service impact.
3. Reduced Speed Zone:
   - `effectDesc=Reduced Speed Zone`, or
   - the record is degraded service and includes at least one RSZ-specific structured field such as `rszLength`, `distance`, `trackPercent`, `reducedSpeed`, or `averageSpeed`.
4. Ordinary delay:
   - `effect=SIGNIFICANT_DELAYS`, or
   - another explicitly supported degraded-service effect.
5. Unsupported:
   - retain the staged source record, but do not expose a dashboard card.

`targetRemoval` is stored and displayed for RSZ records, but it is not sufficient by itself to classify a record as an RSZ because future TTC payloads may reuse removal timing for other impact types.

### Data Flow

```text
TTC Live Alerts API
  -> raw staging
  -> normalized alert with impactKind and source timestamps
  -> persistence and snapshots
  -> dashboard read projection
     -> suspension cards
     -> ordinary delay cards
     -> grouped RSZ cards
     -> planned closure cards
     -> segment impact layers
     -> station-node impact layers
  -> Next.js server fetch with fixture fallback
  -> map overlays and submenu cards
```

## TTC Field Ingestion

Extend `TtcAlertRecord`, `NormalizedRouteAlert`, `AlertEntity`, and persistence SQL with nullable RSZ fields:

```text
rszLength
distance
trackPercent
reducedSpeed
averageSpeed
targetRemoval
```

Persist the source values conservatively as nullable strings. They are TTC-authored presentation values and do not need numeric calculations in this slice.

Use these rider-facing labels:

```text
causeDescription -> Cause
targetRemoval    -> Resolution
rszLength        -> Zone length
distance         -> Station distance
trackPercent     -> Track affected
reducedSpeed     -> Reduced speed
averageSpeed     -> Normal speed
```

Append units in the UI only when TTC provides a non-empty value:

```text
Zone length      152 m
Station distance 891 m
Track affected   17%
Reduced speed    25 km/h
Normal speed     44 km/h
```

RSZ cards should keep the compact route-first hierarchy already underway in the current workspace. Render the richer fields in a simple metadata grid without nested decorative cards.

## Timing Semantics

Expose absolute timestamps in dashboard DTOs:

```text
startedAt = active_period_start
updatedAt = source_updated_at
```

Render both card fields:

```text
Started  4 hr 39 min ago
Updated  12 min ago
```

The fields answer different rider questions:

- `Started` reports when TTC says the active period began.
- `Updated` reports when TTC last revised the source record.

Frontend formatting should:

- derive relative ages from absolute ISO timestamps;
- refresh displayed ages once per minute while the dashboard is open;
- show minutes for sub-day values so `4 hr 39 min ago` remains precise;
- expose the exact Toronto timestamp through a semantic `<time dateTime>` element and a readable title.

For grouped RSZ cards:

- `startedAt` is the earliest non-null source start;
- `updatedAt` is the latest non-null source update.

If either timestamp is missing, omit that row instead of inventing copy.

## Direction Semantics

### Normalized Values

Retain the normalized direction enum:

```text
northbound
southbound
eastbound
westbound
bidirectional
unknown
```

Extend parsing to recognize these case-insensitive structured phrases:

```text
both ways
both directions
in both directions
```

Do not infer a cardinal direction solely from station order. When a record is explicitly bidirectional, use the affected line to render rider-facing axis copy:

```text
Line 1             Northbound & Southbound
Lines 2, 4, 5, 6   Eastbound & Westbound
```

For unknown direction:

- keep rider-facing copy as `Direction not specified`;
- render RSZ and delay movement bidirectionally so the map does not make an unsupported one-way claim.

## Dashboard API Contracts

### Alert Endpoints

Retain the existing broad endpoint and compatibility route:

```text
GET /api/alerts
GET /api/alerts?type=planned
GET /api/alerts?type=slowdown
```

Add:

```text
GET /api/alerts?type=delay
```

Semantics:

```text
/api/alerts                suspension cards
/api/alerts?type=delay     ordinary delay cards
/api/alerts?type=slowdown  grouped RSZ cards; compatibility path retained
/api/alerts?type=planned   upcoming planned closure cards
```

A representative ordinary delay DTO:

```json
{
  "id": "ttc-route-example-delay",
  "lineId": "line-4",
  "lineNumber": "4",
  "title": "Delays",
  "severity": "delay",
  "impactKind": "delay",
  "location": "Sheppard-Yonge to Don Mills",
  "description": "TTC-authored source description",
  "startedAt": "2026-06-01T22:15:00-04:00",
  "updatedAt": "2026-06-01T22:27:00-04:00",
  "affectedSegmentIds": [
    "line-4-sheppard-yonge-bayview",
    "line-4-bayview-bessarion",
    "line-4-bessarion-leslie",
    "line-4-leslie-don-mills"
  ],
  "source": "TTC Live Alert"
}
```

### Map Endpoint

Stop collapsing every disruption on a link into one semantic alert. Return independent map-impact layers so each visual kind has its own selection target:

```json
{
  "id": "line-1-eglinton-davisville",
  "lineId": "line-1",
  "stationAId": "eglinton",
  "stationBId": "davisville",
  "impacts": [
    {
      "kind": "reduced-speed-zone",
      "cardId": "reduced-speed-zone-ttc-route-synthetic-rsz-line-1",
      "travelDirection": "forward",
      "sourceAlertIds": ["ttc-route-synthetic-rsz-line-1"]
    }
  ]
}
```

Expose one-station impacts separately:

```json
{
  "stationNodeImpacts": [
    {
      "stationId": "sheppard-yonge",
      "kind": "delay",
      "cardId": "ttc-route-example-station-delay",
      "title": "Delays at Sheppard-Yonge Station"
    }
  ]
}
```

Keep a short transition period if needed where existing scalar segment fields remain present for frontend fallback:

```text
overlay
travelDirection
sourceAlertIds
reducedSpeedZoneIds
alertId
```

The implementation should remove duplicated frontend composition after the layered map contract is verified.

### Projection Rules

Project cards to segment impact layers:

```text
suspension         -> ordinary segment walk
delay              -> ordinary segment walk
reduced-speed-zone -> directional grouped RSZ projector
planned-closure    -> preview segment walk
```

Project a record to a station node when:

- exactly one station resolves from its bounds or station list; and
- no segment walk is possible or appropriate.

If one segment carries multiple active impact kinds, render independent visual layers in this order:

```text
planned preview
reduced-speed-zone
delay
suspension
```

The topmost hit target opens the highest-priority visible impact. Underlying cards remain selectable from their submenu and can still trigger their own blue flash.

## Frontend UX

### Delays Submenu

Copy `~/Pictures/Assets/LineWatch/delay-icon.svg` into the repository frontend assets during implementation.

Add a `Delays` submenu entry with:

- the supplied SVG icon;
- an ordinary-delay count badge;
- route-first delay cards;
- `Started`, `Updated`, source, and useful TTC-authored metadata;
- `Highlight on Map` and `Clear Highlight` actions matching the existing card language.

The top-level at-a-glance line rows should distinguish:

```text
suspension icon
delay icon
RSZ construction icon
planned closure icon
```

### Delay Visual Treatment

Ordinary delays render with:

- an amber outline;
- animated monochrome SVG noise inside the route stroke;
- a soft amber glow;
- a non-animated speckled fallback when reduced-motion mode is enabled.

Use an SVG filter or pattern scoped to the rendered delay layer. Keep it visually distinct from:

- RSZ orange directional chevrons;
- suspension red-and-white candy stripes;
- planned closure blue preview styling.

### Overlay Click Coordination

Replace loosely related selected IDs with a typed impact selection:

```ts
type ImpactSelection = {
  kind: "suspension" | "delay" | "reduced-speed-zone" | "planned-closure";
  id: string;
} | null;
```

When a rider clicks an overlay:

1. stop map drag propagation;
2. open the matching submenu;
3. select the corresponding card;
4. scroll that card into view;
5. render the existing blue path flash for 2.5 seconds;
6. clear the temporary selection after 2.5 seconds;
7. leave the submenu open.

Apply the same behavior when a rider activates an overlay through the keyboard.

Cards should expose stable `data-impact-card-id` attributes or refs so the panel can call `scrollIntoView({ block: "nearest" })`.

### Station-Node Overlays

Render singular-station disruptions as SVG rings centered on existing station coordinates:

- suspension: red ring;
- ordinary delay: amber static ring;
- RSZ: amber directional-compatible ring if TTC publishes such a record;
- selected: temporary blue flash ring.

The visual ring pulses unless reduced-motion mode is enabled.

Use a stroked ring with `pointer-events: stroke` so:

- clicking the ring opens the disruption submenu and card;
- clicking the station-dot center can still open station details;
- the station hit target does not intercept the ring interaction.

## SVG Asset Compatibility

The repository asset currently includes canonical overlay centerline guides:

```text
segment-guides-layer
seg-line-1-st-andrew-union
seg-line-1-union-king
seg-line-1-spadina-st-george
seg-line-1-dupont-spadina
```

The supplied edited asset at:

```text
~/Pictures/Assets/LineWatch/TTC_Subway Map_Edited.svg
```

contains hidden nonlinear shapes under:

```text
non-linear-guides-layer
union-to-st-andrew
union-to-king
st-george-to-spadina
```

The supplied asset does not currently contain the canonical Dupont-to-Spadina centerline guide. Its nonlinear shapes are useful authoring references, but the runtime overlay renderer needs stable centerline paths.

Do not blindly overwrite the repository SVG. During implementation:

1. add an asset-level test that verifies every topology `guide_path_id` resolves in the repository SVG;
2. add fixtures that exercise King-to-Union, St Andrew-to-Union, Spadina-to-St George, and Dupont-to-Spadina;
3. compare the supplied asset against the repository copy;
4. import the desired visual edits while preserving or re-adding the canonical `segment-guides-layer`;
5. verify station anchor IDs remain stable, especially `station-spadina-1` and `station-spadina-2`;
6. verify all nonlinear runtime centerlines still resolve after the asset update.

## Error Handling

Backend:

- Stage unsupported records instead of misclassifying them.
- Omit card timestamp fields when TTC values are absent.
- Preserve a one-station card even when no segment path can be projected.
- Preserve an unmatched card when station aliases fail, but do not draw an invented path.

Frontend:

- Render cards even when no map projection exists.
- Disable or omit `Highlight on Map` when neither segment IDs nor a station node are available.
- Fall back to straight station-to-station paths when an SVG guide cannot be read.
- Keep reduced-motion mode functional when animated noise or pulsing rings are unavailable.
- Keep fixture fallback complete if any required dashboard request fails.

## Testing Strategy

### Backend

Add focused tests for:

- generic `SIGNIFICANT_DELAYS` -> ordinary delay;
- `effectDesc=Reduced Speed Zone` -> RSZ;
- RSZ numeric metadata -> RSZ when the effect description is absent;
- `targetRemoval` alone does not classify a generic record as RSZ;
- RSZ fields persist through the store;
- `Both ways`, `both ways`, and `Both Directions` -> bidirectional;
- line-axis display copy for explicit bidirectionality;
- ordinary delay endpoint responses;
- layered map impacts;
- one-station node projection;
- grouped RSZ earliest `startedAt` and latest `updatedAt`;
- stale ingestion suppresses ordinary delays, RSZs, and node impacts.

### Frontend

Add focused tests for:

- Delays submenu and supplied icon asset;
- `Started` and `Updated` card rows;
- minute-precise relative age formatting;
- animated static delay pattern;
- reduced-motion static fallback;
- map overlay click -> submenu open -> card scroll target -> blue flash;
- keyboard activation of overlays;
- station-node ring rendering and click handling;
- card action disabled when no geometry exists;
- nonlinear SVG guide resolution for all four canonical links;
- stable Spadina anchor IDs;
- supplied asset import compatibility;
- existing suspension, RSZ, station-dot, and planned-preview interactions remain intact.

### Verification

Run:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

## Acceptance Criteria

- Generic delays never appear in the Reduced Speed Zones submenu.
- RSZ records continue to render directional chevrons and grouped bidirectional cards.
- A dedicated Delays submenu uses the supplied icon.
- Ordinary delay overlays use the distinct TV-static treatment.
- Reduced-motion mode renders a static delay treatment.
- Cards show `Started` and `Updated` from TTC source timestamps when present.
- `"Both ways"` produces a bidirectional map treatment and line-appropriate rider copy.
- Clicking or keyboard-activating an overlay opens the matching submenu, scrolls its card into view, flashes the affected geometry for 2.5 seconds, clears the temporary selection, and leaves the submenu open.
- One-station impacts render clickable rings without blocking station-detail clicks at the dot center.
- King-to-Union, St Andrew-to-Union, Spadina-to-St George, and Dupont-to-Spadina overlays resolve through canonical SVG guides.
- The supplied edited SVG is imported only after canonical guide and station-anchor compatibility checks pass.
- Fixture fallback remains complete.
- README and agent guidance claims remain aligned with working code.
