# Map Selection Camera Preservation Design

Date: 2026-06-22

## Goal

Closing a zoomed station detail view must preserve the map's current zoom and camera position. The user can explicitly restore the default centered view with the existing **Center Map** control.

## Current Behavior

`InteractiveTtcMap` derives a focus target from the selected station or service impact. When that target becomes `null`, its focus effect clears the remembered target and calls `recenter()`. Closing `StationDetailPanel` clears `selectedStationId`, so the map automatically returns to its default centered view.

## Design

Keep selection state and camera state independent after focus:

- Selecting a station or service impact continues to focus the map once.
- Clearing the selected station or service impact clears only the remembered focus-target key.
- Clearing a selection does not issue a camera command.
- Selecting the same target again after clearing it can focus the map again because the remembered focus-target key was reset.
- The existing **Center Map** button remains the explicit way to restore the default centered view.
- Existing layout-driven recenter behavior remains unchanged because it handles map layout transitions rather than selection dismissal.

This behavior applies consistently when either a station or service-impact selection is cleared. Adding a station-panel-specific camera-preservation flag would duplicate responsibility across the shell and map and is unnecessary.

## Implementation

In `frontend/src/components/InteractiveTtcMap.tsx`, update the no-focus-target branch of the selection focus effect:

1. Reset `lastFocusedTargetKeyRef.current` to `null`.
2. Keep the current transform unchanged.
3. Remove the automatic `recenter()` call from that branch.
4. Remove `recenter` from that effect's dependency list if it is no longer otherwise used there.

No changes are required in `LineWatchShell`, `StationDetailPanel`, or `usePanZoom`.

## Testing

Extend `frontend/tests/pan-zoom-behavior.test.mjs` with a regression guard that verifies the no-focus-target branch resets the remembered target without calling `recenter()`.

Run:

```bash
node --test frontend/tests/pan-zoom-behavior.test.mjs
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

## Acceptance Criteria

- Closing station details with the **X** leaves the map at its current zoom and position.
- Clearing a service-impact selection also leaves the current camera unchanged.
- Selecting a target still focuses it once.
- Clearing and then selecting the same target focuses it again.
- Pressing **Center Map** still restores the default centered map view.
- Layout-triggered recenter behavior remains intact.
