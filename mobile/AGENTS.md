# Native mobile

Expo / React Native TypeScript with Expo Router and Continuous Native Generation.
This is a prototype; verify implemented native behavior instead of assuming web
features exist here. Read [mobile handoff](../docs/mobile-implementation-handoff.md)
for feature expansion or native architecture changes, not routine styling.

- Reuse existing dark/high-contrast tokens and shared source-labeled API contracts.
- Preserve runtime validation, foreground-aware polling, persisted query caching, and the SecureStore session seam. Cached data must retain its age/source state.
- Preserve safe areas, readable non-overlapping text, accessible control labels, and reduced-motion behavior. Verify affected platform/viewports for layout changes.
- Follow generated-native-project conventions; configure Expo rather than hand-maintaining generated native output.

Commands from repo root: `npm --prefix mobile run typecheck`,
`npm --prefix mobile run lint`, and `npm --prefix mobile test -- <test-path>`.
Run these for finished mobile changes; use focused checks during iteration.
Run `npm --prefix mobile run doctor` for dependency/Expo configuration changes
and `npm --prefix mobile run export:android` for build/native integration changes
or release validation. Neither is required for every UI tweak.
