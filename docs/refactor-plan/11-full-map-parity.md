# G — Full System Map parity

Owner decision, 2026-10-31: full parity between the TTC and GO/UP System
Maps. [Plan 10](10-one-map-engine.md) made the engine one component and maps
data, so drift can now live in only two places: a map's manifest and its
network's content adapter. This plan closes what is left: the adapters
re-implement the same overlay rules differently, GO/UP is slower to hover and
tap, two GO/UP mobile cases fail, and a few structural asymmetries remain.

Read first: plan 10's Progress (decisions and findings),
[map renderer parity](../map-renderer-parity.md), the
[map asset contract](../map-asset-contract.md), and the alerts and maps section
of [domain invariants](../domain-invariants.md).

- **Done means:** the same scenario (same alert kinds over the same shape of
  line and stations) draws the same overlays on both maps: the same visual
  state, colours, corridor shape, badge grouping, station-alert sizing relative
  to the dot, labels and commute preview. The only differences are network
  facts (below). GO/UP's interaction cost is within a stated margin of TTC's,
  and the parity suite plus the browser list pass on both maps with no
  per-map known failures.
- **Network facts that stay per network** (adapter inputs, not rules): which
  alerts exist and how they are classified, GO/UP trip changes and arrivals,
  source and freshness labels, line names and colours, station lists. These
  stay honest per root `AGENTS.md`.
- **Build only what parity needs.** No plugin system; shared rules are plain
  functions over `PreparedMapGeometry` and dashboard data.

## Where it diverges (audit, 2026-10-31)

Content adapters: `app/ttc-map-content.ts` (848 lines, one module) and
`app/regional-map-content.ts` over `regional-line-alerts.ts`,
`regional-station-alerts.ts`, `regional-map-overlays.ts`,
`regional-commute-preview.ts`, `regional-map-geometry.ts`.

1. **Visual state of a current planned closure.** TTC draws it in suspension
   red (`visualStateForImpactKind`, `planned-closure` → `suspension`); GO/UP in
   planned-preview blue (`regionalLineAlertVisualState`). Previews are blue on
   both.
2. **Impact priority (paint order).** Two tables: `getImpactPriority`
   (`map-alert-selector.ts`: suspension 4, delay 3, reduced speed 2, planned 1)
   and `regionalImpactPriority` (suspension 3, delay 2, reduced speed 1,
   planned 0). Same order today, two sources.
3. **Corridor composition.** TTC groups an impact's segments and composes one
   ordered path (`ttcCorridors`, `composeNetworkSegmentPath`, travel direction
   from the order); GO/UP joins adjacent segments per line into runs of
   subpaths (`regionalOverlayRuns`, `continuousRegionalOverlayRunPath`).
   Directional glyphs, joins at branches and hover outlines can differ.
4. **Overlap badge grouping.** TTC includes planned-preview impacts in a
   segment's badge (`overlapBadgeImpactsForSegment`); GO/UP groups
   `segment.impacts` only (`regionalOverlapBadgeGroups`). Badge artwork
   obstacles are built differently (`ttcBadgeArtwork` with base-route
   corridors vs `regionalBadgePlacement`).
5. **Station alert sizing.** TTC uses a hard-coded large-station list and
   fixed radii (`LARGE_TERMINAL_IDS`, `isStationVisuallyLarge`, ring 38/56,
   core 26/48, dot outline 36/66); GO/UP takes ratios of each dot's authored
   radius (`regionalStationAlertRingRadius`, outline ratio 1.15). Plan 10
   phase 1 already reads "large" from the artwork for station targets
   (`app/map-station-artwork.ts`); station alerts did not follow.
6. **Labels.** TTC line alerts are `"<kind>: <segment label>"`; GO/UP's are
   `"<first> through <last>"` (`segmentsLabel`). Accessible names and chooser
   rows therefore read differently for the same alert.
