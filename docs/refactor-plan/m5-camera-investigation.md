# Camera and Shell Occlusion Investigation (Chunk M5)

## 1. Executive Summary

This investigation fulfills the First Chunk requirement of **Chunk M5** in the LineWatchTO refactor plan ([`04-maps.md`](04-maps.md#L135)).

### Core Finding
**The Regional map camera/gesture engine MUST remain separate from TTC's `usePanZoom`.**
While both systems share fundamental affine math and multi-touch principles, their DOM rendering architectures, performance motion optimizations, and hit resolution models are fundamentally divergent:
- TTC renders a single SVG/raster stage whose CSS `transform` is driven directly by `usePanZoom`.
- Regional operates a hybrid multi-plane rendering system (3 asynchronous decoded canvas raster planes + 1 interactive dynamic SVG overlay) with motion-performance dataset attributes (`data-regional-map-camera-moving`, `data-map-zoom-active`, `data-map-gesture-active`) that throttle SVG animations and filters during movement to protect framerates.
- Regional integrates hit testing and selection activation directly into its pointer lifecycle (`pointerActivationRef` on `onPointerDown`/`onPointerUp`), whereas TTC relies on standard React DOM `onClick` listeners with tap-movement click suppression.

Forcing Regional into TTC's `usePanZoom` hook would either degrade Regional's mobile rendering performance or corrupt `usePanZoom` with complex, network-specific branching.

However, **shell occlusion and viewport layout measurement MUST be unified**:
- Both maps duplicate identical DOM queries and `ResizeObserver` instances to compute desktop top insets (`.desktop-map-control-rail`) and bottom insets (`.desktop-status-chip-row-container`, `.desktop-map-legend`).
- Both maps duplicate identical DOM queries and bounding box math to compute desktop left occlusion (`readDesktopOverlayInsets`, `#linewatch-main-menu`, `.floating-panel-shell`).
- `map-chooser-keepouts.ts` and `InteractiveRegionalMap.tsx` contain retired selectors (`.desktop-status-capsule-anchor`, `.desktop-status-capsule`, `.subway-closed-peek-chip`) that no longer have JSX producers.

---

## 2. Deep System Comparison: TTC (`usePanZoom`) vs. Regional (`InteractiveRegionalMap`)

### 2.1 Architecture and DOM Binding

| Characteristic | TTC (`usePanZoom.ts` + `InteractiveTtcMap.tsx`) | Regional (`InteractiveRegionalMap.tsx`) |
| --- | --- | --- |
| **DOM Structure** | Single `.ttc-map-stage` wrapper containing both raster imagery and SVG routes. | Multi-tier stack: static background raster planes (base, labels, badges) decoded on separate canvases + mounted dynamic SVG overlay (`.regional-map-interactive-layer`). |
| **Stage Transformation** | Directly sets `containerRef.current.style.transform = orientedMapCameraTransform(...)`. | Calls `writeMapTransform` which sets `mapStageRef.current.style.transform = orientedMapCameraTransform(...)`. |
| **Motion Optimization** | Toggles inline CSS `transition` (`transform 0.8s cubic-bezier(...)` vs `none`). | In addition to CSS transitions, toggles dataset attributes on the root container (`root.dataset.regionalMapCameraMoving`, `root.dataset.mapZoomActive`, `root.dataset.mapGestureActive`). CSS rules use these attributes to disable glow keyframes, blur filters, and pulse animations during motion. |
| **Hit Resolution** | Standard React DOM event handlers (`onClick`, `onPointerEnter`, `onPointerLeave`) on SVG elements. Uses `suppressMapClickRef` to swallow native clicks when pointer moved > 3px. | Custom hit resolution integrated directly into gesture lifecycle: checks `closest("[data-regional-impact-kind]")` and `closest("[data-regional-station-id]")` on `onPointerDown`; resolves selection or background dismiss on `onPointerUp`. |
| **Active View Query** | Directly queries `containerRef.current?.closest(".linewatch-shell")` and `.mobile-app-topbar[data-searching="true"]`. | Relies on React component props (`isMapActive`, `mapChromeVisible`). |

### 2.2 Coordinate Systems and ViewBox Spaces

| Metric | TTC Diagram | Regional Diagram |
| --- | --- | --- |
| **Canonical ViewBox** | `0 0 8250 4000` (fixed canonical aspect ratio). | Authored SVG viewBox `0 0 1600 900` (or similar). |
| **Visible Art Bounds** | Coincides with authored bounds `[0, 0, 8250, 4000]`. | `REGIONAL_VISIBLE_BOUNDS`: spans from Kitchener/Stratford (`x ≈ 53.1`) to Oshawa (`x ≈ 1550`), `y ≈ 120` to `820`. |
| **Internal Coordinate Spaces** | Single SVG coordinate space; stations have authored `station.mapX`, `station.mapY`. | Two distinct coordinate spaces formalized in Chunk M3.1: `station-layer` coordinate space vs `root` SVG coordinate space. |
| **Orientation Support** | `"standard"` vs `"rotated-landscape"` via `orientedMapCameraTransform`. | `"standard"` vs `"rotated-landscape"` via `orientedMapCameraTransform`, with geographic-center rotation anchoring (`reconcileRegionalViewport`). |
| **Selection Framing** | Frames bounding boxes with focus padding and desktop/mobile insets. | Frames station anchors or corridor runs, applying directional train marker lane offsets (`REGIONAL_TRAIN_MARKER_LANE_OFFSET = 44`) and mobile sheet height ratio (`readStoredSheetHeightRatio`). |

### 2.3 Command and Gesture Contracts

Both engines implement the following shared interaction contracts:
1. **Multi-Touch Pinch-to-Zoom**:
   - Computes distance and midpoint between two active pointers (`distanceBetweenPoints`, `midpointBetweenPoints`).
   - Anchors scale changes at the midpoint in map coordinate space (`transformForMapPointAtViewportPoint`).
   - Clamps scale between `PAN_ZOOM_MIN_RELATIVE_SCALE * fitScale` and `PAN_ZOOM_MAX_RELATIVE_SCALE * fitScale`.
   - **Pointer Transfer**: Smoothly transitions pinch -> drag when 1 pointer is lifted without jumping; transitions drag -> pinch when a 2nd pointer is added.
2. **Single-Pointer Drag**:
   - Batches DOM writes through `requestAnimationFrame` (`dragAnimationFrameRef` / `dragRafRef`).
   - Tracks pointer movement: if displacement exceeds 3px, marks gesture as moved (`cameraAdjustedByUserRef = true`, `dragMovedRef = true`) and suppresses click events.
3. **Flight Interruption**:
   - Touching or pressing any pointer down (`onPointerDown`) immediately interrupts and cancels active programmatic camera animations (`cancelCameraAnimation()`, `clearProgrammaticAnimation()`).
4. **Wheel Zoom**:
   - Centers zoom around current mouse cursor coordinates.
   - Ignores wheel events targeting scrollable overlays via `isMapWheelScrollRegionTarget(event.target)`.
   - Debounces persistence commit to storage.
5. **Reduced Motion**:
   - Bypasses multi-frame CSS transitions when `reducedMotion` is active or page visibility is lost.

---

## 3. Camera Persistence Mechanics

Persistence across both maps is governed by [`frontend/src/app/map-viewport-preference.ts`](../../frontend/src/app/map-viewport-preference.ts) and [`frontend/src/hooks/useMapViewportPersistence.ts`](../../frontend/src/hooks/useMapViewportPersistence.ts):
- **Storage Scope**: `localStorage` per network (`linewatch-map-viewport-v1:ttc`, `linewatch-map-viewport-v1:regional`).
- **Data Payload**: Version 2 schema `{ version: 2, centerX, centerY, zoom, savedAt }`.
- **Normalization**: Normalized against viewport center and `fitScale` (`zoom = camera.scale / fit`), enabling accurate restoration across window resize and device orientation changes.
- **Expiration & Validation**: Max age of 12 hours (`MAP_VIEWPORT_MAX_AGE_MS = 43,200,000 ms`). Validates finite numbers, coordinate bounds (`|centerX|, |centerY| < 1e7`), and scale boundaries.
- **Trigger Conditions**: Only saved on mobile viewports (`< 768px`) when camera was adjusted by user; debounced by 180ms during interaction, and saved immediately on `visibilitychange` or `pagehide`.
- **Reset Invariants**: Explicit network switches and recenter actions call `clearMapViewport(network)`.

---

## 4. Trace of All Keepout Selectors Across Layouts

`MAP_CHOOSER_KEEPOUT_SELECTOR` in [`map-chooser-keepouts.ts`](../../frontend/src/components/map-chooser-keepouts.ts) configures obstacle boundaries avoided by the TTC and Regional overlap chooser placement algorithms.

Below is the exhaustive trace of all 22 selectors:

| Selector | Active Producer in JSX? | Producing Components / Files | Layouts Affected | Status & Recommendation |
| --- | :---: | --- | --- | --- |
| `.desktop-status-capsule-anchor` | **NO** | *None* (only in CSS and tests) | Historical desktop | **RETIRED**: Prune from keepouts and tests. |
| `.desktop-map-control-rail` | **YES** | `InteractiveRegionalMap.tsx`, `InteractiveTtcMap.tsx`, `GeographicNetworkMap.tsx` | Desktop (>= 768px) | **RETAIN**: Critical map zoom/recenter control barrier. |
| `.desktop-map-legend` | **YES** | `NetworkMapLegends.tsx` | Desktop (>= 768px) | **RETAIN**: Bottom-right legend keepout. |
| `.desktop-status-chip-row-container` | **YES** | `LineWatchShell.tsx`, `CurrentServicePanel.tsx` | Desktop (>= 768px) | **RETAIN**: Bottom status filter chips. |
| `.mobile-bottom-nav` | **YES** | `MobileBottomNav.tsx` | Mobile portrait (< 768px) | **RETAIN**: Bottom tab navigation. |
| `.mobile-status-peek` | **YES** | `MobileStatusPeek.tsx` | Mobile portrait (< 768px) | **RETAIN**: Floating service peek card. |
| `.mobile-legend-pill` | **YES** | `MobileLegend.tsx` | Mobile portrait (< 768px) | **RETAIN**: Floating legend pill. |
| `.mobile-train-toggle` | **YES** | `LineWatchShell.tsx` | Mobile portrait (< 768px) | **RETAIN**: Estimated train marker toggle. |
| `.mobile-train-left-cluster` | **YES** | `LineWatchShell.tsx` | Mobile portrait (< 768px) | **RETAIN**: Bottom-left button cluster. |
| `.mobile-alert-history-shortcut` | **YES** | `LineWatchShell.tsx` | Mobile portrait (< 768px) | **RETAIN**: Shortcut button. |
| `.mobile-my-stations-shortcut` | **YES** | `LineWatchShell.tsx` | Mobile portrait (< 768px) | **RETAIN**: Shortcut button. |
| `.map-utility-cluster` | **YES** | `LineWatchShell.tsx` | Mobile & desktop | **RETAIN**: Utility action buttons. |
| `.map-control-rail` | **YES** | `LineWatchShell.tsx`, map components | Desktop & tablet | **RETAIN**: Map controls container. |
| `.mobile-map-controls` | **YES** | `MobileMapControls.tsx` | Mobile portrait & landscape | **RETAIN**: Mobile zoom and locate buttons. |
| `.rotated-map-hud` | **YES** | `LineWatchShell.tsx` | Mobile landscape (rotated) | **RETAIN**: HUD overlay. |
| `.rotated-map-selection-hud` | **YES** | `LineWatchShell.tsx` | Mobile landscape (rotated) | **RETAIN**: Selection details HUD. |
| `.subway-closing-soon-chip` | **YES** | `SubwayClosingSoonChip.tsx`, `GoUpClosingSoonChip.tsx` | All layouts when active | **RETAIN**: Floating closure warning banner. |
| `.subway-closed-peek-chip` | **NO** | *None* (only in CSS and tests) | Historical mobile | **RETIRED**: Prune from keepouts and tests. |
| `.saved-station-global-notice` | **YES** | `LineWatchShell.tsx` | All layouts when active | **RETAIN**: Global station outage toast. |
| `header button` | **YES** | `LineWatchShell.tsx` | Desktop & mobile headers | **RETAIN**: Top bar buttons. |
| `header a` | **YES** | `LineWatchShell.tsx` | Desktop & mobile headers | **RETAIN**: Top bar logo link. |
| `[data-map-chooser-keepout]` | **YES** | Multiple shell & map components | All layouts | **RETAIN**: Canonical explicit keepout attribute. |

### Additional Dead Query Identified in `InteractiveRegionalMap.tsx`
Line 397:
```ts
const capsule = document.querySelector<HTMLElement>(".desktop-status-capsule");
```
`.desktop-status-capsule` is no longer produced by any TSX component. This query always returns `null` at runtime, causing `desktopMapTopInset` to evaluate to `0` on mount in `InteractiveRegionalMap.tsx` until the `ResizeObserver` measures `.desktop-map-control-rail`.

---

## 5. Retain / Extract / Remove Decisions Matrix

| Mechanic | Decision | Architectural Rationale |
| --- | :---: | --- |
| **Regional gesture engine vs `usePanZoom`** | **RETAIN SEPARATE** | Regional requires direct dataset attribute toggling (`data-regional-map-camera-moving`, `data-map-gesture-active`) to pause complex SVG filters/animations, and embeds pointer-up hit resolution across transparent SVG overlay planes. Merging them would compromise rendering performance or pollute the clean `usePanZoom` abstraction. |
| **Affine math & orientation transforms** | **RETAIN SHARED** | Already unified in [`panZoomMath.ts`](../../frontend/src/hooks/panZoomMath.ts). |
| **Viewport persistence** | **RETAIN SHARED** | Already unified in [`useMapViewportPersistence.ts`](../../frontend/src/hooks/useMapViewportPersistence.ts) and [`map-viewport-preference.ts`](../../frontend/src/app/map-viewport-preference.ts). |
| **Desktop map insets (`topInset`, `bottomInset`)** | **EXTRACT** | Both maps duplicate identical measurement logic and `ResizeObserver` setup observing `.desktop-map-control-rail`, `.desktop-status-chip-row-container`, and `.desktop-map-legend`. Extract into a shared `useDesktopMapInsets(rootRef, railRef)` hook. |
| **Desktop left occlusion insets** | **EXTRACT** | Both maps duplicate identical queries and bounding box calculations for `.desktop-sidebar-container`, `#linewatch-main-menu`, and `.floating-panel-shell`. Generalize `readDesktopOverlayInsets` in `desktop-sidebar-state.ts` to `readDesktopLeftOcclusion(viewport, desktopMenuPinned)`. |
| **Active view DOM query in `usePanZoom`** | **REMOVE / PASS AS PROP** | Replace `container.closest(".linewatch-shell")` and querySelector with explicit `isMapActive` / `isSearching` props passed from `LineWatchShell`. |
| **Retired selectors (`.desktop-status-capsule-anchor`, `.subway-closed-peek-chip`)** | **REMOVE** | Remove from `MAP_CHOOSER_KEEPOUT_SELECTOR` in `map-chooser-keepouts.ts`. Remove `.desktop-status-capsule` query from `InteractiveRegionalMap.tsx`. |

---

## 6. Verification and Acceptance Criteria Mapping

This investigation confirms:
1. **Per-network/per-mode persisted cameras**: Both TTC and Regional use normalized zoom-to-fit ratios in storage and preserve version 2 format across orientation changes.
2. **Gesture invariants**: Drag interrupts flights; pinch transitions smoothly to single-pointer drag; drags > 3px suppress click events; wheel events inside scrollable containers are ignored.
3. **Decoupled engines**: Regional retains its 60 FPS motion-dataset attributes and pointer-up hit resolution; TTC retains generic pan-zoom stage transformations.
4. **Clean seams identified**: Extracting desktop insets, left occlusion, and pruning dead selectors can proceed cleanly without altering camera gesture behavior.
