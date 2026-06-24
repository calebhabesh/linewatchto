# Mobile PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LineWatchTO installable as a mobile PWA with a trustworthy offline fallback and fast relaunch behavior.

**Architecture:** Use the built-in Next.js App Router PWA conventions instead of adding a package. Add `app/manifest.ts`, PWA metadata and viewport settings, a small client-only service worker registration component, static offline HTML, and a hand-written `/sw.js` that caches only app-shell/static assets while bypassing `/api/*` reads.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, public static assets, browser Service Worker API, Node built-in tests.

---

## Product Decision

LineWatchTO should use a conservative offline policy.

- The installed app should launch full-screen/standalone on mobile.
- Icons should use the supplied LineWatch assets from `~/Pictures/Assets/LineWatch/PWA-Icons`.
- Static app assets, map SVG, icons, fonts, and the offline page may be cached.
- Live dashboard/API responses must not be cached by the service worker.
- Offline navigation should show a dedicated offline page stating that current TTC service cannot be verified.
- The app must not replay stale alert, station, commute, or status data as current service.

This matches the repository guardrail that the dashboard should not claim live service unless fresh ingestion exists.

## Files

- Create: `frontend/src/app/manifest.ts`
  - Returns the web app manifest through Next.js metadata routes.
- Modify: `frontend/src/app/layout.tsx`
  - Adds PWA metadata, mobile viewport fit, theme colors, Apple web app metadata, and service worker registration.
- Create: `frontend/src/components/PwaServiceWorkerRegistration.tsx`
  - Registers `/sw.js` after page load in production builds, with `scope: "/"` and `updateViaCache: "none"`.
- Create: `frontend/public/sw.js`
  - Service worker with install, activate, and fetch handlers.
- Create: `frontend/public/offline.html`
  - Static offline fallback page with no stale-service claims.
- Create: `frontend/public/assets/linewatch/pwa/app-icon-192.png`
- Create: `frontend/public/assets/linewatch/pwa/app-icon-512.png`
- Create: `frontend/public/assets/linewatch/pwa/apple-touch-icon.png`
- Create: `frontend/public/assets/linewatch/pwa/maskable-app-icon-512.png`
- Modify: `frontend/next.config.ts`
  - Adds no-cache and JavaScript content headers for `/sw.js`.
- Create: `frontend/tests/pwa.test.mjs`
  - Guardrails for manifest values, icon dimensions, metadata, service worker registration, service worker cache policy, and offline page copy.
- Modify: `README.md`
  - Documents the installed PWA shell and conservative offline behavior.

## Task 1: Add PWA Guardrail Tests

- [ ] Create `frontend/tests/pwa.test.mjs`.

The test should:

- Import `manifest()` from `frontend/src/app/manifest.ts`.
- Assert `name` is `LineWatchTO`, `short_name` is `LineWatch`, `start_url` is `/`, `scope` is `/`, and `display` is `standalone`.
- Assert manifest icons include 192, 512, Apple touch metadata, and a maskable 512 icon.
- Read PNG headers for the copied public icons and assert dimensions are exactly 192x192, 512x512, 180x180, and 512x512.
- Read `layout.tsx` and assert Apple web app metadata, viewport fit cover, theme colors, and `<PwaServiceWorkerRegistration />` are present.
- Read `PwaServiceWorkerRegistration.tsx` and assert `/sw.js`, `scope: "/"`, and `updateViaCache: "none"` are used.
- Read `sw.js` and assert `/offline.html` is precached, `/api/*` requests bypass cache, and navigation requests fall back to the offline page.
- Read `offline.html` and assert it says current TTC service cannot be verified offline.
- Read `next.config.ts` and assert `/sw.js` has no-cache headers.

- [ ] Run `npm --prefix frontend run test:fixtures`.

Expected: FAIL because the manifest, service worker, copied icons, offline page, and registration component do not exist yet.

## Task 2: Copy PWA Icon Assets

