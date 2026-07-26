# GO/UP Network Mode Fixture Vertical Slice Implementation Plan

**Date:** 2026-07-22  
**Status:** Integrated fixture slice; realtime source mapping deferred
**Branch:** `feature/go-up-network-mode`

## Goal

Add a source-independent GO/UP dashboard mode without weakening the existing TTC experience. TTC remains the default. Selecting GO/UP replaces the complete dashboard dataset, map, stations, alert counts, station search scope, source/freshness copy, and mobile inspection state with clearly labelled fallback demo data.

## Architecture

`NetworkId = "ttc" | "regional"` exists at the dashboard data boundary. The aggregate backend endpoint accepts the network parameter and returns network/source/availability metadata with independent cache keys. TTC retains its live-or-fallback path. Regional mode currently returns its static station/status catalog with realtime explicitly unavailable, while the client supplies the complete typed fixture topology and source-honest local scenarios. `DataProvider` always receives the selected network's complete snapshot.

`InteractiveTtcMap` remains isolated behind the `NetworkMap` dispatcher. `InteractiveRegionalMap` owns the custom regional SVG and camera while intentionally reusing the TTC map's proven visual primitives: station hover/selection indicators, impact group/glow/boundary classes, wide transparent hit targets, keyboard activation, and card selection behavior.

## Rollout Order

### 1. Asset preparation and validation

- Add a repeatable Node preparation script for the external authoring master.
- Promote ordinary station elements, logical junction groups, and KI/UP child dots from `inkscape:label` to stable DOM IDs.
- Normalize major layer IDs, apply the padded viewBox, and hide the complete lake layer.
- Preserve the external master as read-only input.
- Test padded bounds, hidden lakes, unique junction group IDs, and route-specific anchors.

### 2. Network-scoped data boundary

- Add `NetworkId`, `DEFAULT_NETWORK_ID`, and `networkId` on `DashboardData`.
- Keep current backend loading TTC-only and explicitly mark returned data `networkId: "ttc"`.
- Add a regional fixture snapshot with all eight corridors and 72 logical stations.
- Model fixture freshness as fallback/demo, never live.
- Reset selected impacts, stations, search text, inspectors, and camera signals when the network changes.

### 3. Regional fixtures and topology

- Define BR, KI, LE, LW, MI, RH, ST, and UP route metadata from the reviewed palette.
- Define every logical SVG station and corridor membership in route order.
- Add opt-in local route-wide, station-node, segment-specific, overlapping, and stale-source scenarios using future-facing DTO shapes. Keep the default fixture disruption-free.
- Use route-prefixed adjacent segment IDs. Every segment must use an explicit `guidePathId` or reviewed route-specific anchor pair; no inferred straight-line production geometry.
- Model Weston, Mount Dennis, and Bloor as one logical selectable station each with separate KI/UP child anchor IDs.
- Use the authored guide when available and reviewed route-specific station anchors as the fixture-only fallback. Production source matching remains deferred.

### 4. Interactive regional map

- Load only `regional-rail-map.svg` in the regional component.
- Implement pointer pan, wheel/button zoom, fit-network, and a useful mobile initial camera.
- Add large transparent station targets, TTC-derived hover/selection indicators, hover boundaries, focus/keyboard selection, and logical selection for junction groups.
- Resolve route-wide overlays from authored corridor paths; resolve station and segment overlays only from stable route anchors/guides.
- Explain white-striped scheduled artwork in an original “Limited service” legend. Do not treat it as realtime disruption styling.

### 5. Shell and TTC-only feature isolation

- Place an accessible TTC / GO & UP selector in stable top chrome on desktop and mobile.
- Scope status rows, alerts, station search, station details, freshness copy, mobile sheets, and fixture fallback to selected network.
- Do not fetch TTC station detail, accessibility outages, surface notices, arrivals, estimated markers, or closed-hours state while regional mode is selected.
- Keep unsupported regional panels absent or explicitly unavailable; never fill them with TTC fixtures.

### 6. Backend compatibility strategy

- Do not change Metrolinx normalization before representative key-backed payloads are captured.
- Preserve `/api/dashboard` and legacy TTC endpoints.
- Support `GET /api/dashboard?network=ttc|regional` with provider-neutral network/source/availability metadata and independent cache keys. The regional response remains a source-unavailable static catalog until key-backed payloads are reviewed.
- The browser API must expose purpose-built display data, never an API key or redistributed raw feed.

### 6a. Account boundary integrated in this slice

- Qualify saved-station identities and API mutations by `networkId`.
- Validate TTC stations through the TTC repository and regional stations through the reviewed static catalog.
- Keep My Stations scoped to the active network while retaining both networks' rows in the account.
- Do not enable regional saved commutes, reliability analytics, or notification delivery.

### 7. Verification and later slices

- Fixture tests: default TTC, selector isolation, 72-station regional fallback, station-search isolation, logical junction selection, KI/UP anchors, impact scopes, hidden lakes, and TTC-only feature gates.
- Typecheck and lint after each coherent component slice.
- Build and Playwright desktop/mobile tests after the selector and regional camera are wired.
- Backend tests begin only when the reviewed network-scoped API boundary is implemented.

## Deferred Until Source Capture

Metrolinx category mapping, exact realtime DTOs, polling interval/quota, source update timestamps, full-dataset disappearance behavior, planned-notice completeness, and realtime arrival/vehicle claims remain intentionally unspecified until representative payloads and agreement constraints are reviewed.
