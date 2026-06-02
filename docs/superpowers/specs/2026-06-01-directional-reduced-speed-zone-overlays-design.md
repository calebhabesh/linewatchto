# Directional Reduced Speed Zone Overlays Design

**Date:** 2026-06-01
**Status:** Approved for implementation planning

## Objective

Translate normalized TTC Live Alerts reduced-speed records into precise, directional map overlays and rider-facing Reduced Speed Zone cards.

The first demonstrable record is:

```text
Synthetic scenario: reduced speed southbound between Eglinton and Davisville.
Eglinton to Davisville
```

The dashboard should render an orange pulsating overlay between Eglinton and Davisville with chevrons moving southbound only. When TTC publishes matching alerts in both directions for the same physical track link, the dashboard should render one bidirectional chevron effect and one grouped rider-facing card.

This slice touches backend topology and dashboard projection, frontend map geometry resolution and rendering, UI terminology, fixtures, tests, and documentation. It does not add TTC Reduced Speed Zones webpage ingestion.

## Current State

The existing pipeline already provides a useful foundation:

- TTC Live Alerts route records are polled and normalized.
- Records with `effect=SIGNIFICANT_DELAYS` or `effectDesc=Reduced Speed Zone` normalize to `active-alert` / `delay`.
- TTC stop bounds such as Eglinton and Davisville resolve to station IDs.
- The normalized alert record persists a nullable TTC `direction` field.
- Dashboard-facing `/api/alerts?type=slowdown` and `/api/map` boundaries exist.
- The SVG map contains individually identifiable station dots.
- The SVG map contains a hidden `segment-guides-layer` for nonlinear Line 1 links:

```text
seg-line-1-st-andrew-union
seg-line-1-union-king
seg-line-1-spadina-st-george
seg-line-1-dupont-spadina
```

- React renders orange pulsating two-lane chevrons for current `delay` overlays and red-and-white candy-cane overlays for suspensions.

The current implementation is incomplete:

- The backend projects alerts onto a small set of coarse display corridors rather than adjacent station-to-station physical links.
- Eglinton to Davisville cannot currently produce an overlay because that link is not represented in the coarse `line_segments` seed.
- Direction is discarded before the map response reaches React.
- Every delay overlay renders the same bidirectional chevron effect.
- Rider-facing UI uses `Slowdowns` instead of TTC vocabulary.

## Scope

### Included

- Rename rider-facing `Slowdowns` copy to `Reduced Speed Zones`.
- Derive a normalized cardinal direction from explicit TTC Live Alert wording when the structured source field is blank.
- Preserve independently ingested TTC records for snapshotting and expiry.
- Model adjacent physical station-to-station links for every mapped rapid-transit line.
- Project reduced-speed records onto affected adjacent links.
- Aggregate opposite-direction reduced-speed impacts per physical link.
- Expose grouped rider-facing Reduced Speed Zone cards.
- Render forward-only, reverse-only, and bidirectional chevrons.
- Generate ordinary overlay geometry from SVG station-dot anchors with station-coordinate fallbacks.
- Read authored nonlinear overlay geometry from the SVG map's hidden `segment-guides-layer`.
- Retain existing suspension candy-cane and planned-preview effects.
- Respect reduced-motion mode with static directional patterns.

### Excluded

- Polling or parsing the TTC Reduced Speed Zones webpage.
- X/Twitter ingestion or scraping.
- Rich reduced-speed metadata such as defect length, track percentage, speed limits, reason, or target removal.
- GTFS import.
- Populated PostGIS geometry and geospatial intersection matching.
- Live arrivals.
- Redis caching.
- Commute-impact matching.
- Reliability aggregation.

## Terminology

Use TTC vocabulary in the visible UI:

```text
Slowdowns             -> Reduced Speed Zones
Slowdown              -> Reduced Speed Zone
View slowdown         -> View reduced speed zone
```

Internal `delay` severity remains valid because it is the broader normalized alert taxonomy used for status calculations and map styling.

## Architecture

### Data Flow

```text
TTC Live Alerts API
  -> normalize Reduced Speed Zone
  -> derive explicit cardinal direction from alert text when needed
  -> resolve start and end station IDs
  -> walk adjacent physical links between bounds
  -> aggregate directional impacts per physical link
  -> expose grouped Reduced Speed Zone cards and map-link impacts
  -> render straight SVG paths or authored nonlinear SVG guides
```

Examples:

```text
Eglinton -> Davisville, southbound
  -> one affected physical link
  -> southbound chevrons only

Yorkdale -> Wilson, northbound
Wilson -> Yorkdale, southbound
  -> same physical link
  -> one bidirectional chevron overlay
  -> one grouped card with directional detail rows
```

### Ownership Boundaries

The backend owns:

- normalized source records;
- conservative direction parsing;
- rapid-transit topology;
- station-bound link walking;
- directional impact aggregation;
- grouped rider-facing Reduced Speed Zone DTOs;
- stable topology and impact API contracts.

The SVG map asset owns:

