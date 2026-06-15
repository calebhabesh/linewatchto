# PWA Update UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LineWatch TO's PWA update prompt user-controlled, mobile-safe, and paired with a calm deterministic update progress screen.

**Architecture:** Keep the existing `/version.json` build-label detector and `/app-update.html` cache-refresh handoff. Change the banner to user-facing copy with session-scoped snooze, remove production auto-`skipWaiting()`, and replace the update page's decorative installer styling with a compact operations-style progress flow.

**Tech Stack:** Next.js App Router, React, TypeScript, plain CSS, custom service worker, Node built-in test runner.

---

### Task 1: Lock Expected PWA Update Behavior In Tests

**Files:**
- Modify: `frontend/tests/pwa.test.mjs`

- [ ] Add assertions that the banner uses `New version available`, `Update LineWatch TO to get the latest fixes and improvements.`, `Later`, and `Update now`.
- [ ] Add assertions that the banner uses `sessionStorage` and a stable dismissal key.
- [ ] Add assertions that the service worker does not auto-`skipWaiting()` in the production install path while still supporting the explicit `linewatch-skip-waiting` message.
- [ ] Add assertions that the update page exposes `Preparing update`, `Refreshing app shell`, and `Reloading dashboard`, and does not include the old decorative installer language.
- [ ] Run `npm --prefix frontend run test:fixtures` and confirm the new assertions fail before production code changes.

### Task 2: Update Banner Copy, Dismissal, And Mobile Placement

**Files:**
- Modify: `frontend/src/components/AppUpdateBanner.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] Replace installed/latest build labels with a short body message.
- [ ] Rename the primary action to `Update now`.
- [ ] Replace the icon-only dismiss action with a `Later` text button.
- [ ] Store dismissed build labels in `sessionStorage` under a LineWatch-specific key.
- [ ] Move mobile banner placement above the bottom nav using existing mobile nav CSS variables.
- [ ] Run `npm --prefix frontend run test:fixtures` and confirm the banner assertions pass.

### Task 3: Make Service Worker Activation User-Controlled In Production

**Files:**
- Modify: `frontend/public/sw.js`

- [ ] Keep development install behavior as immediate `skipWaiting()`.
- [ ] Remove production install-time `skipWaiting()`.
- [ ] Keep the `linewatch-skip-waiting` message handler as the explicit activation path.
- [ ] Run `npm --prefix frontend run test:fixtures` and confirm service-worker assertions pass.

### Task 4: Redesign App Update Progress Page

**Files:**
- Modify: `frontend/public/app-update.html`

- [ ] Replace the current decorative progress UI with a compact dark panel.
- [ ] Keep `registration.update()`, `linewatch-skip-waiting`, cache deletion, and return-url behavior.
- [ ] Use deterministic progress labels: `Preparing update`, `Refreshing app shell`, `Reloading dashboard`.
- [ ] Remove `Consolidated Recovery Log` and the old heavy installer visual language.
- [ ] Respect reduced-motion preferences.
- [ ] Run `npm --prefix frontend run test:fixtures` and confirm update-page assertions pass.

### Task 5: Final Verification

**Files:**
- Check: `frontend/tests/pwa.test.mjs`
- Check: `frontend/src/components/AppUpdateBanner.tsx`
- Check: `frontend/public/sw.js`
- Check: `frontend/public/app-update.html`

- [ ] Run `npm --prefix frontend run test:fixtures`.
- [ ] Run `npm --prefix frontend run typecheck`.
- [ ] Run `npm --prefix frontend run lint`.
- [ ] Report any command that cannot run or fails.
