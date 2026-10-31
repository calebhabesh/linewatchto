# E — One System Map engine, any authored map

Owner decision, 2026-10-30: each System Map is an Inkscape SVG of a transit
network plus a manifest. Dropping a new map into LineWatchTO gives it the same
interactions as every other map: camera (pan, zoom, pinch, momentum), line
alert overlays, overlap badges and the alert chooser, station alerts, hover,
focus and selection, commute previews, station labels and train markers.
Interaction should feel like Google Maps or the retired MapLibre map mode.
Networks differ in content and capability (GO/UP has trip changes, TTC
doesn't), never in how the map draws or behaves. An interaction difference
between TTC and GO/UP is a bug.

This continues [plan 08](08-unified-map-overlays.md), which shared the overlay
drawing components (`components/map-overlays/`). It supersedes the core
finding of [M5](m5-camera-investigation.md) that GO/UP's camera must stay
separate from `usePanZoom`: the reasons given there (multi-plane stage,
pointer-lifecycle hit resolution) become adapter inputs to one engine.

- **Practical test.** If the two SVGs were swapped and only the content
  changed, parity holds.
- **Shared, with identical behaviour and code:** the camera (pan, zoom,
  pinch, momentum, fit and focus framing, gesture flags); the drawing-plane
  stack and its performance budgets; line alerts, station alerts, overlap
  badges and the chooser; hover, focus, selection and the selection intro;
  commute previews, station-name hover labels and train-marker motion;
  accessibility, reduced motion and mobile performance mode.
- **Per map (data):** the SVG and its prepared geometry, the overlay unit,
  raster images, line colours and badges.
- **Per network (content and capability):** which alerts exist and how they
  are classified, trip changes, arrivals, source and freshness labels, and
  whether train markers exist. These stay plain adapters (the existing
  `app/regional-*.ts` pattern) and capability flags, not a plugin system.
- **The contract is the product.** A third map should be a checklist (the
  asset contract plus its validator), not a code project.
- **Build only what TTC and GO/UP need.** Design for any authored map, but add
  no option, hook or extension point that neither map uses.
- **Smoothness goal:** no dropped frames during gestures, and crisp within a
  short moment after. SVG and raster maps can match Google Maps' input feel
  (easing, momentum, pinch) but not vector tiles at extreme zoom: the raster
  re-renders once a zoom settles. Check on a low-end phone as well as a
  desktop GPU, since riders mostly use phones.
- Read [map renderer parity](../map-renderer-parity.md) first. Its rules stay
  in force; as each phase lands, a rule enforced by shared code is rewritten as
  a property of that code.

## Where parity still breaks

Plan 08 shared the drawing components, but three things are still per map:

1. **Camera: two copies.** TTC uses `hooks/usePanZoom.ts`; GO/UP has its own
   handlers and camera state in `components/InteractiveRegionalMap.tsx`
   (`onWheel`, `onPointerDown/Move/Up`, `animateCameraTo`, `fittedCamera`,
   `reconcileRegionalViewport`, about 600 lines). They have drifted: a wheel
   during a camera flight continues from the rendered camera on TTC but jumps
   to the flight's target on GO/UP; GO/UP resolves taps in `onPointerUp`, TTC
   in `onClick`; GO/UP flights write their target a frame late; an explored
   camera keeps its centre on a GO/UP resize but follows
   `transformForViewportResize` on TTC. Neither map eases zoom toward
   a target scale or carries momentum after a drag: both scale by
   `1 + (-deltaY × 0.001)` per wheel event, smoothed by a 0.1 s CSS transform
   transition, and commit 100 ms after the last event.
2. **Surface.** TTC draws overlays into its own map-sized, `pointer-events:
   none` planes. GO/UP portals the same components into layers that
   `prepareRegionalMapMarkup` (`app/regional-map-asset.ts`) injects at runtime
   into its interactive authored SVG (`svg#svg1475`), or into its top plane.
   Equal code, unequal cost. Two bugs fixed in 70a670e0 came from this:
   corridor-length glyph clip masks flickered on zoom (tile memory), and tubes
   and their `<use>` hover copies swallowed presses.
3. **Geometry.** GO/UP measures its authored SVG at runtime
   (`app/regional-map-geometry.ts`: `getBBox`, `getScreenCTM`, path sampling);
   TTC mostly uses prepared data. (Phase 3: both maps read prepared data;
   TTC also measured its station centres, name boxes and artwork at runtime.)

## Measurements

Visible GPU Chrome, window 2560 × 1429 (viewport 2560 × 1309), dark theme,
live data on `:3000`, mouse-wheel burst of 4 × 6 notches of 100 at 60 ms.
Harness in [Measuring](#measuring).

| 2026-10-30 | Frame p95 | Frames > 20 ms | Long animation frames | Drawing layers at rest | Tile warnings |
| --- | --- | --- | --- | --- | --- |
| TTC | 6–12 ms | 9–21 | 5–8 (max 110 ms) | 61, 71 Mpx | 0–2 |
| GO/UP before | 55 ms | 28 | 21 (max 213 ms) | 80, 201 Mpx | 0 |
| GO/UP after phase 0 fix | 6 ms | 7 | 4 (max 61 ms) | 80, 201 Mpx | 0 |
| GO/UP after phase 2 | 19 ms* | 0–2 | 0–1 (max 55 ms) | 70, 57 Mpx | 0 |
| TTC after phase 2 | 19 ms* | 1–3 | 1 (max 59 ms) | 64, 65 Mpx | 0 |

\* The phase 2 runs (3 per map, same recipe) read about 18.8 ms p95 on both
maps alike, below the two-frame budget; the earlier 6 ms rows came from a
faster display refresh, so compare rows within one session only.

Bisection (injected CSS hiding one suspect per run, GO/UP):

- Hiding the authored SVG's injected overlay layers (`[id^=regional-dynamic]`)
  gave TTC's numbers (p95 6 ms, 4 long frames, 65 Mpx). Making the SVG
  non-interactive (`pointer-events: none`) changed nothing; neither did hiding
  the raster planes or the top plane.
- Within the line-alert layer, `filter` was the frame cost and `mask` the
  layer area. The filter was the two-step `drop-shadow` halo on each
  planned-closure glyph icon (`.planned-closure-map-icon`, a nested `<svg>` per
  glyph); live data has a corridor-length planned closure, so dozens of
  filtered icons re-filtered on every zoom frame. Dropping the filter only
  while zooming left 9 long frames (the toggle re-rasters), so phase 0 removes
  it. Phones never drew it.
- The glyph-lane clip masks (`.map-glyph-lane-clip`) account for 136 of
  GO/UP's 201 Mpx at rest. They do not drop frames (they already lift while
  the scale changes) but hold GPU memory. Phase 2 owns this.
- The earlier note of about 529 Mpx during zoom (25 layers of 5000–7600 px,
  reasons `ActiveFilterAnimation` and `Overlap`, all attributed to
  `svg#svg1475`) matches the filtered icons: Chromium reports a filter under a
  changing transform as a filter animation even when
  `document.getAnimations()` is empty.
- Lead, not yet confirmed: removing the hover boundary's `drop-shadow`
  (`.asset-alert-path-hover-boundary`) on TTC once gave p95 6 ms and 11 frames
  over 20 ms against 12 ms and 21; later TTC runs without the change gave the
  same. Recheck before acting.

**Order chosen: phase 1 before phase 2.** The prompt for this plan expected
GO/UP's surface to be the main GPU cost. Measurement narrowed it to one shared
overlay style, which phase 0 removes; after that GO/UP zooms within TTC's
numbers, so the camera engine no longer waits on the surface. Phase 2 still
matters for memory at rest (masks), for the interactive-SVG class of bugs, and
for any new map, and it follows phase 1.

## Phases

Each phase is shippable on its own and keeps both maps working.

### 0. Map asset contract and budgets

- Generalize [the TTC asset contract](../ttc-map-asset-contract.md) into one
  contract for any network's SVG: required layers and id conventions for
  lines, segments, stations, station labels, connection labels and line
  badges; one coordinate space (the root SVG's, no nested transforms on
  geometry the app reads); the overlay unit derived from the authored rail
  width (`MapOverlayPlane.unit`: TTC 1, GO/UP 196 / 96); the raster planes and
  how to regenerate them; the manifest fields (view box, content bounds,
  default framing, overlay unit, raster planes, line ids and colours).
- A validator script (extending `scripts/prepare-ttc-map-asset.mjs` and
  `scripts/lib/regional-map-normalizer.mjs`) that checks a new SVG against the
  contract before it is dropped in, with `test:scripts` coverage.
- **Budgets** both maps must meet at 2560 × 1309 on a desktop GPU, live-like
  data, per gesture burst (wheel burst above, a 2-second drag with release, a
  hover sweep across every alert):
  - tile memory warnings: 0;
  - frame p95 within 2 display frames;
  - frames over 20 ms: at most 10 per wheel burst;
  - long animation frames (over 50 ms): at most 5 per burst, none over 120 ms;
  - drawing-layer area at rest: at most 1.5 × the viewport's area times the
    plane count TTC uses today, about 100 Mpx at this size (TTC 71; GO/UP 201
    until phase 2);
  - React commit after a gesture: one, under 16 ms (GO/UP's `setCamera`
    commit takes about 50 ms today).
  Phones: measure a low-end Android device once (INP on tap, long tasks
  during a live refresh, layer count during a pinch) and record budgets then.
- Done in this phase so far: the planned-closure icon halo filter is removed
  (see Measurements).

### 1. One camera engine

Replace `usePanZoom`'s gesture code and GO/UP's handlers with one engine. Rule 4
of the parity doc becomes a property of it.

- **1a. Gesture motion** (`components/map-camera/`): one framework-free
  module both maps call from their existing handlers.
  - Wheel input is classified per gesture: a mouse-wheel notch (line or page
    delta mode, or a whole-number pixel delta of 50 or more with no sideways
    part), a trackpad scroll (small or fractional deltas), or a trackpad pinch
    (`ctrlKey`). A gesture keeps its first class until 200 ms of quiet, so a
    fast trackpad flick never turns into notches.
  - All three zoom by `exp(-deltaY × rate)` around the pointer: notches and
    scrolls at `ln(1.1) / 100` per pixel (one 100-pixel notch is × 1.1, as
    today, now symmetric in and out), a pinch at `1 / 100` per pixel, so a
    Chrome trackpad pinch follows the fingers. Misclassification changes only
    the easing, never how far the map zooms.
  - Each notch eases to its target scale, anchored at the map point under the
    pointer, with a 180 ms transform transition that the compositor runs.
    Scrolls and pinches apply directly. (Easing by writing the scale every
    animation frame was tried first: it made Chromium re-raster GO/UP's
    stage at each new scale, 53–65 tile memory warnings per
    `test:map-zoom-memory` burst against 0.)
  - A drag release keeps moving: velocity from the last 160 ms of pointer
    samples, capped, decaying exponentially (time constant 200 ms, launch speed capped at
    1.5 px/ms, so a glide covers at most about 300 px), started
    only if the pointer moved within 100 ms of the release. A press during the
    glide stops it and does not select what is under the pointer.
  - No React state during a gesture or its glide; one commit when it settles
    (100 ms after the last wheel event and once the ease has landed).
  - Gesture flags (`data-map-zoom-active`, `data-map-gesture-active`) span the
    ease and the glide; the chooser follower receives every frame; reduced
    motion turns off easing and momentum.
- **1b. One camera state.** GO/UP adopts `usePanZoom` for camera state, fit
  framing, focus framing, persistence, resize and orientation handling, button
  zoom, and flights. Map-specific framing (GO/UP's Union centre on phones, its
  selection framing from rendered elements) becomes `defaultFrame` and focus
  options. GO/UP's tap resolution in `onPointerUp` moves onto the shared
  click-suppression path, or the engine exposes it for both.
- **1c. Commit cost.** Components that only need the settled camera subscribe
  to it instead of re-rendering the whole map component, bringing the commit
  inside the budget.
- Keep throughout: gesture flags, the chooser follower, focus reveal (rule 9),
  `usePreventMapWheelDefault`, the mobile performance mode and rotated mode.

### 2. One surface

Every map renders through the same plane stack: raster planes, a map-sized
overlay plane, an interaction (target) plane, and a top plane. The authored
SVG becomes non-interactive artwork and a geometry source only, as TTC's is.

- Move GO/UP's injected portal layers (`regional-dynamic-*`) into TTC-style
  React-owned planes; delete the injection from `prepareRegionalMapMarkup`.
- Station targets and selection markers become React elements on both maps,
  retiring `app/regional-station-interaction.ts`'s DOM writes.
- Glyph-lane clipping without corridor-length masks (for example clipping
  per segment, or drawing glyphs only inside the tube so no clip is needed),
  then measure layer area at rest against the budget on both maps.
- Done 2026-10-30 (see Progress); one lead remains: GO/UP's style
  recalculation per camera-flag toggle (about 9 ms against TTC's 2).

### 3. Prepared geometry

Extract station anchors, segment paths, label boxes and badge obstacles from
each SVG at build time (the asset preparation scripts) into data, so placement
never measures the live DOM. GO/UP adopts what TTC already mostly does;
`app/regional-map-geometry.ts`'s runtime measuring and `primeRegionalRouteSamples`
go away. Badge placement (`regionalOverlapBadgeLayout`, TTC's inline layout)
then runs one function over prepared data for both maps, and the chooser's
per-map keep-off distances (TTC 54, GO/UP rail plus 28) come from
`overlay-obstacles.ts`.

- Done 2026-10-30 (see Progress). TTC's chooser already kept clear of the
  shared hover outlines (its 54 only fed badge targets); GO/UP's now does
  too. Selection framing still frames rendered elements on both maps, the
  same way, so it stays with the camera rather than this phase.

### 4. Parity suite

One parametrized interaction and performance suite runs against every map:
press, hover, chooser, badges, selection, commute preview, pan, zoom, pinch,
momentum and reduced motion, plus the phase 0 budgets on a real GPU with a
live-like heavy data set (the zoom-memory spec ran on light fixture data, which
is how the glyph-mask flicker reached the owner). It replaces per-map duplicate
tests where they overlap.

## Checks per phase

`npm --prefix frontend run test:fast`, `typecheck`, `lint` (15 lint warnings are
pre-existing). Browser suites on `--project=desktop-chrome
--project=mobile-chromium`: `dashboard.spec.ts`, `regional-station-alerts`,
`regional-planned-closure-station-rings`, `overlapping-count-badges`,
`regional-alert-chooser`, `selection-attention-refresh`, `map-mode-regressions`
and `network-fade`. Also `test:map-zoom-memory` (limit 100; both maps read 0)
and `test:visual`, reviewing differences rather than accepting them. Use
`LINEWATCH_PLAYWRIGHT_REUSE_BUILD=true` only when `src` is unchanged since the
last build. Phases 1 and 2 also rerun the budget measurements on both maps.

Known failures, not caused by this plan: offline-dashboard × 4 (desktop); two
GO/UP mobile cases; the timed-marker test overnight. The network-fade
hover-timing case and the TTC label-font case are flaky in full runs.

## Measuring

The user runs `:3000` and `:8080`; don't start dev servers. Before Playwright,
stop stray stubs with `pgrep -f "[a]pi-stub.mjs" | xargs -r kill`.

1. Spawn `google-chrome-stable` with `--remote-debugging-port`,
   `--enable-logging=stderr`, `--disable-extensions` and
   `--window-size=2560,1429`, then connect with Playwright `connectOverCDP` and
   keep the window visible (headless runs at 1440 px did not reproduce GPU
   problems).
2. Set localStorage `linewatch-welcome-seen-v1=true`,
   `linewatch-unofficial-notice-ack-v1=true`,
   `linewatch-seen-release-notes-version=1.1.0`,
   `linewatch-default-network-v1=<network>`, `linewatch-map-view-v1=diagram`,
   and the cookie `linewatch-visual-preferences-v1`
   `{"defaultNetwork":<network>,"theme":"dark"}`.
3. Load `http://localhost:3000` (not 127.0.0.1, which does not hydrate) and wait
   for `[data-network-map-layer=<network>][data-map-ready=true]`.
4. Measure `tile memory limits exceeded` stderr lines per phase (idle, hover
   sweep, pan, wheel burst); rAF frame intervals and `long-animation-frame`
   entries during the burst; CDP `LayerTree` drawing-layer count and area.
5. Bisect causes by injecting CSS (`page.addStyleTag`) that hides or strips one
   class or property per run. Live data reproduces problems the stub fixture
   misses.

Phase 0 still owes a checked-in version of this probe (extending
`test:map-zoom-memory`), so the budgets are a command rather than a recipe.

## Progress

- Phase 0 (contract and budgets): started 2026-10-30. Budgets and measurements
  recorded above. Fix: `.planned-closure-map-icon` no longer has a
  `drop-shadow` filter (both maps; phones already drew it without), and the
  unused `--planned-preview-glow` token is gone. GO/UP's wheel-zoom frame p95
  went from 55 ms to 6 ms and long animation frames from 21 to 4, matching
  TTC. Riders may notice the planned-closure glyphs lose a faint 1–3 px cyan
  halo on desktop. Remaining: the generalized contract, its validator, the
  checked-in budget probe, and the phone measurement.
- Phase 1a (gesture motion): done 2026-10-30, pending review.
  `components/map-camera/camera-motion.ts` (`MapCameraMotion`, wheel
  classification, ease and momentum maths) and `useMapCameraMotion.ts`; TTC's
  `usePanZoom` and GO/UP's `onWheel`/pointer handlers both call it, replacing
  their own wheel maths (each notch's 0.1 s transition becomes 180 ms toward
  a symmetric target). Any camera
  command (flight, button zoom, Center, refit) stops a running zoom or glide
  through each map's `clearProgrammaticAnimation`. Fixed drift: a wheel during
  a GO/UP camera flight now continues from the rendered camera, as on TTC.
  Changes riders may notice on both maps: a mouse-wheel notch eases over
  180 ms instead of 100 ms; a trackpad pinch now follows the fingers
  (about 10 × faster than before, when it zoomed at the scroll rate);
  zooming out per notch is now the exact inverse of zooming in (× 1 / 1.1, was
  × 0.9); a drag released while moving glides on and slows. Measured live at
  2560 px (wheel burst): GO/UP 6–7 frames over 20 ms and 4 long animation
  frames (max 59 ms), TTC 7–10 and 5 (max 111 ms), both within budget;
  `test:map-zoom-memory` 0 warnings on both. A per-frame ease measured fewer
  slow frames on GO/UP (2 and 0) but overflowed tile memory (53–65 warnings),
  so notches use the compositor transition. Checked in a visible
  browser on both maps: a notch lands at exactly × 1.1 and the zoom slider
  updates once, a ctrl-wheel pinch of ln 1.5 zooms × 1.5 without page zoom,
  a fling glides about 400–600 px and clears the gesture flag, a press during a
  glide stops it where it is drawn. Tests: `tests/map-camera-motion.test.mjs`
  (classification, ease, commit timing, clamping, momentum, stopping); the
  source-pinned wheel tests in `pan-zoom-behavior` and `regional-network` are
  replaced by one check that both maps route through the engine;
  `tests/smoke/map-camera-motion.spec.ts` checks on both maps that a fling
  glides and ends its gesture, and that a press during a glide stops it and
  selects nothing while the same press at rest selects the alert. A window
  resize also stops a running zoom or glide on both maps, so the resize's
  reframing is not overwritten. Two existing browser cases assumed the old
  motion and now wait for it: the GO/UP resize case reads the camera once the
  zoom has settled, and the overlap-chooser case holds still before releasing
  its placement drag (it released mid-move and glided the chooser off screen).
  The release threshold is 100 ms after the last move with velocity over
  160 ms (MapLibre uses 160 ms): headless Chromium delivered moves about
  70 ms apart, and 50 ms turned flings into stops. Owner tuning the same day:
  glides felt too fast, so the time constant went from 325 ms to 200 ms and
  the launch speed cap from 2.5 to 1.5 px/ms (about 200 px for a 1 px/ms
  release, at most about 300 px).
- Phase 1b (one camera state): done 2026-10-30, pending review. GO/UP runs
  `hooks/usePanZoom.ts`, as TTC does; its own camera (state, transform
  writer, flights, fit, resize, persistence, wheel, drag and pinch handlers,
  about 680 lines) is gone. New `usePanZoom` options: `containerRef`, `mapRef`
  and `flagRootRef` (each map passes its viewport, stage and flag root; flags
  go through `writeMapFlag`), `defaultFrame.desktopScaleMultiplier`,
  `automaticRefitBlocked`, `revealStageOnWrite` (GO/UP gates stage visibility
  itself) and a flight duration on `animateTransformTo`; it also exposes
  `readCamera`, `isCameraInitialized`, `activePointerCount` and
  `clearCameraAdjustment`. GO/UP passes its framing as data
  (`regionalDefaultFrame`: content bounds, insets, phone zoom 0.95 × 1.15
  centred on Union, desktop scale) and keeps only its tap resolution at
  release (`onPointerDown` / `finishPointer`, using the camera's click
  suppression) and its selection framing from rendered elements (phase 3).
  Rules unified, with the map that changed: an untouched camera refits on a
  resize and one the rider moved or a selection owns keeps its zoom and
  centre (TTC used to keep zoom even untouched; in a visible browser a
  startup resize left both maps at a stale zoom, about 0.5 instead of the
  0.31–0.33 fit); keyboard focus reveal flies in 300 ms
  (`FOCUS_REVEAL_DURATION_MS`; TTC used 800 ms); GO/UP's
  `data-regional-map-camera-moving` is replaced by the shared
  `data-map-camera-moving` (CSS, the chooser keep-out observer and specs);
  GO/UP gains TTC's pointer-leave ending of a mouse drag; desktop insets
  refit an untouched GO/UP camera, as on TTC; GO/UP's phone framing now caps
  its zoom by the open height, as TTC's does. Tests: one check that GO/UP
  drives the shared camera with its framing data and has no camera of its
  own; source tests of GO/UP's former camera internals removed or pointed
  at the shared hook.
  Checks: the eight plan suites plus `map-camera-motion`,
  `map-background-camera`, `map-viewport-persistence`, `impact-camera-focus`,
  `mobile-map-fit`, `mobile-default-frame` and `desktop-profiles-and-collapse`
  on desktop and mobile Chromium; `test:map-zoom-memory` (GO/UP 2, TTC 0);
  `test:visual` 30/30. `compact-mobile` fails the same 18 cases on a clean
  `main` worktree (checked 2026-10-30), so it is not a phase 1 regression;
  the mobile `offline-dashboard` "offline shell" case failed once and passed
  on rerun (flaky).
- Phase 1c (commit cost): done 2026-10-30, pending review. The committed
  camera lives in a store (`components/map-camera/camera-store.ts`:
  `createMapCameraStore`, `useCommittedCamera`) instead of `usePanZoom`
  state, so a commit re-renders only its readers: the shared toolbar slider
  (`map-camera/MapZoomSlider.tsx`, now used by both maps; TTC's literal
  minimum 0.2 is the shared `PAN_ZOOM_MIN_RELATIVE_SCALE`) and, only while an
  alert chooser is open, the map that places it. Viewport persistence
  subscribes without rendering. `commitCamera` writes the stage directly at
  rest; the old render-time layout effect remains only for mount and
  orientation changes. Measured (production build, headless 2048 × 1164,
  one wheel notch, CDP trace of main-thread tasks over 700 ms, 5 notches,
  against a clean `main` worktree): TTC about 100 ms of tasks with the
  longest 6–9 ms, before and after; GO/UP about 230 ms with the longest
  19–45 ms, before and after. The "about 50 ms" React commit in the plan's
  brief was measured on the dev server, whose development React is slower;
  in production the commit's render was already small, so 1c removes
  needless whole-map renders but does not change measured frame cost. GO/UP's
  longest task is style recalculation (`UpdateLayoutTree` about 10 ms) when
  the camera flags toggle on the root above its large authored SVG, plus the
  wheel handler: phase 2's surface work. Tests: `tests/map-camera-store.test.mjs`;
  source tests now pin `commitCamera`, the store and the shared slider.
  `map-viewport-persistence` now waits for a drag's glide to settle before
  reading the saved viewport (it read mid-glide; the saved and restored
  camera is the settled one). Checks on the 1c build: same suites as 1b, 381
  passed; failures were the known ones (offline-dashboard × 4 desktop, the
  two GO/UP mobile cases) plus `desktop-profiles-and-collapse:150`, which
  passed alone (flaky); `test:map-zoom-memory` 0 on both maps;
  `test:visual` 30/30; test:fast, typecheck and lint (15 pre-existing
  warnings) clean.
  Phase 1 is complete; next is phase 2 (one surface), or the rest of
  phase 0 (contract, validator, budget probe, phone measurement).
- Phase 2 (one surface): done 2026-10-30, pending review. GO/UP now renders
  through TTC's plane stack: background raster, the authored SVG, a
  React-owned overlay plane (`.regional-overlay-plane`: alert tubes, commute
  route, selection emphasis, hover copies, station hover rings, in the
  stations layer's coordinates via `topPlaneTransform`), foreground and label
  rasters, a top plane (hovered name, train markers, compass) and an
  interaction plane (hover outlines, line alert targets, station targets,
  endpoint flashes, station alert rings, station-name targets, direction
  arrows, selected-station marker and alert foreground, badges), in TTC's
  order. `prepareRegionalMapMarkup` injects nothing any more: no dynamic
  layers, station hit/hover/selection clones, selection-source defs or label
  hit-target clones (it keeps label tagging, glyph cutout sources and
  connection-label classes). The authored SVG is `pointer-events: none` and,
  once the rasters are ready, wholly `visibility: hidden` (938 nodes, a
  geometry source only). Station targets, hover rings, name targets and the
  selected-station marker are React elements (`components/RegionalStationLayers.tsx`)
  from station shapes read from the artwork
  (`regionalStationArtwork` in `app/regional-station-interaction.ts`;
  junctions keep their authored transform) and name boxes measured once the
  font is ready (`regionalStationLabelTargets`); `applyRegionalStationSelection`
  and the portals are gone. Station hover is the shared
  `setMapStationHovered`/`clearMapStationHover`
  (`map-overlays/station-hover.ts`, TTC's former helpers), so a press or wheel
  ends the GO/UP station hover ring as on TTC. Glyph lanes lost their clip
  masks on both maps: every glyph is centred on its path and fits within the
  round-capped tube's half-width (largest, the hourglass, reaches 45.4 of 48
  units), so the mask clipped nothing; `.map-glyph-lane-clip` and the
  `*-mask-path` rules are gone.
  Changes riders may notice on GO/UP: estimated train markers now pass under
  station alert rings and badges, as on TTC (they drew above them); station
  name targets sit above station alert rings, as on TTC; the station hover
  ring no longer fades its opacity (its fill and stroke still ease 70 ms).
  Not changed: GO/UP still lifts a station's name when its dot is hovered
  (TTC only on the name) and its name targets are still keyboard stops (TTC's
  are not); both are parity questions for the owner.
  Measured: visible GPU Chrome, 2560 × 1429, live `:3000`, wheel burst, 3 runs
  per map (table above): GO/UP drawing layers at rest 201 → 57 Mpx (TTC 65),
  0–2 frames over 20 ms, at most 1 long animation frame (max 55 ms), 0 tile
  warnings; all within budget on both maps. Main thread (production build,
  headless 2048 × 1164, CDP trace over 700 ms after each of 5 wheel notches,
  temporary spec since deleted): GO/UP about 160 ms of tasks per notch with
  the longest 15–16 ms (phase 1c: about 230 ms and 19–45 ms; the first notch
  of a run, 32 ms, includes warm-up); TTC about 85 ms, longest 5–7 ms. GO/UP's
  style recalculation is still about 9 ms per notch against TTC's 2. Bisected
  with injected CSS: the hidden authored SVG, the interaction plane, each
  overlay-plane layer, all overlay-plane content (`> g { display: none }`),
  `visibility: hidden` on the plane and a pinned stage `will-change` all
  leave it at 9 ms; only `display: none` on the overlay plane's root removes
  it (0.6–0.9 ms). Cause not found; a lead for phase 3 or 4.
  `test:map-zoom-memory` 0 on both maps.
  Tests: `tests/regional-station-interaction.test.mjs` now covers station
  artwork extraction, junction transforms and hover/selection sizes;
  `map-layering` asserts the tube has no mask; `browser-compat` checks the
  GO/UP plane inventory (authored SVG without overlays or targets,
  non-interactive); source-pinned tests moved to the new structure; the
  `!important` ceiling fell from 479 to 462. Specs updated for the moved DOM:
  the authored-route gap check reads the route from the authored SVG, the
  badge-versus-name check uses name targets (authored text is hidden), the
  Bloor and Union selection cases read the single React marker.
  Checks: test:fast, typecheck, lint (15 pre-existing warnings); the plan's
  browser suites plus `regional-map-cold-launch` and `browser-compat` on
  desktop and mobile Chromium: 350 passed; failures were the known ones
  (offline-dashboard × 4 desktop and the flaky mobile "saved dashboard" case,
  the two GO/UP mobile cases, `desktop-profiles-and-collapse:150`), plus
  `dashboard.spec.ts:1190` (spec fixed above, then passed) and
  `regional-map-cold-launch` on desktop, whose hover target (Bloomington)
  lies under the map toolbar at that window size, so the forced hover lands
  on the toolbar; it is not in the plan's suite list and was not checked on
  a clean tree. `test:visual` 30/30.
  Next: phase 3 (prepared geometry) or the rest of phase 0.
  Follow-up: `regional-map-cold-launch` fails the same way on a clean `main`
  worktree, so it predates phase 2; its desktop hover now targets Danforth,
  clear of the toolbar and legend, and it passes on both projects.
- Phase 3 (prepared geometry): done 2026-10-30, pending review.
  - 3a, geometry files: `scripts/prepare-map-geometry.mjs`
    (`npm --prefix frontend run prepare:map-geometry`; `check:map-geometry`
    compares a fresh run) lays out each SVG in Chromium with the label font
    and writes `src/app/map-geometry/{ttc,regional}.json` (75 and 55 KB, 15
    and 12 KB gzipped), in root coordinates: stations (shapes, transform,
    dots), segment anchors, line and route paths (straight paths keep exact
    vertices), TTC's guides, station-name boxes, and badge artwork. Output
    is deterministic. Types and the shared name-box rule are in
    `app/map-geometry-data.ts`; `tests/map-geometry-data.test.mjs` fails
    when an SVG changes without regenerating.
  - 3b, GO/UP: `app/regional-map-geometry.ts` is pure functions over the
    data (corridors by polyline projection, train-marker frames, badge
    anchors, name boxes); `primeRegionalRouteSamples`, `regionalSvgScope` and
    every `getBBox`, `getScreenCTM` and path-sampling call are gone. Overlays
    are drawn in root coordinates, so `MapOverlayPlane.topPlaneTransform` is
    removed from the shared layer. Station artwork and name targets exist
    as soon as overlays build (no longer after the label font loads); the
    hover label's glyph cutout is still copied from the authored SVG.
  - 3c, TTC: `app/ttc-map-geometry.ts` and `ttcArtworkObstacles` replace
    `readSvgGeometry`, `readSvgStationCenters`, `readSvgStationLabelPolygons`
    and `collectMapPlacementObstacles`; `geometryReady` follows the SVG load.
    Name boxes use the shared rule, which reads neighbours in each label's
    own frame: 5 of 109 TTC hover boxes change their trailing room
    (Rosedale, Bathurst, Stevenson, Norfinch Oakdale, Mount Dennis). TTC's
    lifted label now waits for the font explicitly, as GO/UP's does.
  - 3d, badges: `map-overlays/overlap-badge-layout.ts`
    (`layoutMapOverlapBadges`) places badges and connectors for both maps
    from their badges, artwork, line alerts (corridors sampled at the hover
    outline's half-width) and station alerts, scaled by `unit` and
    `badgeScale`. TTC's `collisionBoxesByImpact` (54) and GO/UP's
    connector and placement copies are gone. GO/UP's chooser keeps clear of
    the badge's `affectedOutlines` (`affectedOutlinesOnScreen`, as TTC's
    did) instead of sampling DOM paths at rail half-width plus 28.
  Tests: `tests/regional-map-geometry.test.mjs` rewritten against the real
  prepared map (every GO/UP segment follows its route, the LW junction,
  train-marker lanes, name boxes, badge anchors); new
  `tests/overlap-badge-layout.test.mjs`; mock-DOM and source-pin tests of the
  removed readers updated or removed. The dashboard font-wait case now checks
  that targets exist before the font and the lifted label waits for it.
  Checks: test:fast, typecheck, lint (15 pre-existing warnings); browser
  suites on desktop and mobile Chromium 349 passed, failures only the known
  offline-dashboard ×4 and the two GO/UP mobile cases, plus the font-wait case
  above (fixed, passes on rerun); `test:map-zoom-memory` 0 on both maps;
  `test:visual` 30/30.
  Main thread (CDP trace of a cold load on the Playwright production build,
  one run each, against a clean `main` worktree): parsing the data costs
  0.1–0.2 ms per map on desktop and up to 1.5 ms at 4× CPU throttling, and
  the module that holds it at most 2 ms over a whole load, so loading it adds
  no long task. Load tasks over 50 ms (desktop / mobile 4×): TTC 1 of up to
  124 ms vs `main` 4 of up to 147 ms, and 6 of up to 305 ms vs 6 of up to
  655 ms; GO/UP 4 of up to 94 ms vs 3 of up to 151 ms, and up to 296 ms vs
  up to 507 ms. On `main`, the longest load tasks were spent reading the SVG
  (`getTotalLength`, `getPointAtLength`). Now `layoutMapOverlapBadges` takes
  most of the longest load task: TTC 59 ms desktop and 137 ms at 4×, GO/UP
  31 ms and 148 ms. That is the next main-thread cost to cut.
  Next: phase 4 (parity suite) or the rest of phase 0.
- Phase 4 (parity suite): started 2026-10-30. `tests/smoke/map-parity.spec.ts`
  runs each case on both maps (desktop and mobile Chromium) against shared
  outcomes (overlay attributes, the chooser dialog, the station details panel,
  the stage transform), finding targets on screen rather than by per-map ids:
  line-alert hover and press, open-map press, station hover, name lift, press,
  keyboard and tap, overlap badges and the chooser by pointer, keyboard and
  tap, a wheel notch about the pointer and its inverse, trackpad pinch, drag,
  momentum and a press during a glide (moved from `map-camera-motion.spec.ts`,
  now removed), reduced motion, and commute previews. 34 cases, all passing.
  Parity bugs it found, fixed: GO/UP station targets were named from their id
  ("union station details", a bug from before plan 09); they now use the
  station's name, as TTC's do. Hovering a station's dot lifted its name on
  GO/UP but not on TTC; owner left the choice open, and both now lift it
  (dot hover, and focus on fine pointers). Test findings, not bugs: Escape on
  a chooser returns focus to its badge, which pans it clear of the controls
  on both maps; a phone tap within a station target's touch-adjustment reach
  selects the station on both maps. The smoke stub's TTC stations are
  fixtures with no drawn names, so the name case adds the authored stations
  through `/api/stations`.
  Not yet in the suite: the phase 0 budgets on a real GPU with live-like
  data (needs phase 0's checked-in probe). Remaining duplication seen while
  writing it: TTC has its own `OverlapChooser` beside the shared
  `MapOverlapChooser`, and both maps carry identical
  `revealFocusedMapTarget` copies.
  Owner-reported regressions, fixed the same day: suspension no-entry glyphs
  were drawn one step past each end of their tube (beyond Pearson on the UP
  closure). `samplePath` added those overrun points for the clip mask phase 2
  removed; it now samples end to end only (`tests/map-geometry.test.mjs`).
  Backend: Metrolinx reposted the Oct. 31-Nov. 1 Kitchener notice tagged to
  Bloor with a body opening "Oct. 31-Nov. 1: Service adjustments" (the title
  less "Kitchener line"), so it stayed a second event and the station copies
  (Georgetown to Stratford, Bloor) matched two leads and did not fold; the map
  showed duplicate station rings and badges. Republication now strips a
  heading equal to the title with or without its line names, and "select GO
  buses running between" names GO buses as the replacement
  (`MetrolinxAlertNormalizerTest`, from the published notices).
  Checks: test:fast, typecheck, lint (15 pre-existing warnings), backend
  `mvn test`; parity suite and the plan's suites on desktop and mobile
  Chromium pass apart from the known failures (offline-dashboard × 4, the two
  GO/UP mobile cases) and network-fade's hover-timing case, which fails at
  the same rate on a clean `567112e7` worktree (2 of 4 desktop runs);
  `test:visual` 30/30.
  Next: the phase 0 budget probe so phase 4 can add the budgets, then fold
  TTC's chooser into `MapOverlapChooser`.
