# Mobile implementation handoff

The `mobile/` scaffold owns the architectural decisions. Follow its boundaries rather than regenerating the Expo application or replacing its providers.

## Good Gemini 3.7 Flash slices

Each slice below is intentionally bounded enough for a fast implementation model. Give Gemini one slice at a time, require it to inspect the referenced existing code first, and require all mobile checks after each slice.

### 1. Reusable empty/loading/error components

Extract the repeated states in `dashboard-screen.tsx`, `alerts-screen.tsx`, and `stations-screen.tsx` into accessible components under `mobile/src/components/`. Preserve the existing source-honesty copy, 8px-or-less radii, theme tokens, and pull-to-refresh behavior. Add React Native Testing Library coverage.

### 2. Impact list filtering and details route

Add All, Suspensions, Delays, Reduced Speed Zones, and Planned Closures filters to the Alerts tab. Add a typed `/impact/[kind]/[id]` route that is populated only from the cached dashboard response. Preserve regional absence of Reduced Speed Zones and do not invent fields or source freshness. Add route/component tests.

### 3. Station catalog navigation shell

Make station rows pressable, add `/station/[network]/[id]`, and build the loading/error/layout shell. For TTC, define a runtime schema from the actual `StationController` response before rendering fields. For regional mode, do not pretend there is an equivalent aggregate station-detail endpoint: compose only independently available source-labeled endpoints. Poll only while the route is visible. Add a Maestro navigation assertion.

### 4. Native raster map planes

Copy only the authored `*-mobile.png` background, foreground, and label planes needed for TTC and regional dark/high-contrast modes into `mobile/assets/linewatch/`. Build a plane manifest, render only the current network/theme with `expo-image`, keep labels above dynamic overlays, and document asset provenance. Measure decoded dimensions and avoid loading both networks simultaneously. Do not modify the authored source assets.

### 5. Map pan/pinch/reset controls

Wrap `SchematicMap` with Gesture Handler/Reanimated transforms. Clamp scale and translation, support double-tap/reset, keep impact hit targets usable, honor reduced-motion once that preference exists, and preserve an accessible list alternative. Add pure transform/clamping tests; do not use exact-train-position language.

### 6. Complete card-to-map selection

Introduce one typed impact-selection context so a map path and its matching alert card open/focus the same item. Support segment and station-node impacts, planned-preview blue, ordinary delay orange, suspension red, and Reduced Speed Zone treatment. Do not flatten regional station-only impacts across a corridor.

### 7. Mobile component and Maestro coverage

Add deterministic mocked API tests for initial dashboard rendering, cached-refresh failure, source `live: false`, network switching, station filtering, and high-contrast persistence. Expand Maestro for launch, network switch, impact list, station search, and display preference. Keep fixtures under tests only and label any visible demo build.

## Keep for a higher-judgment pass

Do not delegate these as boilerplate without a dedicated design/review pass:

- backend native bearer-token issuance and dual cookie/bearer authentication;
- account deletion, OAuth audiences, Apple sign-in, and deep-link security;
- native push installation schema, Expo receipt handling, lifecycle dedupe, and preference matching;
- changes to freshness semantics or runtime API contracts;
- source licensing/permission decisions and store privacy declarations;
- any extraction of shared web/mobile packages or repository-wide workspace conversion.

## Required checks per slice

```bash
npm --prefix mobile run typecheck
npm --prefix mobile run lint
npm --prefix mobile test
npm --prefix mobile run doctor
npm --prefix mobile run export:android
```

Run the Maestro flow when a development build/emulator is available. If a slice changes the Spring API, also run `mvn -f backend/pom.xml test`.
