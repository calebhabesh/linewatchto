# PWA Update UX Design

Date: 2026-06-15

## Scope

Improve the LineWatch TO frontend PWA update experience. This is frontend-only: the Spring Boot backend update policy remains backward-compatible API evolution, not a user-installed update.

## Goals

- Let riders keep using the dashboard until they choose to update.
- Avoid interrupting active service disruption checks with a modal or surprise reload.
- Make the update action reliable for installed PWAs and mobile browsers with stale service-worker cache state.
- Present progress clearly without decorative or fake installer styling.
- Preserve the current dashboard route across the update and refetch current service data afterward.

## Policy

Normal frontend releases use a non-blocking update banner. The banner appears when `/version.json` reports a different build label than the baked frontend build. The banner copy should be short and user-facing:

- Title: `New version available`
- Body: `Update LineWatch TO to get the latest fixes and improvements.`
- Actions: `Later` and `Update now`

The banner should not show installed/latest build labels. Build details can remain in diagnostic areas, not in the primary update prompt.

Choosing `Later` snoozes that specific build in `sessionStorage` so the banner does not immediately return during the same browsing session. Future builds can still show the banner.

Compatibility-breaking releases should be rare. If a future backend needs to reject old frontends, that should be represented by explicit minimum-version metadata and a stronger blocking prompt. This slice does not implement forced updates.

## Service Worker

Production service workers should not call `skipWaiting()` during install. Activation should happen when the user chooses `Update now` or naturally when no old clients remain. Development mode can keep automatic activation and cache cleanup to avoid stale local bundles.

The existing `linewatch-skip-waiting` message remains the explicit activation path. The update page sends that message to a waiting worker, waits briefly for `controllerchange`, clears app cache storage, and returns to the dashboard with a cache-busting query parameter.

## Update Page UX

Replace the current visually heavy update page with a quiet operations-style progress surface:

- Dark neutral background matching the dashboard.
- Thin TTC line-color strip as the main brand signal.
- One compact panel with title, status text, deterministic progress bar, and a concise technical log.
- Three user-facing phases:
  1. `Preparing update`
  2. `Refreshing app shell`
  3. `Reloading dashboard`

The progress bar should advance by actual phase completion, not by decorative continuous animation. A subtle active fill transition is fine. The page should respect reduced-motion preferences and avoid glow/orb/bokeh decoration.

## Layout

The update banner must sit above the mobile bottom navigation. On desktop it should stay compact, centered near the bottom edge. On narrow screens it can stack text and actions, but buttons must remain stable and readable.

The update page should work standalone, including from `window.location.replace`, and must not depend on React hydration.

## Data And State

The current path, query, and hash are preserved through the existing `return` parameter. After the update completes, the dashboard reloads and refetches current alert/status data. The update flow must not clear auth cookies, local preferences, or saved app settings. The app-update page may clear browser caches; the separate dev reset page may continue to clear storage.

## Testing

Update frontend PWA tests to cover:

- Banner copy uses user-facing text and `Later` / `Update now`.
- Banner checks `/version.json` with no-store semantics.
- Banner has session-scoped dismissal for the latest build.
- Service worker keeps dev auto-activation but does not auto-`skipWaiting()` in production install.
- App update page still posts `linewatch-skip-waiting`, clears cache storage, and returns to the preserved dashboard URL.
- Update page exposes deterministic phase labels instead of the prior heavy installer copy.

Run the frontend fixture, typecheck, and lint checks before completion.
