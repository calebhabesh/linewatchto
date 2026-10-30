# U — One overlay layer for both System Maps

Owner decision, 2026-10-30: TTC and GO/UP draw their live overlays (line
alerts, station alerts, hover and selection, commute preview) with one shared
implementation. This supersedes the "no wholesale React/imperative rendering
conversion" note in [M3](04-maps.md).

- **Rendering:** shared React components. TTC renders them in its SVG planes.
  GO/UP renders them through React portals into the layers that
  `prepareRegionalMapMarkup` injects into its authored SVG. The hand-built DOM
  in `app/regional-map-overlays.ts` (`RegionalOverlaySession`) is removed
  piece by piece.
- **Design:** TTC's overlay design is canonical, multiplied by each map's
  overlay unit (`MapOverlayMetrics.unit`: TTC 1, GO/UP its alert rail width over
  TTC's, 196 / 96). Glyph shapes, spacing, start positions, rail clipping and
  two-lane speed zones follow TTC; GO/UP glyph density and size shift
  accordingly. Review GO/UP visual baselines when they change.
- **Kept differences are data, not drawing.** TTC shows an active closure in
  suspension red and a planned closure as a separate preview; GO/UP shows its
  planned-closure impacts as previews. Each network's adapter picks the
  overlay's visual state; the shared layer draws whatever it is given.
- Read [map renderer parity](../map-renderer-parity.md) first. Its rules stay
  in force throughout; as each phase lands, a rule enforced by shared code is
  rewritten as a property of that code instead of two implementations.

## Phases

Each phase is shippable on its own and keeps both maps working.

1. **Line alerts.** `components/map-overlays/` holds the overlay metrics,
   glyph lanes (from `TtcGlyphLanes.tsx`, scaled by the unit), one line-alert
   tube (TTC's `OverlaySegment`), its per-line grouping and casing, the
   selected-alert emphasis, `<use>` hover copies, and the hover outline. GO/UP
   builds the same model items from its authored corridor paths
   (`regionalLineAlertOverlays`) and portals the shared layer into its segment,
   selected-segment and hover layers. Overlay elements share one set of classes
   and `data-map-*` attributes on both maps. The session stops building line
   alerts.
2. **Station alerts.** Rings, beacons, cores, direction glyphs, hover priority
   rings and selection flashes from one component. GO/UP's pill hubs (Union)
   remain an anchor shape of the shared component.
3. **Hover, selection and previews.** One controller for hover attributes,
   chooser/badge group outlines and the selection intro, used by both maps.
4. **Commute preview and planned-station markers.**
5. **Removal and consolidation.** Delete `RegionalOverlaySession` and the
   GO/UP-only overlay CSS; derive badge and connector obstacle widths from the
   shared metrics; rewrite the parity doc around the shared layer.

Deferred, not part of U: measure both maps on a low-end Android phone (see
[map renderer parity](../map-renderer-parity.md), Known gaps).

## Checks per phase

`npm --prefix frontend run test:fast`, `typecheck`, `lint`; the regional and TTC
overlay cases in `tests/smoke/dashboard.spec.ts`, `regional-station-alerts`,
`overlapping-count-badges`, and `test:map-interactions` on desktop and mobile;
the visual suite for both networks, reviewing GO/UP differences rather than
accepting them blindly. TTC output must not change in phases 1–4 except where
noted.

## Progress

- Phase 1 (line alerts): done 2026-10-30. Shared module `components/map-overlays/`
  (`overlay-plane.ts`, `line-alert-model.ts`, `GlyphLanes.tsx`,
  `LineAlertOverlays.tsx`, `overlay-hover.ts`, `preview-outline.ts`); GO/UP
  adapter `app/regional-line-alerts.ts`; GO/UP line alerts render through
  portals, with a new injected `regional-dynamic-target-layer` for their
  targets. Changes riders may notice: GO/UP glyphs follow TTC's design and
  spacing; a GO/UP alert covering several segments has one keyboard stop and
  accessible name (TTC's `kind: first through last`) instead of one per
  segment; TTC hover copies no longer fade (rule 5).
- Phase 2 (station alerts): done 2026-10-30. `map-overlays/StationAlertOverlays.tsx`
  (`MapStationAlertRings`, `MapStationDirectionGlyphs`, `MapStationAlertForeground`)
  and `station-alert-model.ts`; GO/UP adapter `app/regional-station-alerts.ts`.
  GO/UP renders them directly in its React-owned top plane (no portal needed);
  `RegionalOverlaySession` no longer builds rings, beacons, cores (fills) or
  arrows, and the injected station-ring and effects layers are gone. Overlap
  badges and connectors read station-alert extents from the model
  (`regionalStationAlertReaches`), not the DOM. Changes riders may notice on
  GO/UP: TTC's gold or coloured idle ring and shaded beacon now show (the
  session built them but never attached them), with a core inside the dot
  instead of the whole dot filled; TTC's colours (suspension core #ff3b30,
  delay #f59e0b, planned blue); the ring is the pointer target, above station
  targets, instead of a wide invisible band under them; selection is TTC's
  flash and breathe, and hover lights TTC's priority ring instead of the
  station's hover indicator; one arrow per dot combines one-way alerts.
  Union keeps its filled pill.
- Phase 3 (hover, selection and previews): done 2026-10-30.
  `map-overlays/map-hover-controller.ts` (`installMapHoverController`) owns
  alert hover on both maps: pointer hover found by position (station ring,
  else line alert, kept while crossing a station on top of it, which TTC now
  does too), keyboard focus, the chooser row's raise, badge and chooser group
  previews and their outline, and restoring hover after overlays remount. The
  shared targets no longer report hover themselves. `map-overlays/selection-intro.ts`
  (`mapSelectionIntroKey`, `useMapSelectionIntro`) times the selection intro
  on both maps; a commute preview now also gets an intro key on TTC.
  `RegionalOverlaySession` keeps station-label hover, planned-marker
  selection, the commute preview and badge placement. Changes riders may
  notice: on TTC, an alert stays hovered under a station dot or label target;
  on GO/UP, pressing or scrolling the map ends a pointer hover, as on TTC.
- Phase 4 (commute preview and planned-station markers): done 2026-10-30.
  `map-overlays/CommutePreviewOverlays.tsx` (`MapCommutePreviewRoute`,
  `MapCommuteEndpointFlashes`) and `commute-preview-model.ts`; GO/UP adapter
  `app/regional-commute-preview.ts`, portalled into the injected commute
  layer, with its flashes in the top plane. GO/UP's station-only planned
  closures are station alerts chosen by TTC's `plannedAdvisoryStationImpacts`
  rule; the injected planned-station layer, `regional-planned-station-marker`
  and the GO/UP-only commute CSS are gone. Commute CSS sizes scale by the
  overlay unit. Union's endpoints take its pill shape, and a pill's green
  flash swells its outline (`map-commute-pill-flash`) rather than scaling.
  Changes riders may notice on GO/UP: an upcoming station-only planned closure
  shows a blue station ring at rest, as on TTC (before, nothing showed until
  it was selected; a current one still shows only while selected), and alerts
  that meet it at that station share one station badge (at Pickering in the
  smoke data, the delay, the corridor closure and the station closure); the
  commute route is TTC's width and one path, with TTC's white endpoint dots
  and green flashes. On TTC, endpoint flashes moved out of each station's
  target group into their own group in the same plane.
- Phase 5 (removal and consolidation): done 2026-10-30. `RegionalOverlaySession`
  is deleted. Its duties moved: badge placement to `regionalOverlapBadgeLayout`
  (`app/regional-map-overlays.ts`, called from `InteractiveRegionalMap`),
  station selection and station-label hover to `app/regional-station-interaction.ts`,
  and pulse sync to `map-overlays/pulse-sync.ts` (`useMapPulseSync`), which
  TTC uses too. Badge and connector clearances come from
  `map-overlays/overlay-obstacles.ts` on both maps (hover outline, station
  alert reach and ring), replacing the per-map constants. A press or wheel
  now ends the pointer hover, station hover and label on both maps and keeps
  chooser and badge group previews (TTC used to clear those too). The last
  GO/UP-only overlay CSS, the commute rail-pulse keyframes, moved to
  `commute-preview.css`. Fixes found while checking GO/UP against live data:
  a planned-closure tube took the pointer (its `pointerEvents` attribute lost
  to `.asset-alert-path { pointer-events: stroke }`), so on GO/UP's
  interactive SVG its `<use>` hover copy, drawn above the targets, swallowed
  presses: nothing was selected and focus landed on the hover layer, which
  drew the browser's focus box around the alert. Tubes now never take the
  pointer. GO/UP also lacked TTC's native non-passive wheel listener, so a
  trackpad pinch zoomed the page as well as the map; both maps now share
  `usePreventMapWheelDefault`, and the passive React handlers no longer call
  `preventDefault` (which logged console errors on both maps). The GO/UP
  desktop-map baseline was updated: Bloor's ring and beacon, Pickering's blue
  planned ring and shared station badge, and the legend, whose old baseline
  was captured mid-load (the settled legend is identical at 9e03b189, the
  baseline's own commit); the visual spec now waits for `data-map-ready`.
  New browser coverage: a real press on a GO/UP line alert selects it, and a
  GO/UP commute preview draws the shared route, endpoint dots and flashes.
  Zoom flicker on GO/UP: the shared glyph lanes brought TTC's
  corridor-length clip masks to GO/UP, where a whole-line delay's mask spans
  a corridor in its large SVG units; re-rastering it at every zoom step logged
  about 160 `tile memory limits exceeded` warnings per burst on live data and
  flickered the page. `.map-glyph-lane-clip` now drops its mask while the
  scale changes, on both maps (0 warnings on both; the zoom-memory limit is
  now 100, was 400). Not changed:
  the alert chooser still keeps off alerts by per-map distances (TTC 54,
  GO/UP rail plus 28); they could come from `overlay-obstacles.ts` too.
