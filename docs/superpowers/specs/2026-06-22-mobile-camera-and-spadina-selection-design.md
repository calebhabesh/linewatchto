# Mobile Camera and Spadina Selection Design

Date: 2026-06-22

## Goal

Limit camera preservation after station-detail dismissal to mobile and keep Spadina's two synchronized selection indicators hidden until Spadina is actually selected.

## Root Causes

The map currently suppresses selection-clear recentering for every viewport, so desktop also preserves the focused camera.

Spadina always renders two `station-selected-indicator multi-anchor` circles so both visual station dots can synchronize when selected. Base CSS hides inactive multi-anchor indicators with `opacity: 0`, but the mobile-performance rule applies `opacity: 0.85` to every selected indicator and overrides that hidden state.

## Design

### Camera behavior

- Add an explicit `preserveCameraOnSelectionClear` prop to `InteractiveTtcMap`.
- `LineWatchShell` passes `isMobile`.
- When a selected station or impact is cleared:
  - mobile resets the remembered focus key without issuing a recenter command;
  - desktop resets the remembered focus key and recenters.
- Existing Center Map and layout-reset behavior remains unchanged.

This keeps viewport policy in the shell and map behavior explicit without querying browser width inside the map.

### Spadina selection indicators

- Keep both Spadina selection circles mounted so one logical station selection can highlight both visual anchors.
- Add mobile-performance selectors that preserve `opacity: 0` for inactive `.multi-anchor` indicators.
- Apply the visible mobile-performance opacity only to `.multi-anchor.active`.
- No station data or geometry changes are required.

## Testing

Add Playwright coverage verifying:

- desktop closing station details returns to the default centered transform;
- mobile closing station details preserves the focused transform;
- both Spadina selection indicators are invisible before selection on mobile;
- both become visible after selecting either Spadina dot.

Keep source-level coverage for the explicit camera-preservation prop and mobile CSS override.

## Acceptance Criteria

- Desktop station-detail dismissal recenters the map.
- Mobile station-detail dismissal preserves zoom and camera position.
- Unselected Spadina dots have no visible selection highlight on mobile.
- Selecting either Spadina dot visibly highlights both synchronized dots.
- Center Map continues to work on every viewport.
