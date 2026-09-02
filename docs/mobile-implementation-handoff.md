# Mobile implementation handoff

The `mobile/` application owns the Expo, navigation, data, persistence, theme, and map-interaction architecture. Extend those seams rather than regenerating the app or replacing its providers.

## Completed Slices & Architecture

### Phase 1: Core Map, Interaction & Detail Foundations (Completed)
1. **Reusable state components**: Loading, error, and empty states.
2. **Service-impact filters**: Disruption filtering by severity/kind with cached-data detail routes.
3. **Station catalog & detail**: Transit line badges, wheelchair accessibility status, dynamic arrivals, outages, and surface connection feeds.
4. **Selective raster map planes**: Fast native asset loading with dark and high-contrast modes.
5. **Clamped pan/zoom**: Smooth math-based pan, pinch, zoom, and reset interactions.
6. **Typed impact selection**: Bi-directional map segment and station ring selection shared between schematic map and cards.
7. **Contract coverage & smoke tests**: Deterministic component/schema contract tests and Maestro flows.

### Phase 2: UI/UX Parity & Secondary Features (Completed)
8. **Selected-impact preview sheet**: Compact PWA-like preview card above the status peek with dismiss and details routing.
9. **Visual parity pass**: Standardized `ProductHeader`, dense section cards, uppercase source labels, and bottom-safe spacing.
10. **Station catalog density & search polish**: Sticky search bar, clear button, line/corridor chips, result counts, and accessible targets.
11. **Status grouping & planned-closure timeline**: Visual separation of active disruptions and planned closures with time buckets.
12. **More tab & documentation**: Unofficial project disclaimers, open data attribution, derivative map acknowledgements, and external resource links.
13. **Accessibility & compact device pass**: Large font scaling, 44dp hit targets, TalkBack/VoiceOver labels, and bottom-nav clearance.
14. **Accessibility Outages Monitor**: Dedicated `/accessibility` route with elevator/escalator outages drilldown by line/station.
15. **Service Notices & Changes**: Dedicated `/notices` route with surface detours, bus/streetcar notices, and regional trip changes.
16. **30-Day Reliability Summaries**: Dedicated `/reliability` route with incident counts, median durations, and service impact time.
17. **Schematic Train Markers**: Realtime subway train marker placements mapped to topology with operating-hours gating.
18. **Cross-network consistency pass**: High-contrast theme persistence in AsyncStorage, responsive layouts, and unified visual language.

### Phase 3: Foundation-Gated Features (Completed)
19. **Bearer-token backend transport & SecureStore auth**:
    - Backend `@SessionToken` parameter resolver supporting `Authorization: Bearer <token>`, `X-Session-Token`, and cookie fallback with automatic renewal.
    - Mobile `auth-provider.tsx` with `expo-secure-store` token persistence and sign-in / registration / demo / dev / sign-out flows.
20. **My Stations Watchlist**:
    - `saved-stations-provider.tsx` with optimistic updates, rollback, and sign-in prompts.
    - `★ Saved` filter chip and bookmark buttons on station rows and station detail headers.
21. **Native My Commutes (Fifth Tab: Commutes)**:
    - Dedicated `commutes` bottom tab with `CommutesTabIcon`.
    - `commutes-screen.tsx` with unauthenticated onboarding, authenticated commute cards, standard vs impacted travel times, matched disruption lists, outbound/return leg toggles, and creation modal.
22. **Push notification preferences**:
    - `push-notifications-provider.tsx` and `notifications-section.tsx` in More tab.
    - Master switches for commute alerts and planned closures, closure reminder timing selectors (Smart, 24h Before, Day Of, Announce Only), 6 disruption type toggles, and rapid transit line / GO corridor subscription grid.
23. **OAuth & Google Auth Seam**:
    - `loginWithGoogle` and `linkGoogleAccount` methods with Google Linked account status badge and auth config awareness.

---

## Verification Commands

```bash
# Mobile checks
npm --prefix mobile run typecheck
npm --prefix mobile run lint
npm --prefix mobile test
npm --prefix mobile run doctor
npm --prefix mobile run export:android

# Backend checks
mvn -f backend/pom.xml test
```

## Next phase: PWA visual parity

The feature slices above are functionally complete, but the native app still needs a structural visual-alignment phase. The implementation sequence, shared-shell architecture, screen acceptance matrix, and visual verification gates are defined in [`mobile-pwa-visual-parity-plan.md`](./mobile-pwa-visual-parity-plan.md).

Do not treat the earlier “UI/UX Parity” slice label as proof of current visual parity. The next phase begins by replacing generic full-screen tab pages with the persistent map and floating-sheet composition used by the PWA.
