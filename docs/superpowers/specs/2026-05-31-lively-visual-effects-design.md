# Lively Visual Effects Design Spec

## Feature Overview

The goal of this frontend slice is to bring the LineWatchTO map to life without compromising readability or accessibility. Currently, our SVG map clearly highlights delays (orange) and suspensions (red) using static thick lines, but an operations dashboard should feel dynamic and alive.

We will introduce three primary visual features:
1. **Pulsing Alert Nodes**: Stations with active impacts will radiate a subtle, pulsing warning aura to draw the eye immediately.
2. **Slow-Zone Tracers (Delays)**: Orange delay segments will feature an animated "marching ants" or slow-flow effect along the SVG path to indicate degraded train speed.
3. **Suspension/Shuttle Indicators**: Red suspension segments will receive a distinct diagonal-hash animation to signify closed tracks, and potentially a shuttle bus icon/tracer.

## Interaction & Accessibility
- All motion **must** hook into our existing `prefers-reduced-motion` and user-controlled static-motion toggle (`isAnimating` or `reducedMotion` state).
- When reduced motion is enabled, animations stop on their first frame or transition to a static high-contrast pattern.

## Technical Approach

### 1. CSS Keyframes for SVG Paths
We will use CSS `@keyframes` on the `.asset-alert-path` stroke properties.
- **Delay Flow**: Set `stroke-dasharray` and animate `stroke-dashoffset` linearly.
- **Suspension Hash**: Use a secondary overlaid `<path>` or an SVG `<pattern>` with diagonal stripes that pans slowly across the suspended segment.

### 2. Pulsing Alert Nodes
For `.station-hit-target.has-impact`, we will apply an infinite `box-shadow` or `stroke-width`/`stroke-opacity` CSS keyframe animation that slowly breathes (similar to the `.selected` pulse we just built, but distinctly colored orange/red based on severity).

### 3. Modifying `InteractiveTtcMap.tsx`
We will need to update the `OverlaySegment` component. Currently, it renders a single `<path>`:
```tsx
<path
  id={`overlay-${segment.id}`}
  className={`asset-alert-path ${typeClass} ${isSelected ? "selected" : ""}`}
  d={segment.svgPath}
/>
```
We will enhance this to render layered paths:
- A base thick colored path.
- An overlaid animated dashed path for delays.
- An overlaid animated hash pattern for suspensions.

### 4. Respecting `reducedMotion`
In `LineWatchShell.tsx`, we already pass down `isDark`. We should also ensure `reducedMotion` is passed down to `InteractiveTtcMap`, or rely entirely on the `prefers-reduced-motion` CSS media query combined with a `.motion-paused` shell class.

## Future Proofing
These animations operate entirely within the SVG namespace and CSS, meaning they will scale perfectly regardless of the zoom level provided by our `usePanZoom` hook.