- [ ] Create `frontend/public/assets/linewatch/pwa/`.
- [ ] Copy:
  - `~/Pictures/Assets/LineWatch/PWA-Icons/app-icon-192.png` to `frontend/public/assets/linewatch/pwa/app-icon-192.png`
  - `~/Pictures/Assets/LineWatch/PWA-Icons/app-icon-512.png` to `frontend/public/assets/linewatch/pwa/app-icon-512.png`
  - `~/Pictures/Assets/LineWatch/PWA-Icons/apple-touch-icon.png` to `frontend/public/assets/linewatch/pwa/apple-touch-icon.png`
  - `~/Pictures/Assets/LineWatch/PWA-Icons/maskable-app-icon-512.png` to `frontend/public/assets/linewatch/pwa/maskable-app-icon-512.png`

## Task 3: Add Manifest And Metadata

- [ ] Create `frontend/src/app/manifest.ts`.

The manifest should return:

```ts
{
  id: "/",
  name: "LineWatchTO",
  short_name: "LineWatch",
  description: "Unofficial TTC reliability dashboard for Toronto subway and LRT riders.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#0d0808",
  theme_color: "#0d0808",
  lang: "en-CA",
  categories: ["navigation", "travel", "utilities"],
  prefer_related_applications: false,
  icons: [
    { src: "/assets/linewatch/pwa/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/assets/linewatch/pwa/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/assets/linewatch/pwa/maskable-app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
  ]
}
```

- [ ] Update `frontend/src/app/layout.tsx`.

Add:

- `applicationName: "LineWatchTO"`
- `manifest: "/manifest.webmanifest"` if required by the generated output
- `icons.icon` entries for the 192 and 512 PNGs
- `icons.apple` entry for the Apple touch icon
- `appleWebApp` metadata with `capable: true`, `title: "LineWatchTO"`, and `statusBarStyle: "black-translucent"`
- `formatDetection.telephone: false`
- `viewport` export with `width: "device-width"`, `initialScale: 1`, `viewportFit: "cover"`, dark/light `themeColor`, and `colorScheme: "dark light"`

## Task 4: Add Service Worker Registration

- [ ] Create `frontend/src/components/PwaServiceWorkerRegistration.tsx`.

Use a client component with this behavior:

```ts
useEffect(() => {
  if (!("serviceWorker" in navigator)) return;
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_LINEWATCH_ENABLE_SW !== "true") return;

  const register = () => {
    navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    }).catch(() => undefined);
  };

  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });

  return () => window.removeEventListener("load", register);
}, []);
```

- [ ] Render `<PwaServiceWorkerRegistration />` inside `RootLayout` body.

## Task 5: Add Offline Page And Service Worker

- [ ] Create `frontend/public/offline.html`.

The page should state:

```text
Current TTC service cannot be verified while your device is offline.
Reconnect and reopen the dashboard for fresh alerts, station details, and saved commute checks.
```

- [ ] Create `frontend/public/sw.js`.

The service worker should:

- Precache `/offline.html` and the public LineWatch static assets needed by the offline page.
- Delete old `linewatch-` caches on activate.
- Bypass non-GET requests.
- Bypass cross-origin requests.
- Bypass `/api/*` requests completely so live/status data is never cached.
- Use network-first for navigation requests and fall back to `/offline.html`.
- Use cache-first with background refresh for static assets under `/assets/` and `/_next/static/`.

## Task 6: Add Service Worker Headers

- [ ] Update `frontend/next.config.ts` with an `async headers()` block.

`/sw.js` should return:

```ts
[
  { key: "Content-Type", value: "application/javascript; charset=utf-8" },
  { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
  { key: "Service-Worker-Allowed", value: "/" },
  { key: "X-Content-Type-Options", value: "nosniff" }
]
```

## Task 7: Document The PWA Behavior

- [ ] Update `README.md`.

Add a concise Current Status bullet:

```text
- Installable mobile PWA shell with supplied LineWatch icons, standalone display metadata, cached static assets, and a conservative offline page that does not replay stale service data.
```

Add a Frontend note:

```text
The PWA service worker caches static assets and the offline page only. It intentionally bypasses `/api/*` responses so current TTC service, station, and commute data are never replayed as fresh while offline.
```

## Task 8: Verify

- [ ] Run `npm --prefix frontend run test:fixtures`.
- [ ] Run `npm --prefix frontend run typecheck`.
- [ ] Run `npm --prefix frontend run lint`.
- [ ] Run `npm --prefix frontend run build`.

Run Playwright smoke tests if the build changes affect shell rendering or install metadata behavior beyond source/fixture guardrails.