- station-dot placement;
- authored station-dot anchor IDs, including separate interchange anchors such as `station-spadina-1` and `station-spadina-2`;
- authored nonlinear guide geometry in `segment-guides-layer`;
- the visual map coordinate system.

The frontend owns:

- resolving display paths from SVG station-dot anchors, station-coordinate fallbacks, or SVG guide elements;
- rendering forward, reverse, and bidirectional patterns;
- selection coordination between overlays and grouped cards;
- reduced-motion presentation.

The backend must not duplicate authored curve path data from the SVG asset into Java code or database migrations. Topology records may reference a stable optional SVG guide identifier such as `seg-line-1-st-andrew-union`.

## Direction Normalization

### Values

Use a normalized cardinal-direction enum for source records:

```text
northbound
southbound
eastbound
westbound
bidirectional
unknown
```

Use a separate link-relative travel-direction enum in the map projection:

```text
forward
reverse
bidirectional
```

Cardinal direction describes TTC wording. Link-relative direction describes animation along a stable physical-link orientation.

### Parsing Rules

Direction parsing is conservative. Scan normalized source fields in this order:

```text
structured direction field
title
header text
description
```

Parse explicit wording only:

```text
northbound
southbound
eastbound
westbound
both directions
in both directions
```

If multiple opposite cardinal directions appear, normalize to `bidirectional`. If no explicit direction appears, persist `unknown`.

Do not infer a cardinal direction solely from station order. Station order may help convert an already known cardinal direction into link-relative movement, but it must not invent a rider-facing claim that TTC did not publish.

For map rendering, `unknown` intentionally falls back to `bidirectional`.

## Rapid-Transit Topology

### Adjacent Physical Links

Replace the coarse display-corridor assumption with adjacent physical station-to-station links for every station shown on mapped Lines 1, 2, 4, 5, and 6.

Each link has:

```text
id
lineId
stationAId
stationBId
sortOrder
optionalGuidePathId
guidePathReversed
optionalStationAAnchorId
optionalStationBAnchorId
```

`stationAId -> stationBId` defines a stable link orientation. It does not claim service direction by itself.

Ordinary links default to SVG anchors named `station-{stationId}`. Links that meet a station with more than one authored map dot may override either anchor ID. For example, Line 1 uses `station-spadina-1` while Line 2 uses `station-spadina-2`.

The alert segment matcher walks connected adjacent links between normalized alert bounds on the same line. It returns no projection if either bound is unresolved or no connected route exists.

### Branching Lines

Topology must model branches explicitly rather than relying on one global list order. Line 1 needs connected links for both Yonge-University branches and the Union loop. Matcher tests must prove route walking through branch and curve sections.

The implementation plan should inspect existing station and SVG labels before finalizing the additive topology seed. The seed must remain aligned with the stations already represented in the edited SVG asset.

### SVG Geometry Resolution

Ordinary adjacent links do not require authored SVG paths. After loading the SVG, the frontend measures the matching station-dot anchors and generates:

```text
M stationAAnchor.x stationAAnchor.y L stationBAnchor.x stationBAnchor.y
```

Nonlinear links reference hidden authored paths by `optionalGuidePathId`. `guidePathReversed` records whether the authored guide's `d` orientation runs opposite to `stationAId -> stationBId`. After loading the edited SVG asset, the frontend locates the hidden group whose `inkscape:label` is `segment-guides-layer`, extracts the matching guide element's `d` attribute, uses that geometry for overlays, and flips forward/reverse animation when required.

If a station-dot anchor is missing, fall back to the database station coordinate included in the map response. If a referenced guide is missing or unparseable, render the straight station-to-station fallback and report the gap through a test failure or development diagnostic so the asset can be corrected without suppressing the overlay.

## Backend Dashboard Projection

### Source Records And Link Impacts

Persist TTC source records independently. For each active reduced-speed record:

1. Parse or preserve its normalized cardinal direction.
2. Match its station bounds onto adjacent physical links.
3. Convert the cardinal direction to link-relative `forward`, `reverse`, or `bidirectional`.
4. Add that directional impact to every affected link.

Combine active reduced-speed impacts on the same physical link:

```text
forward only          -> forward
reverse only          -> reverse
forward + reverse     -> bidirectional
unknown               -> bidirectional
bidirectional         -> bidirectional
```

Suspension continues to outrank reduced-speed styling when both affect one link.

### Map API

The `/api/map` response should expose topology plus aggregated impact metadata. A representative ordinary link:

```json
{
  "id": "line-1-eglinton-davisville",
  "lineId": "line-1",
  "stationAId": "eglinton",
  "stationBId": "davisville",
  "stationAAnchorId": "station-eglinton",
  "stationBAnchorId": "station-davisville",
  "guidePathId": null,
  "guidePathReversed": false,
  "overlay": "delay",
  "travelDirection": "forward",
  "sourceAlertIds": ["ttc-route-synthetic-rsz-line-1"],
  "reducedSpeedZoneIds": ["reduced-speed-zone-ttc-route-synthetic-rsz-line-1"]
}
```

