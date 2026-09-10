# Mobile sheet performance investigation

Source: local Trace-20260910T070209.json, 648,127 events. Desktop Chrome,
Pixel 6A viewport emulation, development server at localhost:3000. Trace event
timestamps cover about 4.33 seconds; the recorded DevTools window is 3.82 seconds.
This is not an on-device production benchmark. CPU throttling is unconfirmed.

## Observations

- Six renderer main-thread tasks after profiler startup lasted 71–97 ms.
  Five predominantly contain React scheduler performWorkUntilDeadline calls.
  The scheduler name identifies framework scheduling, not the originating component.
- The initial 216 ms task contains approximately 215 ms of profiler startup.
  It should not be treated as an application hitch.
- The renderer recorded 483 UpdateLayoutTree events (214.5 ms), 455 Layout
  events (41.6 ms), 2,349 Paint events (190.3 ms), and 449 Layerize events
  (190.2 ms). These are individual event-category totals, not additive end-to-end
  time or a frame-rate measurement.
- Paint attribution: 1,445 compact line-badge paints, 449 dynamic-map SVG paints,
  449 document paints, six service-sheet paints. Attribution alone does not
  establish GPU cost or prove that shadows are cheap on the phone.
- Animation diagnostics explicitly identify unsupported compositor properties:
  scrollbar-color (113), stroke-width (28), visibility (10).
- The existing correction to the global button transition-property list addresses
  the unintended scrollbar-color and visibility transitions. It was preserved.
- React development/debug tracing is extensive, and an extension's autofill
  mutation observer also appears. Development trace costs must not be extrapolated
  directly to staging.
- CPU-profile chunks were not used to claim component render rates or total GC
  cost: those require careful separation of profile streams and nested events.

## On-device evidence supplied by the developer

Reduced motion, with or without constellation enabled, feels best. Removing
constellation alone helps, but leaves a gap. This suggests multiple competing
animation workloads. The remaining native/PWA difference is not yet measured.

## Changes

1. Keep constellation static below the existing 768px mobile breakpoint. Draw on
   initialization, resize, and lifecycle recovery; do not schedule a continuous
   animation loop or restart it on mobile pointerdown. Desktop drift remains.
2. Remove station-detail-panel from reduced-motion transform-reset selectors.
   Disable its automatic transitions instead; preserve positioning and direct
   manipulation.
3. Station drag rAF reads the latest pointer-derived translation, rather than the
   position captured by the first event scheduling that frame.

## Decision

Do not disable all map motion or freeze incoming service data without a separate
comparison. Existing mobile performance mode already suppresses many SVG effects;
the recorded stroke-width animations warrant checking the actual active selectors
and DOM state in a production device trace. Viewport emulation alone does not
explain which mode was active in this historical recording.

If static constellation remains meaningfully worse than reduced motion on-device,
next compare decorative map animation paused versus running, preferably during
drag and settling only. Preserve static severity, route identity, selection
feedback, and data freshness. Do not add position smoothing before establishing
frame delivery: filtering can introduce finger-tracking latency.

## Verification

Production build and four mobile Chromium browser tests passed: service-sheet
tap/keyboard/drag with fixed layout height; station drag and reset under system and
app reduced motion; no continuous mobile constellation redraw. Typecheck passed.
Lint reported three existing unused-symbol warnings. Fast tests passed except
source expectations affected by this change; those were corrected and the affected
glass-rendering and CSS architecture suites passed on rerun.

No new Pixel 6a trace or measured on-device frame-rate improvement is claimed.

## Follow-up implementation

Both draggable sheets reserve animation capacity during pointer gestures.
The shared helper pauses currently running infinite Web Animations/CSS loops
and active SVG SMIL timelines, preserving their position. It leaves finite
transitions and source/data updates active, and resumes after settling (or
immediately on cleanup). Already-paused animations are not resumed; cancelled
animations are not resurrected. This targets existing decorative timelines,
not every possible JavaScript animation or loops created after gesture start.

The static constellation rule now includes coarse-pointer devices, covering
phone landscape as well as narrow viewports. Five focused browser checks passed,
including decorative animation pause/resume. The Node station-hook test required
an explicit .ts import for its direct-source execution and passed after correction.
On-device production comparison remains necessary; no optimum frame rate is claimed.