7. **Commute preview, train markers.** Separate builders
   (`ttcCommutePreview` vs `regionalCommutePreview`); train marker lane offset
   20 vs 44 and label formats differ (`TTC_TRAIN_MARKER_PLACEMENT`,
   `regionalTrainMarkerPlacement`, scale 1.8). Some of this is overlay-unit
   scaling (GO/UP's unit is 196/96), some is not.
8. **Performance.** `test:map-budgets` (phase 6 of plan 10): GO/UP hover sweep
   35–54 frames over 20 ms (p95 up to 24 ms) against TTC 0; phone station tap
   INP GO/UP 504–528 ms against TTC 192–200 ms, mostly the GO/UP station
   details panel render. The hover sweep crosses 48 GO/UP alerts and 13 TTC
   ones, so normalise before comparing (per alert, or the same alert count).
9. **Failing GO/UP mobile cases.** `regional-station-alerts.spec.ts:6`
   (after tapping a line row, no `.alert-card.is-active` appears on mobile)
   and `regional-planned-closure-station-rings.spec.ts:6`. Both have failed
   since before plan 10; cause not yet diagnosed.
10. **Structural asymmetries.** Only TTC places the shell's station list
    (`usesStationList`; TTC's smoke fixtures need stations its artwork lacks);
    GO/UP has its own SVG preparation (name linking and glyph copies, because
    its names sit in a transformed layer) and outline cutouts (Union's pill);
    the engine imports `removeDescendantIds` from `regional-map-asset.ts`.
    Decide each: unify, or record why it is artwork data.

Out of scope (owner may override): raster tooling stays per map and the
per-network map switcher stays out until a real third map exists (plan 10,
asset contract step 7).

## Phases

Each phase ships alone and keeps both maps working; `map-parity` passes after
each. Visible behaviour changes (items 1, 3, 4, 5, 6) need the owner's pick
where the maps disagree; defaults are given, and a phase may proceed on its
default and record it.

1. **Content parity suite.** One unit suite (`tests/map-content-parity.test.mjs`)
   that feeds the same semantic scenarios through both adapters on small
   fixtures (reuse plan 10's drop-in fixture geometry for TTC's adapter, and
   a matching GO/UP-shaped fixture) and compares normalised outputs: visual
   state per kind, paint order, corridor path topology, badge groups and
   members, station-alert radii as a ratio of the dot, label pattern, commute
   endpoints. Start with every known divergence as an expected failure
   (`todo`), so each later phase turns cases green. Record the full matrix in
   this plan.
2. **Shared overlay rules.** Move each rule to one shared module
   (`app/map-content-rules.ts` or by concern) and make both adapters call it:
   impact visual state and priority (one table), labels, badge grouping
   (default: include planned previews, TTC's rule), station-alert sizing
   from the dot's prepared radius (default: GO/UP's ratio rule, retiring
   `LARGE_TERMINAL_IDS`; check TTC's large terminals keep their look), and
   the current-planned-closure colour (owner pick; default: red as current
   service, per domain invariants, unless they say otherwise). Update
   `tests/ttc-map-content.test.mjs` and `tests/regional-map-content.test.mjs`
   where outputs change on purpose.
3. **One corridor and preview model.** One corridor composition for both
   adapters (ordered per impact with travel direction, branching handled as
   GO/UP needs), one commute-preview builder, and train-marker placement as
   one function with per-map data (lane offset in overlay units, label
   format from the network). Badge artwork obstacles from one builder over
   `geometry.artwork` plus base routes. After this, the adapters hold only
   network facts. Run `test:visual` and review every difference.
4. **GO/UP performance.** Profile on the Playwright production build
   (CDP trace, not `:3000` dev): the hover sweep (per-alert cost; what
   re-renders or repaints per hovered alert on GO/UP and not TTC) and the
   phone tap INP (the GO/UP station details panel: arrivals, trip changes).
   Add a parity budget to `test:map-budgets`: GO/UP within an agreed margin
   of TTC for the same alert count, not only under the absolute budget.
5. **Green on both maps.** Diagnose and fix the two GO/UP mobile cases
   (map-side or panel-side; if the cause is the shell, fix it there). Then
   settle item 10: decide `usesStationList` for both maps (default: both
   place their data stations, and TTC's smoke stub gains the authored
   stations it needs, as `withAuthoredTtcStations` does in `map-parity`),
   move shared helpers out of network-named modules, and record any artwork
   preparation left per map as manifest data in the asset contract.
6. **Coverage and close.** Add the content parity suite to `test:fast` for
   good (no `todo` left), add `drop-in-map.spec.ts` to CI (the CI build sets
   `LINEWATCH_TEST_HARNESS=true`; confirm the production deploy builds
   separately and without it), extend `map-parity` with any case the
   earlier phases needed, update the parity doc so each rule names one
   shared function, and mark the plan complete.

## Constraints

- Keep plan 09's and 10's performance decisions and budgets: never measure
  the live SVG, never inject into an authored SVG, no `filter` on repeated
  artwork, memoized alert tubes and station targets, the hidden map frozen,
  camera commits through the store.
- Label data honestly: adapters keep source and freshness labels exactly;
  live claims follow root `AGENTS.md`.
- Owner preferences on record: full-width map framing; no alert glows on
  hover or selection; hover outline only under the cursor or keyboard focus;
  service colours (red suspension/closure, orange delay, chevrons for reduced
  speed, blue planned previews).
- No dev servers: the user runs `:3000` and `:8080`.

## Checks per phase

`npm --prefix frontend run test:fast`, `typecheck`, `lint` (15 pre-existing
warnings). Browser suites on `--project=desktop-chrome
--project=mobile-chromium`, after `map-parity` first: `drop-in-map`,
`tests/smoke/dashboard.spec.ts` (by path, so offline-dashboard is not pulled
in), `regional-station-alerts`, `regional-planned-closure-station-rings`,
`overlapping-count-badges`, `regional-alert-chooser`,
`selection-attention-refresh`, `map-mode-regressions`, `network-fade`,
`impact-camera-focus`, `map-chooser-mobile-keepouts`,
`map-viewport-persistence`, `mobile-map-fit`, `mobile-default-frame`,
`desktop-profiles-and-collapse`, `map-pan-motion`, `browser-compat`,
`regional-map-cold-launch`, `mobile-station-tap-accuracy`. Phases 2 and 3 also
run `test:visual` (review differences before updating baselines) and
`test:map-zoom-memory`; phases 3 and 4 run `test:map-budgets` (compare
full-spec runs; phone numbers are noisy). Build once and reuse it
([testing](../testing.md) build reuse, with `LINEWATCH_TEST_HARNESS=true`).

## Starting state (handoff, 2026-10-31)

- Plan 10 is complete; phase 6 (drop-in proof) is in the working tree on
  `main` on top of `3a9574a7` (commit it first if it is not yet committed).
- Budgets at the start: phone tap INP TTC 192 ms, GO/UP 504 ms; desktop wheel
  and drag p95 6.1 ms; GO/UP hover sweep 54 frames over 20 ms (48 alerts),
  TTC 0 (13 alerts).
- Known failures at the start: the two GO/UP mobile cases (item 9);
  `dashboard.spec.ts:1871` needs GO/UP service hours (fails overnight);
  offline-dashboard × 4 on desktop when a filter pulls it in;
  `dashboard.spec.ts:1574` and `desktop-profiles-and-collapse:150` are flaky;
  `compact-mobile` fails 18 cases on `main` (not in this plan's list; check in
  phase 5 whether any are map parity).

## Progress

- **Plan 10 phase 6 committed** as `f379a03f` before this plan started.
- **Phase 1 done (2026-10-31): content parity suite.**
  `frontend/tests/map-content-parity.test.mjs` (in `test:fast` by its glob)
  feeds the same dashboard data to `ttcMapContent` and `regionalMapContent`
  over plan 10's drop-in fixture geometry. GO/UP gets a copy whose lines carry
  GO/UP's route ids (`regional-route-a-path`), so its corridor rules run.
  Outputs are normalised to what a rider sees: corridors as corner points
  per subpath, with formatting, collinear midpoints and drawing direction
  dropped; directional alerts by where their chevrons head; sizes as ratios
  of the station's authored dot radius; badges by placement kind, label and
  members. Anchor ids are compared without the `station-` prefix: TTC uses
  station ids and GO/UP artwork ids, and riders never see either.
  - **Decision: one input, both adapters.** Each scenario is one data set
    fed to both adapters, not a separate encoding per backend. Per-network
    facts (what the backend classifies and sends) stay in the backends.
    The adapters must apply the same rules to the same data. Where the two
    backends encode the same thing differently, each encoding is its own
    case.
  - **Finding (item 1, refines the phase 2 default).** A `planned-closure`
    segment impact means opposite things per backend. TTC's backend puts one
    on a segment only for a closure in effect now
    (`AlertDashboardService` closure projections). GO/UP's backend projects a
    current closure to `suspension` (`RegionalAlertProjection`), so its
    segment `planned-closure` impacts are upcoming previews. Each adapter
    reads only its own backend's encoding: TTC draws any segment
    planned-closure impact red and builds previews from `previewSegmentIds`;
    GO/UP draws segment planned-closure impacts blue and ignores
    `previewSegmentIds` on the line. The shared rule in phase 2 should decide
    from the closure's timing (current when `activeNow`, `active-now` or
    linked from a current alert, which `buildActiveClosureImpactCardIds`
    already computes; otherwise a preview), and take previews from either
    encoding. That keeps the default (current is red, upcoming is blue) on
    both maps.
  - **Finding (item 5).** TTC's fixed radii are TTC's artwork, not a rule. On
    the fixture's r 44 dot, TTC's ring (38) and endpoint dot (34) fall inside
    the dot. GO/UP's ratio rule at TTC's large dot (r 59) gives a ring of 70
    against TTC's 56 (the core matches: 48), so phase 2 has to check large
    terminals as planned.
  - **Other findings.** TTC labels a preview with an empty `location`
    "Weekend closure: Weekend closure" (title twice). TTC turns a current
    closure's impact into its current kind (`suspension`, from
    `normalizeActiveClosureMapImpact`), and while it is selected also draws a
    blue preview layer; GO/UP keeps `planned-closure` and draws one layer.
    GO/UP draws a line-wide alert with no listed segments over the authored
    route; TTC draws nothing (TTC's backend lists segments, so this is
    reachable only with GO/UP data). Paint order matches today from two
    tables (item 2, a structural fix for phase 2, not a test).
  - **Matrix** (pass = same today; todo = known divergence, turned into a
    plain case by the named phase):

    | Case | Today | Audit item, phase |
    | --- | --- | --- |
    | Visual state per current kind (suspension, delay, reduced speed) | pass | — |
    | Paint order, most severe last (current; preview under a delay) | pass | 2 (one table) |
    | Corridor shape and segments per current alert | pass | — |
    | Directional alert heads the same way | pass | — |
    | Line alert labels (current) | pass | — |
    | Selected corridor emphasis | pass | — |
    | Current planned closure drawn red | todo: GO/UP blue | 1, phase 2 |
    | Upcoming closure in `plannedClosures` only drawn as a preview | todo: GO/UP draws nothing | 1, phase 2 |
    | Upcoming closure in segment impacts drawn as a preview | todo: TTC red | 1, phase 2 |
    | Selected current planned closure | todo: TTC adds a preview layer | 1, phase 2 |
    | Planned preview label | todo: TTC names the closure, GO/UP the kind | 6, phase 2 |
    | Line-wide alert with no listed segments | todo: TTC draws nothing | 3, phase 3 |
    | Station badge members and labels | pass | — |
    | Segment badge members over two segments | pass | — |
    | Segment badge label over two segments | todo: "A to B through B to C" vs "A to C" | 6, phase 2 |
    | Upcoming preview in its stretch's badge | todo: GO/UP leaves it out | 4, phase 2 |
    | Badge connector station keep-out, relative to the dot | todo: fixed vs ratio | 5, phase 2 |
    | Station alert dots and labels | pass | — |
    | Station alert core and ring, relative to the dot | todo: fixed vs ratio | 5, phase 2 |
    | Station and interchange arrow directions | pass | — |
    | Arrow size, relative to the dot | todo: fixed vs ratio | 5, phase 2 |
    | Commute ends and label | pass | — |
    | Commute route as one path | todo: GO/UP one subpath per segment | 3, phase 3 |
    | Commute endpoint sizes, relative to the dot | todo: fixed vs ratio | 7, phase 3 |
    | Estimated train label | todo: per-network formats | 7, phase 3 |

    The train marker lane offset (20 vs 44 at GO/UP's unit, about 21.6 TTC
    units) is not in the unit suite: TTC's frame measures a detached SVG path
    and needs a DOM. Phase 3 makes placement one pure function and adds the
    case.
  - Checks: the suite runs 27 cases, 13 pass and 14 `todo` (each fails for
    the reason it names). `test:fast` passes, typecheck is clean, and lint
    shows the 15 existing warnings. No browser suites: no application code
    changed (a test file and this plan only), so plan 10 phase 6's browser
    results still hold.
- **Phase 2 done (2026-10-31): shared overlay rules.** One module,
  `frontend/src/app/map-content-rules.ts`, holds the rules both content
  adapters apply; `ttc-map-content.ts`, `regional-line-alerts.ts`,
  `regional-map-overlays.ts` and `regional-station-alerts.ts` call it and keep
  only their corridor composition and network facts.
  - **Closure timing (item 1).** `mapImpactContext` decides from the closure's
    timing, not the impact kind: a closure is current when `activeNow`,
    `active-now`, itself a current planned alert or linked from a current
    alert (`getEligiblePlannedClosures` plus `buildActiveClosureImpactCardIds`).
    Current closures' segment impacts become their current effect
    (`normalizeActiveClosureMapImpact`, now on both maps) and draw red;
    an unnormalized current one still draws red. Every other closure is an
    upcoming preview from `previewSegmentIds` or segment impacts, merged per
    closure (`mapPlannedPreviews`), drawn blue on both maps. A selected
    current closure also previews its planned extent in blue under its red
    effect, and the selection emphasizes that preview (TTC's rule, now
    GO/UP's too). `lineAlertVisualState(kind, preview)` is the one visual
    state table; GO/UP's `regionalLineAlertVisualState` is gone. A GO/UP
    line-wide alert with severity `planned` is a current alert and now draws
    red (it drew blue).
  - **Paint order (item 2).** One table, `getImpactPriority`, applied by
    `lineAlertPaintOrder` in both adapters (the renderer already used it);
    `regionalImpactPriority` and its unit test are gone. GO/UP keeps its
    tie-break (impact id, key) before the stable priority sort.
  - **Labels (item 6).** Current alerts `lineAlertLabel` ("<kind>: <first>
    through <last>", unchanged on both). Previews `plannedPreviewLabel`:
    "<closure title>: <location>", falling back to the segments' label
    (fixes TTC's doubled title; GO/UP's "planned-closure: …" becomes the
    closure's title). Stretch badges `overlapStretchLabel`: GO/UP's "Alder to
    Cedar", falling back to the "through" form when the ends coincide.
  - **Badge grouping (item 4).** `overlapBadgeGroups` counts current service
    plus upcoming previews (either encoding) per segment; station badges get
    the same previews (`overlapPreviewClosures`). GO/UP passed none before.
  - **Station-alert sizing (item 5).** `stationAlertSizes(dotRadius)` from
    each dot's prepared radius: core 26/32, ring 38/32, arrow badge 24/32,
    outline 1.15. `LARGE_TERMINAL_IDS`, `isStationVisuallyLarge` and TTC's
    fixed radii are retired. TTC reads radii from `geometry.stations`
    anchors; a station the artwork does not draw (smoke stubs) gets the
    median dot. Large TTC stations (r 58.84): core 48 (same), arrow badge 44
    (was 40), ring 70 (was 56). The old 56 ring sat inside the dot (0.95 of
    its radius) while regular dots' rings sit outside (1.18); at 70 every
    dot's ring is 1.19 of its radius, so large stations now match regular
    ones. Checked by geometry, not by screenshot: the smoke stub has no
    large-station alert and an injected one is dropped by the stub's own
    station list; the visual baselines show no difference. Owner: say if
    the tighter inside ring was intended for large stations. TTC's outline
    ratio was 1.125 and is now the shared 1.15, so beacons near a dot shrink
    by at most about 1 unit. The commute flash (phase 3) still reads "large"
    from the artwork (1.5 × the median dot, as `map-station-artwork.ts`),
    which picks exactly the stations the retired list and interchange rule
    did.
  - **Tests.** The 10 phase 2 `todo` cases are plain cases; 4 phase 3 todos
    remain (line-wide alert, commute route and endpoint sizes, train label).
    The selected-current-closure case now also pins red plus blue and the
    emphasized preview. `ttc-map-content.test.mjs`: Kipling and Eglinton
    sizes by ratio (70/48), plus an upcoming closure named only by a
    segment impact drawing blue. `regional-map-content.test.mjs` passes the
    closure data. Source checks in `map-layering`, `regional-network` and the
    map source helper (which now reads `map-content-rules.ts`) follow the
    moved code. `dashboard.spec.ts` "regional overlay reconciliation" now
    drops the closure from `plannedClosures` as well as segment impacts: GO/UP's
    payload lists `regional-demo-planned` both ways, and previews now read
    either.
  - Checks: `test:fast` passes (parity 23 pass, 4 todo), typecheck clean,
    lint 15 existing warnings. One build with `LINEWATCH_TEST_HARNESS=true`,
    reused. `map-parity` 38 passed (38 per-project skips). The browser list
    (dashboard by path) passed 358 and failed 3: the two known GO/UP mobile
    cases (item 9) and the reconciliation case above, which passes after its
    fix. `test:visual` 30 passed with no differences, so no baselines changed.
    `test:map-zoom-memory` 2 passed, 0 tile-memory warnings on both maps.
- **Owner edits after phase 2 (2026-10-31).**
  - **Arrows for station alerts only.** Interchange line-disruption arrows
    (commit 80f3189d, `interchangeLineImpacts`) are removed on both maps: a
    line alert through a station, interchange or not, adds no arrow (it has
    its own chevrons). Owner's pick: Cedarvale, Eglinton and Bloor-Yonge
    showed arrows from Line 1 speed zones that read as station alerts.
  - **Arrow badge fills the dot's white.** Prepared geometry now records
    each dot's outline width (`PreparedStationAnchor.outline`,
    `prepare-map-geometry.mjs`; TTC 8 and 15, GO/UP about 15 to 21, Union's
    pill 75; both maps and the drop-in fixture regenerated, otherwise
    byte-identical). `stationAlertSizes(dot)` sizes the badge to
    `radius - outline / 2` and beacons' clearance to `radius + outline / 2`
    (replacing the 24/32 and 1.15 ratios). The badge's red ring is 5 units
    (was 2.5), set inside its edge so it meets the black outline with no
    artwork white between (`STATION_DIRECTION_BADGE_RING_WIDTH`).
  - **Map View station names** show from zoom 10.5 on TTC (was 12) and 9 on
    GO/UP (was 10.5), at 14 to 21 px (was 9.5 to 13.5).
  - **Map View line breadcrumbs.** Each line's authored badge sprite at even
    distances along it (`transit-line-breadcrumbs`), from zoom 9.
    `projectGeographicLineBreadcrumbs` (map-line-badges.ts) joins each
    line's links into paths and places one point set per zoom level (240 px
    apart as a level starts), so spacing stays even at every zoom; the layer
    shows the current level's set and always draws (collisions thinned them
    unevenly). UP's points sit half a spacing after KI's, so the two
    alternate on the shared track, and each point is shifted as its line is
    drawn (`GEOGRAPHIC_ROUTE_OFFSET_SIDES` and `_STOPS`, which the routes'
    `line-offset` now also reads), so a badge sits on its own line.
  - Checks: `test:fast` passes, typecheck clean, lint 15 existing warnings.
    `map-parity`, `drop-in-map`, `dashboard.spec.ts`, `overlapping-count-badges`,
    `mobile-station-tap-accuracy` and `geographic-map-lifecycle` pass on both
    projects (the known GO/UP mobile `regional-station-alerts.spec.ts:6`
    still fails). `test:visual` 30 passed, no differences. Open:
    `map-line-badges.spec.ts` fails on both projects: the System Map badge
    plane stays at opacity 1 at scale 1.7 (expected 0.5), and after
    switching Map View to GO/UP the zoom slider reads 14 (expected 9).
    Neither touches code changed here; not yet compared with a clean
    `main` build.
  - **Resolved (2026-10-31, `bcc9b4c4`):** `map-line-badges.spec.ts` failed
    the same way on the phase 2 commit (`a4e5603f`, built in a worktree with
    its own `npm ci`), so the owner edits did not cause it. The spec was
    stale: System Map line badges stopped fading in `76926ed2` (a unit test
    asserts the fade stays gone), and a Map View network switch keeps the
    camera since `94485466`. The spec now expects full opacity at every
    scale and the kept zoom, and names the TTC map's raster planes (both
    maps mount, so the bare plane locators matched two elements). It passes
    on both projects.
- **Committed:** phase 2 as `a4e5603f`, the owner edits as `60e8c1f0`
  (split by hunk; the phase 2 commit passes `test:fast`, typecheck and lint
  on its own).
- **Phase 3 done (2026-10-31): one corridor and preview model.** The
  adapters now hold network facts only: how a segment is drawn (TTC's guides
  and tracks, GO/UP's route corridors), where stations, dots and Union's pill
  are, and line names. Everything they compose goes through shared builders
  over `map-content-rules.ts`.
  - **Corridors (item 3).** `mapLineAlerts` and `mapCorridors`
    (`app/map-corridors.ts`) replace `ttcCorridors`'s per-impact
    `composeNetworkSegmentPath` and GO/UP's `regionalOverlayRuns`,
    `continuousRegionalOverlayRunPath` and authored-route special case. Each
    alert's segments are grouped per line and joined where they meet at a
    station into one alert (one target and hover outline per stretch). A
    linear stretch is one path; a branching one (GO/UP's Lakeshore West at
    Aldershot) is one subpath per trail, the line running on through the
    branch point and the branch starting its own subpath (GO/UP's main and
    branch, as its authored route drew it). A trail drawn against the alert
    is reversed, so chevrons head the alert's way on every subpath. GO/UP's
    one-subpath-per-segment runs are gone, and TTC no longer draws a chord
    across a gap between an alert's disjoint segments (each stretch is its
    own alert). Selection is
    one rule (the drawn alerts the selection names), so TTC's
    `selected:<id>` copies are gone. Keys are one format,
    `<kind>:<id>:<direction>:<segment ids>`, and the paint-order tie-break
    is GO/UP's (impact id, key).
  - **Line-wide alerts (decision, plan default).** An active alert with no
    listed segments that is not a station's own draws over its line's whole
    route on both maps, through the same builder. GO/UP drew the authored
    route paths; TTC drew nothing. The label is shared
    (`lineWideAlertLabel`: "<kind>: <line> <title>"). On TTC this is
    reachable when the backend matches no segments for a route alert with
    no single station (`AlertDashboardService.affectedSegmentIds` empty).
    Live data had none at the time of checking. Owner: say if a TTC alert the
    matcher could not place should stay off the map instead.
  - **Commute preview (item 7).** `mapCommutePreview` replaces
    `ttcCommutePreview` and `regional-commute-preview.ts` (deleted). The
    route is one path in the commute's order. Each end sits on the dot the
    route uses there (the first or last segment's anchor), else on every dot
    of the station. Sizes come from that dot (`commuteEndpointSizes`: TTC's
    34 and 38 on its 32-unit dot, as ratios). TTC's large-dot check
    (`LARGE_DOT_RATIO`) and its fixed 34, 48 and 33 are retired. At TTC's
    large stations (r 58.84) the endpoint dot is now 63 and the flash 70
    (were 34 and 48); at interchanges the flash is on the route's own
    platform dot rather than 33 on every dot.
  - **Train markers (item 7).** `mapTrainMarkerPlacement`
    (`app/train-marker-placement.ts`) is one pure placement: a map gives its
    unit, marker scale, a segment's drawn points (A to B) and its line
    labels. The marker's from and next stations decide its direction;
    a marker that does not name its segment's ends goes by its travel
    direction. All 55 live TTC markers resolved, and their travel direction
    agreed. The lane is `TRAIN_MARKER_LANE_OFFSET` = 20 overlay units, so
    GO/UP's is 40.8 (was 44). TTC no longer measures a detached SVG path
    (`trainMarkerPathMetrics` is gone). `data-train-marker-travel-direction`
    is relative to A to B on both maps. Titles are one format with the
    network's line name and the next station's name ("Line 1 Northbound
    train near College; schematic estimated position"); TTC's named the
    station id, GO/UP's "LW toward Eastbound". The layer takes the map
    data's stations for the names. GO/UP's marker scale (1.8, against a unit
    of 2.04) stays map data.
  - **Badge artwork (item 4).** `mapBadgeArtwork` (`app/map-badge-artwork.ts`)
    replaces `ttcBadgeArtwork` with `ttc-map-obstacles.ts` (deleted) and
    `regionalBadgeArtwork`. It builds labels, element boxes (TTC's
    large-box tiling, scaled by the unit), artwork strokes and base routes
    from `geometry.lines`, at the map's badge scale and line half-width.
    TTC's base routes came from its resolved segment paths and are now its
    prepared tracks, so its badge artwork no longer depends on dashboard
    data. Connectors keep out of connection labels and line badges on both
    maps (TTC has none of either).
  - **Browser fixes.** The first browser run split Lakeshore West's
    whole-corridor delay into three alerts at Aldershot
    (`dashboard.spec.ts:1195`, `:1576`), which led to the one-alert-per-
    stretch rule above. `dashboard.spec.ts:5090` asserted GO/UP's old
    one-subpath-per-segment commute route and now expects one path.
  - **Tests.** The parity suite runs 28 cases with no `todo`: the 4 phase 3
    divergences are plain cases, plus the train marker case, which compares
    where a marker sits along the line, its lane in overlay units and its
    heading for both directions. New `tests/map-corridors.test.mjs` (shared
    corridors and commute preview) replaces
    `tests/regional-map-overlays.test.mjs`. `ttc-map-content.test.mjs` covers
    the new keys, selection, commute sizes and a TTC line-wide alert.
    `regional-map-content.test.mjs` and `regional-map-geometry.test.mjs` use
    the shared builders. Source checks (`map-layering`, `regional-network`,
    `regional-train-markers`, `regional-commutes`, `drawer-layout`) follow
    the moved code, and the map source helper reads the three new modules.
  - Checks: `test:fast` passes (parity 28 pass, 0 todo), typecheck clean,
    lint 15 existing warnings. One build with `LINEWATCH_TEST_HARNESS=true`,
    rebuilt once after the corridor fix and reused. `map-parity` 38 passed
    (38 per-project skips). The browser list (dashboard by path, plus
    `map-line-badges`) passed 363 and failed only the two known GO/UP mobile
    cases (item 9, phase 5). `test:visual` 30 passed with no differences, so
    no baselines changed. `test:map-zoom-memory` 2 passed, 0 tile-memory
    warnings on both maps. `test:map-budgets` 4 passed: desktop wheel and
    drag p95 6.1 ms on both maps; TTC hover sweep (13 alerts) p95 6.1 ms, 1
    frame over 20 ms; GO/UP hover sweep (44 alerts) p95 18.3 ms, 29 frames
    over 20 ms, 1 long frame (55 ms); phone station tap INP TTC 192 ms, GO/UP
    472 ms (median of 472, 272, 520). About the same as the starting figures;
    phase 4 owns the GO/UP gap.