SVG station-dot anchors provide ordinary line geometry. Station coordinates already exist in the map response and provide a fallback when an authored anchor is unavailable.

`sourceAlertIds` replaces the single-source-alert assumption because a bidirectional link may result from more than one TTC record. `reducedSpeedZoneIds` provides the grouped rider-facing selection target. Existing suspension selection remains supported separately while suspension styling outranks reduced-speed styling on the rendered link.

### Grouped Reduced Speed Zone Cards

`GET /api/alerts?type=slowdown` remains available for compatibility during implementation, but its rider-facing payload should represent grouped Reduced Speed Zones rather than raw source records.

A grouped zone contains:

```text
id
lineId
lineNumber
title
location
displayDirection
description
updatedAgo
affectedSegmentIds
sourceAlertIds
directionalDetails
source
```

For opposite-direction records on the same physical links:

```text
Wilson <-> Yorkdale
Both directions

Northbound: Yorkdale -> Wilson
Southbound: Wilson -> Yorkdale
```

Group active reduced-speed source records when they are on the same line and their matched physical-link sets overlap. Apply this rule transitively so a connected set of overlapping source records produces one rider-facing zone card. The grouped card's affected links are the union of its source records' matched links.

If two records only partially overlap, aggregate only the shared map links as bidirectional. Non-overlapping links retain their single-direction animation. The grouped card preserves enough directional detail for the rider to understand the source records without duplicating near-identical cards.

## Frontend Rendering

### Chevron Variants

Reduced Speed Zone overlays use orange glow and three chevron variants:

```text
forward        -> one animated chevron lane following path orientation
reverse        -> one animated chevron lane moving against path orientation
bidirectional  -> two lanes moving in opposite directions
```

The current two-lane pattern becomes the bidirectional variant. Forward and reverse variants render one lane only.

Suspensions retain the red-and-white candy-cane overlay. Planned previews remain blue.

### Selection

Clicking or tapping any link in a grouped Reduced Speed Zone selects the grouped card. Selecting a grouped card highlights every affected link, including partially overlapping links with different directional patterns.

The frontend lookup must support multiple `sourceAlertIds` and `reducedSpeedZoneIds` per network link rather than assuming exactly one raw alert ID.

### Reduced Motion

When reduced motion is enabled through the system preference or the existing dashboard toggle:

- stop orange glow pulsing;
- stop chevron translation;
- stop suspension animation;
- retain static directional or bidirectional patterns;
- keep overlay colors and hit targets unchanged.

## Error Handling

Use conservative failure behavior:

```text
unresolved station name
  -> retain normalized alert for diagnostics
  -> do not draw a guessed overlay

unmatched map topology
  -> keep Reduced Speed Zone card with source wording
  -> omit map preview
  -> record unmatched projection metadata

missing or unparseable direction
  -> render bidirectional overlay

missing nonlinear guide
  -> render straight station-to-station fallback
  -> expose a development diagnostic and test gap
```

One malformed record or SVG guide must not clear unrelated overlays.

## Testing

### Backend

Add focused tests for:

```text
text-derived southbound parsing
structured direction precedence
unknown-direction fallback
Eglinton -> Davisville projection
multi-link path walking
branch and curved-link path walking
opposite-direction aggregation
partial-overlap aggregation
unmatched stations
all mapped rapid-transit line topologies
suspension overlay precedence
grouped Reduced Speed Zone DTOs
```

### Frontend

Add focused tests for:

```text
Reduced Speed Zones naming
forward, reverse, and bidirectional chevron variants
grouped-card selection
multiple source alert IDs per link
reduced-motion behavior
ordinary straight-link generation
hidden nonlinear guide extraction
missing-guide straight fallback
existing suspension candy-cane effect
```

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

## Follow-Up: TTC Reduced Speed Zones Webpage

Design webpage ingestion separately after directional Live Alerts overlays are working.

The public TTC page currently exposes richer factual fields:

```text
direction and location
defect length
distance between stations
track under reduced speed percentage
reduced speed
normal speed
reason
target removal
page last-updated timestamp
```

A later importer should poll lightly, parse fixture-backed captured HTML, preserve the last successful snapshot on markup failure, and remain isolated from Live Alerts polling. Before exposing republished webpage fields in a public deployment, confirm TTC permission and attribution requirements.

## Success Criteria

- The Eglinton-to-Davisville Live Alerts fixture produces a southbound-only animated overlay.
- Opposite-direction records on one physical link produce one bidirectional map effect.
- Opposite-direction records appear as one grouped Reduced Speed Zone card with directional detail.
- Directionless records render bidirectionally without inventing a cardinal claim.
- Ordinary links render from SVG station-dot anchors with station-coordinate fallback.
- Hidden SVG guide paths carry nonlinear overlays.
- Suspension candy-cane and planned-preview effects continue to work.
- Reduced-motion mode preserves clear static overlays.
- Dashboard copy uses `Reduced Speed Zones`.
- The documented backend and frontend verification commands pass.
