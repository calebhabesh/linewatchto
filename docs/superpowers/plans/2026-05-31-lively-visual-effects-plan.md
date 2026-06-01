# Lively Visual Effects Implementation Plan

## Task 1: SVG Patterns and CSS Keyframes
**Files:** `frontend/src/app/globals.css`, `frontend/src/components/InteractiveTtcMap.tsx`

1. **Add CSS Animations to `globals.css`:**
   - Define `@keyframes flow-delay` that animates `stroke-dashoffset` from `100` to `0`.
   - Define `@keyframes pulse-impact` that animates `stroke-opacity` and `stroke-width` for station nodes.
   - Wrap animations in `@media (prefers-reduced-motion: no-preference)` or use a `.motion-safe` class.

2. **Add SVG Patterns:**
   - In `InteractiveTtcMap.tsx`, inside the disruption `<svg>`, add a `<defs>` block containing a diagonal stripe `<pattern id="suspension-hash">`.

## Task 2: Update Overlay Segments
**Files:** `frontend/src/components/InteractiveTtcMap.tsx`

1. **Refactor `OverlaySegment`:**
   - Modify the render output to conditionally include animated helper paths.
   - If `delay`: render base orange path + overlaid translucent dashed path with `flow-delay` animation.
   - If `suspension`: render base red path + overlaid path filled with `url(#suspension-hash)` stroke.

## Task 3: Station Impact Pulsing
**Files:** `frontend/src/app/globals.css`

1. **Enhance Station Node CSS:**
   - Target `.station-hit-target.has-impact`.
   - Apply `animation: pulse-impact 2.5s infinite ease-in-out`.
   - Ensure `access-advisory` and `access-outage` also get a subtle pulse.

## Task 4: Tests and Verification
**Files:** `frontend/tests/map-layering.test.mjs`

1. **Add Asset Assertions:**
   - Assert `InteractiveTtcMap.tsx` contains `<defs>` and `<pattern>`.
   - Assert `globals.css` contains the new `@keyframes`.
2. **Run Tests:**
   - Execute `node --test frontend/tests/map-layering.test.mjs`.
3. **Commit:**
   - `git add frontend/ docs/`
   - `git commit -m "feat: add lively visual effects to map"`
