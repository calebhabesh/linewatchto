# Map renderer parity: TTC and GO/UP

TTC (`InteractiveTtcMap.tsx`) and GO/UP (`InteractiveRegionalMap.tsx` with `app/regional-map-overlays.ts`) must look and behave the same over their SVG maps: same overlay vocabulary, same gesture handling, same stability. TTC renders overlays as React elements. GO/UP builds them imperatively inside injected SVG markup. Because of that difference, GO/UP does not get React's node reuse for free and has to match it on purpose. Most GO/UP-only flicker has come from that gap.

## Baseline contract

1. **Overlay nodes live as long as their content.** Rebuild overlay DOM only when what it draws changes. A dashboard poll returns new arrays and fresh `updatedAt` stamps even when nothing changed, so compare drawn content, not object identity (`regionalOverlayContentSignature`).
2. **Presentation state never rebuilds overlays.** Reduced motion, page visibility, hover, selection, and gesture/zoom/camera flags are applied in place. A reduced-motion toggle or a brief visibility flip (fired on window `focus`/`pageshow`) must not delete overlay nodes. GO/UP: `RegionalOverlaySession.setMotionPaused`, `updateSelection`, and the hover setters; never `update`.
3. **Glyph lanes share one motion model.** Each glyph has a resting placement. One-way lanes may move with `animateMotion`, while bidirectional lanes stay at rest. Pausing removes only the `animateMotion` child; resuming re-adds it with the same phase. TTC: `MotionGlyphLane`. GO/UP: `placeRegionalLaneGlyph` / `setRegionalGlyphLaneMotion`.
4. **Gestures use the same flags and timing.** Both maps set `data-map-gesture-active`, `data-map-zoom-active`, and camera-moving flags on the map root, and share the simplification rules in `styles/map/base-map.css`. A direct drag follows the pointer with no transform easing. Wheel zoom enters zoom mode once per gesture and commits 100 ms after the last tick. Properties that gesture mode simplifies (`filter`, `stroke-width`) must snap back on release, never transition. Animating a blur back repaints the whole map layer on every frame, even for invisible glows. When ending a gesture, both maps must fire no transitions.
5. **Hidden means not rendered.** Content that should not paint must stay out of the paint tree the way TTC's does. Hide authored source artwork with `visibility: hidden` on its children; never use `opacity: 0` on a container, because Chromium gives the invisible content its own GPU layers (about 55 for GO/UP's station-label source). Keep idle hover copies at `display: none` until hovered, as TTC renders a hover copy only for the hovered impact. On GO/UP, hidden copies and an `opacity: 0` label layer nearly doubled paint work and GPU layers.
6. **Pulses share one clock.** Overlay pulses resynchronize to the shared pulse cycle after a build or a motion resume, not on every gesture.

## Working rules

- When you change overlay rendering, motion, or gesture handling in one map, make the matching change in the other map, or record why the networks differ.
- Verify a change in both modes: pan, release, hover, wheel zoom, toggle reduced motion, and let a refresh pass. Overlays must not blink or restart. TTC often has no active impacts, so compare against a TTC fixture or scenario that has overlays.
- Regression coverage: `tests/regional-glyph-motion.test.mjs` (motion toggles in place), `tests/regional-map-overlays.test.mjs` (poll-only changes do not rebuild), and the label-hiding and glow-transition assertions in `tests/map-raster-renderer.test.mjs` and `tests/regional-network.test.mjs`.
- To compare the two renderers, count GPU layers (DevTools → Layers, or CDP `LayerTree`) and pan paint time on both maps. Give TTC overlays first, for example from the smoke API stub (`tests/smoke/api-stub.mjs`).

- The map shares Chrome's tile memory budget with the whole page. When it is exceeded, Chrome logs `tile memory limits exceeded` and drops tiles page-wide, so the map and sidebar flicker and tear.
- The GO/UP-only tearing after a pan came from camera easing during the drag. Each move eased the stage over 0.1s, so the stage stayed in a transform transition for the whole drag. The redraw when it settled after release overflowed that budget on GO/UP's heavier stage. Direct drags now set the stage transition to `none` in both maps (`startGestureInteraction`, regional `onPointerDown`). Reduced motion hid the bug because it already turns that easing off. Sidebar incident borders were ruled out; they keep a live canvas only while animating.

## Known gaps

- A real content change still rebuilds every GO/UP overlay, which restarts all of its animations. TTC re-renders only the overlays that changed. Closing this gap means per-impact keyed reconciliation in `RegionalOverlaySession.update`.
