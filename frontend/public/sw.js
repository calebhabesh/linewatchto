const CACHE_PREFIX = "linewatch-pwa";
const CACHE_VERSION = "v4";
const CACHE_BUILD = (new URL(self.location.href).searchParams.get("build") || "local").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 100);
const APP_SHELL_CACHE = `${CACHE_PREFIX}-${CACHE_VERSION}-${CACHE_BUILD}-shell`;
const STATIC_CACHE = `${CACHE_PREFIX}-${CACHE_VERSION}-static`;
const OFFLINE_URL = "/offline.html";
const OFFLINE_DASHBOARD_URL = "/offline";
// Synthetic key for the last successful start-page document of this build.
const LAUNCH_SHELL_KEY = "/__linewatch/launch-shell";
const NOTIFICATION_BADGE_URL = "/assets/linewatch/pwa/notification-badge-96.png";
const NOTIFICATION_ICON_URL = "/assets/linewatch/pwa/app-icon-192.png";
const LINEWATCH_PUSH_CATEGORIES = new Set([
  "saved-commute-impact",
  "saved-commute-current",
  "saved-commute-planned",
  "line-current",
  "line-planned",
]);
const FALLBACK_PUSH_TAG = "linewatch-commute-update";
// One summary per catch-up batch; outside the push categories, so tag
// reconciliation leaves it to the rules below.
const CATCH_UP_SUMMARY_TAG_PREFIX = "linewatch-catch-up|";
const PUSH_IDENTITY_CACHE = "linewatch-push-identity-v1";
const PUSH_IDENTITY_CACHE_KEY = "/__linewatch/push-installation-id";

const isDev = new URL(self.location.href).searchParams.get("env") === "dev";
const SUBSCRIPTION_CHECK_SYNC_TAG = "linewatch-subscription-check";

// Shared subscription check (also mirrored for the page). importScripts always
// exists in a worker; the guard keeps unit-test contexts that omit it working.
if (typeof importScripts === "function") {
  importScripts("/push-subscription-check.js");
}

const APP_SHELL_URLS = [
  OFFLINE_URL,
  NOTIFICATION_ICON_URL,
  "/assets/linewatch/pwa/app-icon-512.png",
  "/assets/linewatch/pwa/apple-touch-icon.png",
  "/assets/linewatch/pwa/maskable-app-icon-512.png",
  NOTIFICATION_BADGE_URL,
  "/assets/linewatch/pwa/offline-icon-512.png",
  "/assets/linewatch/logo.svg",
  "/assets/linewatch/ttc-subway-map-custom.svg",
  "/assets/linewatch/regional-rail-map.svg",
  ...[
    "accessibility-alert.svg", "accessible.svg", "alert-noti-2.svg", "alert-noti.svg",
    "bicycle-lockup.svg", "bicycle-repair.svg", "bike-share-toronto.svg", "cardinal-north.svg",
    "click-icon.svg", "closed-alert.svg", "delay-icon.svg", "elevator-icon.svg",
    "exclaim-alert-white.svg", "go-br-legend.svg", "go-ki-legend.svg", "go-le-legend.svg",
    "go-lw-legend.svg", "go-mi-legend.svg", "go-rh-legend.svg", "go-st-legend.svg",
    "jump-to-location.svg", "line-1-legend.svg", "line-2-legend.svg", "line-4-legend.svg",
    "line-5-legend.svg", "line-6-legend.svg", "logs.svg", "parking.svg",
    "passenger-pick-up.svg", "phone-rotate-landscape-white.svg", "phone-rotate-landscape.svg", "site-guide.svg",
    "streetcar.svg", "transportation-train.svg", "up-express-legend.svg", "washroom.svg",
    "wheel-chair-symbol.svg",
  ].map((name) => `/assets/linewatch/${name}`),
  "/assets/fonts/texgyreheros-regular.woff2",
  "/assets/fonts/texgyreheros-bold.woff2",
  "/assets/linewatch/outages/elevator.svg",
  "/assets/linewatch/outages/escalator.svg",
  ...["ttc", "regional"].flatMap((network) =>
    ["background", "foreground", "labels", ...(network === "ttc" ? ["badges"] : [])].flatMap((plane) =>
      ["dark", "light", "high-contrast"].map((theme) =>
        `/assets/linewatch/raster-maps/${network}-${plane}-${theme}-mobile.png`))),
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    if (isDev) {
      await self.skipWaiting();
      return;
    }
    const cache = await caches.open(APP_SHELL_CACHE);
    await cache.addAll(APP_SHELL_URLS);
    await cacheOfflineDashboard(cache);
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    if (isDev) {
      // Clear all caches in development to ensure no stale data persists
      const cacheNames = await caches.keys();
      await deleteCaches(cacheNames);
    } else {
      const expectedCaches = new Set([APP_SHELL_CACHE, STATIC_CACHE]);
      const cacheNames = await caches.keys();

      await deleteCaches(
        cacheNames.filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && !expectedCaches.has(cacheName)),
      );
    }

    await self.clients.claim();
    // A worker wake is a chance to notice a replaced subscription.
    await checkPushSubscription("worker-wake");
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (isDev) {
    // In development, completely bypass caching so HMR works and chunks are never stale.
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  // Schedule-derived map and search files (plan 16): public generated data, never an API response.
  if (isScheduleManifest(url)) {
    event.respondWith(networkFirstScheduleManifest(request));
    return;
  }

  if (isScheduleFile(url)) {
    event.respondWith(cacheFirstScheduleFile(request));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(isLaunchNavigation(url) ? cachedLaunchNavigation(event) : networkFirstNavigation(request));
    return;
  }

  if (isNextStaticAsset(url)) {
    event.respondWith(cacheFirstNextStatic(request));
    return;
  }

  if (isVersionedMapAsset(url) || isVersionedGeographicAsset(url)) {
    event.respondWith(cacheFirstMapAsset(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(networkFirstStatic(request));
  }
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    await showPendingPushNotification(event);
    // Devices that still receive some pushes report a replacement here.
    await checkPushSubscription("push");
  })());
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(handlePushSubscriptionChange(event));
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag !== SUBSCRIPTION_CHECK_SYNC_TAG) return;
  event.waitUntil((async () => {
    await reportWorkerStage("periodic-sync-fired");
    await checkPushSubscription("periodic-sync");
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "linewatch-cache-loaded-assets" && !isDev) {
    const assets = Array.isArray(event.data.urls) ? event.data.urls.slice(0, 250) : [];
    const warm = Promise.allSettled(assets.map((value) => {
      const url = new URL(value, self.location.origin);
      if (url.origin !== self.location.origin || !(isStaticAsset(url) || isNextStaticAsset(url))) return;
      return networkFirstStatic(new Request(url.href));
    }));
    event.waitUntil(warm);
    return;
  }
  if (event.data?.type === "linewatch-refresh-launch-shell" && !isDev) {
    // Preferences change the server-rendered start page; refresh it for the next launch.
    const refresh = refreshLaunchShell(fetch("/", { credentials: "same-origin", cache: "no-store" }))
      .catch(() => undefined)
      // Background updates reload only after the next launch document is stored.
      .then(() => event.ports?.[0]?.postMessage({ type: "linewatch-refresh-launch-shell-ack" }));
    if (typeof event.waitUntil === "function") {
      event.waitUntil(refresh);
    }
    return;
  }
  if (event.data?.type === "linewatch-skip-waiting") {
    const skipWaiting = self.skipWaiting();
    if (typeof event.waitUntil === "function") {
      event.waitUntil(skipWaiting);
    }
    return;
  }

  if (event.data?.type !== "linewatch-cleanup-notifications") return;

  const cleanup = reconcilePushNotifications();
  if (typeof event.waitUntil === "function") {
    event.waitUntil(cleanup);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    await recordDisplayedNotificationClientEvent(event.notification, "notification_click");
    await openNotificationUrl(notificationTargetUrl(event.notification));
  })());
});

self.addEventListener("notificationclose", (event) => {
  event.waitUntil(recordDisplayedNotificationClientEvent(event.notification, "notification_close"));
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/icon.svg"
  );
}

function isNextStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(8_000) });
    if (response.status < 500) return response;
    throw new Error("Navigation unavailable");
  } catch {
    return offlineNavigationFallback(request);
  }
}

async function offlineNavigationFallback(request) {
  // Only public dashboard navigations may reopen into the app. Never cache or
  // replay account pages, OAuth callbacks, verification/reset links, or RSC reads.
  const url = new URL(request.url);
  if ((url.pathname === "/" || url.pathname === OFFLINE_DASHBOARD_URL)
    && ![...url.searchParams.keys()].some((key) => /token|code|password|email/i.test(key))) {
    const dashboard = await caches.match(LAUNCH_SHELL_KEY, { cacheName: APP_SHELL_CACHE })
      || await caches.match(OFFLINE_DASHBOARD_URL);
    if (dashboard) return dashboard;
  }
  const offlineResponse = await caches.match(OFFLINE_URL);
  return offlineResponse || Response.error();
}

// The bare start URL is what an installed app opens. Its document carries only
// public fixture data and visual-preference cookies (live data loads client-side),
// so it can paint from cache while the network copy refreshes the next launch.
function isLaunchNavigation(url) {
  return url.pathname === "/" && url.search === "";
}

async function cachedLaunchNavigation(event) {
  const refreshed = refreshLaunchShell(fetch(event.request, { signal: AbortSignal.timeout(8_000) }));
  event.waitUntil(refreshed.catch(() => undefined));
  const cached = await caches.match(LAUNCH_SHELL_KEY, { cacheName: APP_SHELL_CACHE }).catch(() => undefined);
  if (cached) return cached;
  try {
    const response = await refreshed;
    if (response.status < 500) return response;
  } catch { /* Fall through to the installed public bootstrap. */ }
  return offlineNavigationFallback(event.request);
}

async function refreshLaunchShell(responsePromise) {
  const response = await responsePromise;
  if (isCacheableLaunchShell(response)) {
    try {
      const cache = await caches.open(APP_SHELL_CACHE);
      await cache.put(LAUNCH_SHELL_KEY, response.clone());
    } catch { /* Quota/private mode must not discard a successful response. */ }
  }
  return response;
}

function isCacheableLaunchShell(response) {
  if (response.status !== 200 || response.redirected) return false;
  if (!response.headers.get("content-type")?.includes("text/html")) return false;
  if (!response.url) return true;
  const url = new URL(response.url);
  return url.origin === self.location.origin && url.pathname === "/" && url.search === "";
}

async function cacheOfflineDashboard(cache) {
  const response = await fetch(OFFLINE_DASHBOARD_URL, { credentials: "omit", cache: "reload" });
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
    throw new Error("Offline dashboard bootstrap unavailable");
  }
  const html = await response.clone().text();
  const assets = new Set();
  for (const match of html.matchAll(/(?:src|href)="([^"<>]+)"/g)) {
    const url = new URL(match[1].replaceAll("&amp;", "&"), self.location.origin);
    if (url.origin === self.location.origin && isNextStaticAsset(url)) assets.add(url.href);
  }
  // Commit the bootstrap only after its code and styles are available. A failed
  // install leaves the previous worker and its complete shell in service.
  await cache.addAll([...assets]);
  // Font files referenced by the cached styles may have loaded before this
  // worker controlled the first visit.
  for (const asset of assets) {
    if (!new URL(asset).pathname.endsWith(".css")) continue;
    const stylesheet = await cache.match(asset);
    if (!stylesheet) continue;
    const fonts = [];
    for (const match of (await stylesheet.text()).matchAll(/url\(["']?([^\s"')]+)["']?\)/g)) {
      const url = new URL(match[1], asset);
      if (url.origin === self.location.origin && isNextStaticAsset(url)) fonts.push(url.href);
    }
    await cache.addAll(fonts);
  }
  await cache.put(OFFLINE_DASHBOARD_URL, response);
}

function isVersionedMapAsset(url) {
  const version = url.searchParams.get("v");
  if (!version || version === "local" || version === "dev") return false;
  return url.pathname === "/assets/linewatch/ttc-subway-map-custom.svg"
    || url.pathname === "/assets/linewatch/regional-rail-map.svg"
    || (url.pathname.startsWith("/assets/linewatch/raster-maps/") && url.pathname.endsWith(".png"));
}

// Routes, stops, catalogs and search indexes: fixed names, addressed per release by ?v=.
function isVersionedGeographicAsset(url) {
  const version = url.searchParams.get("v");
  if (!version || version === "local" || version === "dev") return false;
  return url.pathname.startsWith("/assets/linewatch/geographic/") && url.pathname.endsWith(".json");
}

// Keep one release of each geographic file: every deploy adds a new ?v= copy of several MB.
async function dropOtherGeographicReleases(cache, request) {
  const url = new URL(request.url);
  if (!isVersionedGeographicAsset(url)) return;
  for (const key of await cache.keys()) {
    const cachedUrl = new URL(key.url);
    if (cachedUrl.pathname === url.pathname && cachedUrl.search !== url.search) await cache.delete(key);
  }
}

const SCHEDULE_MANIFEST_PATH = "/data/schedule/manifest.json";
const SCHEDULE_FILE_PATTERN = /^\/data\/schedule\/files\/([A-Za-z0-9_-]+)\.[0-9a-f]{16}\.json$/;

function isScheduleManifest(url) {
  return url.pathname === SCHEDULE_MANIFEST_PATH && url.search === "";
}

function isScheduleFile(url) {
  return SCHEDULE_FILE_PATTERN.test(url.pathname) && url.search === "";
}

// The manifest changes when a new schedule is published: always ask, and offline (or when the
// server fails) answer with the last one read, whose hashed files this cache also holds. A 404
// means this deployment serves no manifest, and the page uses the release's files.
async function networkFirstScheduleManifest(request) {
  let networkResponse = null;
  try {
    networkResponse = await fetch(request, { signal: AbortSignal.timeout(4_000) });
    if (networkResponse.ok && networkResponse.headers.get("content-type")?.includes("json")) {
      try {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(SCHEDULE_MANIFEST_PATH, networkResponse.clone());
      } catch { /* Quota/private mode must not discard a successful response. */ }
      return networkResponse;
    }
    if (networkResponse.status === 404) return networkResponse;
  } catch { /* Offline or slow: use the last manifest. */ }
  const cached = await caches.match(SCHEDULE_MANIFEST_PATH, { cacheName: STATIC_CACHE }).catch(() => undefined);
  return cached || networkResponse || Response.error();
}

// Hashed schedule files never change: cache-first by full URL, one copy per file name.
async function cacheFirstScheduleFile(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    try {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, response.clone());
      const name = SCHEDULE_FILE_PATTERN.exec(new URL(request.url).pathname)[1];
      for (const key of await cache.keys()) {
        const match = SCHEDULE_FILE_PATTERN.exec(new URL(key.url).pathname);
        if (match && match[1] === name && key.url !== request.url) await cache.delete(key);
      }
    } catch { /* Quota/private mode must not discard a successful response. */ }
  }
  return response;
}

async function cacheFirstMapAsset(request) {
  // Match the complete URL: a new release must never reuse an older map.
  const cachedResponse = await caches.match(request);
  return cachedResponse || networkFirstStatic(request);
}

async function cacheFirstNextStatic(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;
  return networkFirstStatic(request);
}

async function networkFirstStatic(request) {
  try {
    const networkResponse = await fetch(request);
    if (!networkResponse.ok) throw new Error("Static asset unavailable");
    if (networkResponse.ok) {
      try {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(request, networkResponse.clone());
        await dropOtherGeographicReleases(cache, request);
      } catch { /* Quota/private mode must not discard a successful response. */ }
    }

    return networkResponse;
  } catch {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    const url = new URL(request.url);
    if (isVersionedGeographicAsset(url)) {
      // Offline before this release's copy arrived: the previous release's routes beat none.
      const previous = await caches.match(request, { ignoreSearch: true });
      if (previous) return previous;
    }
    if (url.pathname.startsWith("/assets/linewatch/") && url.pathname.endsWith(".svg")) {
      const map = await caches.match(url.pathname);
      if (map) return map;
    }
    if (/^\/assets\/linewatch\/raster-maps\/(ttc|regional)-(background|foreground|labels|badges)-(dark|light|high-contrast)-(mobile|balanced|desktop)\.png$/.test(url.pathname)) {
      // A compact complete map set is installed for both networks and themes.
      // Prefer a cached exact-resolution release asset whenever available.
      const map = await caches.match(url.pathname.replace(/-(balanced|desktop)\.png$/, "-mobile.png"));
      if (map) return map;
    }
    return Response.error();
  }
}

async function deleteCaches(cacheNames) {
  await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
}

async function showPendingPushNotification(event) {
  try {
    const payloadNotification = notificationFromPushPayload(event);
    if (payloadNotification) {
      if (shouldSkipExpiredNotification(payloadNotification)) {
        await recordPushClientEvent(payloadNotification, "pending_skipped", "expired active payload");
        await showExpiredPushNotificationFallback(payloadNotification);
        return;
      }
      await showTrackedPushNotification(payloadNotification);
      await reconcilePushNotifications();
      return;
    }

    const subscription = await self.registration.pushManager.getSubscription();
    if (!subscription) return;

    const response = await fetch("/api/account/push/latest", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    if (!response.ok) {
      if (shouldShowFallbackPushNotification(response.status)) {
        await showFallbackPushNotification();
      }
      return;
    }

    const body = await response.json();
    const pendingNotifications = normalizePendingNotifications(body);
    const tagState = await reconcilePushNotifications();
    if (pendingNotifications.length === 0) {
      return;
    }

    for (const notification of pendingNotifications) {
      if (shouldSkipExpiredNotification(notification)) {
        await recordPushClientEvent(notification, "pending_skipped", "expired active payload");
        await showExpiredPushNotificationFallback(notification);
        continue;
      }
      if (!shouldShowPendingNotification(notification, pendingNotifications, tagState)) {
        await recordPushClientEvent(notification, "pending_skipped");
        continue;
      }

      await showTrackedPushNotification(notification);
    }
  } catch {
    await showFallbackPushNotification();
  }
}

function notificationFromPushPayload(event) {
  if (!event?.data || typeof event.data.json !== "function") return null;
  try {
    return normalizePayloadNotification(event.data.json());
  } catch {
    return null;
  }
}

function normalizePayloadNotification(body) {
  if (!body || typeof body !== "object") return null;
  if (typeof body.title !== "string" || body.title.trim().length === 0) return null;
  if (typeof body.tag !== "string" || body.tag.trim().length === 0) return null;
  return {
    title: body.title,
    body: typeof body.body === "string" ? body.body : "",
    url: typeof body.url === "string" && body.url.length > 0 ? body.url : "/",
    tag: body.tag,
    state: typeof body.state === "string" ? body.state : "ACTIVE",
    timestamp: typeof body.timestamp === "string" ? body.timestamp : "",
    sourceEventAt: typeof body.sourceEventAt === "string" ? body.sourceEventAt : "",
    sentAt: typeof body.sentAt === "string" ? body.sentAt : "",
    expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : "",
    deliveryId: typeof body.deliveryId === "string" ? body.deliveryId : "",
    receiptToken: typeof body.receiptToken === "string" ? body.receiptToken : "",
    catchUp: body.catchUp === true,
    catchUpSummary: body.catchUp === true ? normalizeCatchUpSummary(body.catchUpSummary) : null,
  };
}

function normalizeCatchUpSummary(summary) {
  if (!summary || typeof summary !== "object") return null;
  if (typeof summary.batch !== "string" || summary.batch.length === 0) return null;
  if (typeof summary.title !== "string" || summary.title.trim().length === 0) return null;
  return {
    batch: summary.batch.slice(0, 64),
    title: summary.title,
    body: typeof summary.body === "string" ? summary.body : "",
    // Where the rider finds what the batch left out; the tap handler keeps it same-origin.
    url: typeof summary.url === "string" && summary.url.startsWith("/") ? summary.url : "/",
  };
}

function shouldSkipExpiredNotification(notification) {
  if (notificationStateFor(notification) === "CLEARED") return false;
  const expiresAt = Date.parse(notification.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

async function showPushNotification(notification) {
  const notificationState = notificationStateFor(notification);
  // A catch-up alert the tray already holds (shown before the old endpoint
  // died, report lost) is refreshed in place instead of alerting again. An
  // alert from a catch-up batch is shown quietly; its batch summary alerts once.
  const alreadyShown = notification.catchUp === true && await trayHasTag(notification.tag);
  const batched = notification.catchUp === true && notification.catchUpSummary !== null;
  const options = {
    body: notification.body,
    tag: notification.tag,
    icon: NOTIFICATION_ICON_URL,
    badge: NOTIFICATION_BADGE_URL,
    renotify: !alreadyShown && !batched,
    requireInteraction: true,
    silent: batched,
    data: {
      state: notificationState,
      url: notification.url || "/",
      deliveryId: notification.deliveryId || "",
      receiptToken: notification.receiptToken || "",
      sourceEventAt: notification.sourceEventAt || "",
      sentAt: notification.sentAt || "",
      expiresAt: notification.expiresAt || "",
    },
  };
  const timestamp = Date.parse(notification.timestamp);
  if (Number.isFinite(timestamp)) {
    options.timestamp = timestamp;
  }

  await self.registration.showNotification(notification.title, options);
  if (batched) {
    await showCatchUpSummary(notification.catchUpSummary);
  }
}

// Every alert of a batch carries the summary. The first to arrive shows it and
// alerts; the rest replace it in place, which alerts only with renotify.
async function showCatchUpSummary(summary) {
  const tag = `${CATCH_UP_SUMMARY_TAG_PREFIX}${summary.batch}`;
  try {
    await closeCatchUpSummaries((shownTag) => shownTag !== tag);
    await self.registration.showNotification(summary.title, {
      body: summary.body,
      tag,
      icon: NOTIFICATION_ICON_URL,
      badge: NOTIFICATION_BADGE_URL,
      renotify: false,
      requireInteraction: false,
      silent: false,
      data: { url: summary.url },
    });
  } catch {
    // The alerts themselves are already shown; the summary is an introduction.
  }
}

async function closeCatchUpSummaries(shouldClose = () => true) {
  if (typeof self.registration.getNotifications !== "function") return;
  const shown = await self.registration.getNotifications();
  await Promise.all(
    shown
      .filter((notification) => typeof notification.tag === "string"
        && notification.tag.startsWith(CATCH_UP_SUMMARY_TAG_PREFIX)
        && shouldClose(notification.tag))
      .map((notification) => notification.close()),
  );
}

async function trayHasTag(tag) {
  try {
    if (typeof self.registration.getNotifications !== "function") return false;
    const shown = await self.registration.getNotifications({ tag });
    return shown.some((notification) => notification.tag === tag);
  } catch {
    return false;
  }
}

async function showTrackedPushNotification(notification) {
  try {
    await showPushNotification(notification);
  } catch (error) {
    await recordPushClientEvent(notification, "show_failed", clientEventErrorMessage(error));
    throw error;
  }
  await Promise.allSettled([
    recordPushClientEvent(notification, "push_received"),
    acknowledgeDisplayedPushNotification(notification),
  ]);
}

async function acknowledgeDisplayedPushNotification(notification) {
  if (hasSignedPushReceipt(notification)) {
    await recordPushClientEvent(notification, "displayed_acknowledged");
    return;
  }

  try {
    const subscription = await self.registration.pushManager.getSubscription();
    if (!subscription) return;
    const response = await fetch("/api/account/push/displayed", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ endpoint: subscription.endpoint, tag: notification.tag }),
    });
    if (!response.ok) {
      await recordPushClientEvent(notification, "ack_failed", `displayed ack failed with ${response.status}`);
    }
  } catch (error) {
    await recordPushClientEvent(notification, "ack_failed", clientEventErrorMessage(error));
    // Payload display is authoritative; acknowledgement only prevents stale fallback delivery.
  }
}

async function recordDisplayedNotificationClientEvent(notification, stage) {
  if (!notification || !isLineWatchPushNotification(notification.tag)) return;
  await recordPushClientEvent({
    tag: notification.tag,
    state: notification.data?.state || "ACTIVE",
    deliveryId: notification.data?.deliveryId || "",
    receiptToken: notification.data?.receiptToken || "",
  }, stage);
}

async function recordPushClientEvent(notification, stage, message) {
  try {
    if (!notification || !isLineWatchPushNotification(notification.tag)) return;
    if (hasSignedPushReceipt(notification)) {
      const body = {
        deliveryId: notification.deliveryId,
        receiptToken: notification.receiptToken,
        stage,
      };
      if (typeof message === "string" && message.trim().length > 0) {
        body.message = message.trim().slice(0, 255);
      }

      await fetch("/api/account/push/receipt", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      return;
    }

    const subscription = await self.registration.pushManager.getSubscription();
    if (!subscription) return;

    const body = {
      endpoint: subscription.endpoint,
      tag: notification.tag,
      stage,
    };
    if (typeof message === "string" && message.trim().length > 0) {
      body.message = message.trim().slice(0, 255);
    }

    await fetch("/api/account/push/client-event", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Delivery diagnostics are best-effort and must never suppress the OS notification.
  }
}

function hasSignedPushReceipt(notification) {
  return typeof notification?.deliveryId === "string"
    && notification.deliveryId.length > 0
    && typeof notification.receiptToken === "string"
    && notification.receiptToken.length > 0;
}

function clientEventErrorMessage(error) {
  if (error && typeof error.message === "string" && error.message.length > 0) {
    return error.message;
  }
  return "unknown client error";
}

async function showFallbackPushNotification() {
  await self.registration.showNotification("⚠️ LineWatchTO Service Alert", {
    body: "Open LineWatchTO to view the latest service update.",
    tag: FALLBACK_PUSH_TAG,
    icon: NOTIFICATION_ICON_URL,
    badge: NOTIFICATION_BADGE_URL,
    renotify: true,
    requireInteraction: true,
    silent: false,
    data: {
      url: "/",
    },
  });
}

async function showExpiredPushNotificationFallback(notification) {
  await showFallbackPushNotification();
  await Promise.allSettled([
    recordPushClientEvent(notification, "fallback_shown", "expired active payload"),
    acknowledgeDisplayedPushNotification(notification),
  ]);
}

// Each stage is reported, so a production record shows whether Chrome fires
// the event and where the repair fails.
async function handlePushSubscriptionChange(event) {
  const oldEndpoint = event.oldSubscription?.endpoint || "";
  await reportWorkerStage("subscription-change-fired", oldEndpoint ? "old subscription present" : "no old subscription", oldEndpoint);
  try {
    const subscription = event.newSubscription || await self.registration.pushManager.getSubscription();
    const outcome = subscription
      ? await saveCheckedSubscription(subscription, null, oldEndpoint)
      : await restoreDroppedSubscription(oldEndpoint);
    if (outcome.saved) {
      await reportWorkerStage("subscription-change-saved", outcome.reason, outcome.endpoint);
    } else {
      await reportWorkerStage("subscription-change-failed", outcome.detail, outcome.endpoint || oldEndpoint);
    }
  } catch (error) {
    await reportWorkerStage("subscription-change-failed", clientEventErrorMessage(error), oldEndpoint);
  }
}

// The background subscription check (worker wake, push received, periodic
// sync): save only when the browser's endpoint differs from the one this
// device last saved, or restore one the browser dropped. The periodic sync
// also asks the server about an unchanged endpoint: Chrome on Android kept
// endpoints the push service had answered 410 for up to three days
// (2026-11-09 to 11-12), and the phone got nothing until Chrome dropped them.
async function checkPushSubscription(trigger) {
  const check = self.LineWatchPushSubscriptionCheck;
  if (isDev || !check || !self.registration?.pushManager) return;
  try {
    const saved = await check.readSavedSubscriptionState();
    const subscription = await self.registration.pushManager.getSubscription();
    const currentEndpointHash = subscription ? await check.endpointHash(subscription.endpoint) : null;
    const action = check.subscriptionCheckAction({
      hasSubscription: Boolean(subscription),
      savedEndpointHash: saved?.endpointHash,
      currentEndpointHash,
      verifyUnchanged: trigger === "periodic-sync",
    });
    if (action === "none") return;
    const outcome = action === "save"
      ? await saveCheckedSubscription(subscription, saved, "")
      : action === "verify"
        ? await replaceGoneSubscription(subscription, saved)
        : await restoreDroppedSubscription("");
    if (outcome.saved) {
      await reportWorkerStage(action === "restore" ? "check-restored" : "check-replaced", `${trigger}: ${outcome.reason}`, outcome.endpoint);
    } else if (outcome.detail !== "not-restorable" && outcome.detail !== "not-gone") {
      await reportWorkerStage("check-failed", `${trigger}: ${outcome.detail}`, outcome.endpoint);
    }
  } catch (error) {
    await reportWorkerStage("check-failed", `${trigger}: ${clientEventErrorMessage(error)}`);
  }
}

// Replaces an endpoint only when the server says the push service rejected
// it (404/410). It never re-saves first: that would re-enable an endpoint the
// rider turned off on the dashboard. A browser that is still subscribed hands
// back the same endpoint from subscribe(), so it unsubscribes first.
async function replaceGoneSubscription(subscription, saved) {
  const state = await fetchSubscriptionState(subscription.endpoint);
  if (state === null) return { saved: false, detail: "status unavailable", endpoint: subscription.endpoint };
  if (state !== "gone") return { saved: false, detail: "not-gone" };
  if (self.Notification && self.Notification.permission !== "granted") {
    return { saved: false, detail: "not-restorable" };
  }
  const config = await fetchPushConfigForSubscriptionRepair();
  if (!config?.webPushAvailable || typeof config.vapidPublicKey !== "string" || config.vapidPublicKey.length === 0) {
    return { saved: false, detail: "gone; push config unavailable", endpoint: subscription.endpoint };
  }
  const check = self.LineWatchPushSubscriptionCheck;
  const goneEndpointHash = await check.endpointHash(subscription.endpoint);
  await subscription.unsubscribe();
  // If this fails, the next check finds no subscription and restores one.
  const replacement = await self.registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(config.vapidPublicKey),
  });
  const reason = "invalid-endpoint-replacement";
  const result = await saveChangedPushSubscription(replacement, reason, goneEndpointHash, saved?.displayMode);
  if (result.status !== "saved") {
    return { saved: false, detail: `gone; ${result.detail}`, endpoint: replacement.endpoint };
  }
  await check.writeSavedSubscriptionState({
    endpointHash: await check.endpointHash(replacement.endpoint),
    savedAt: new Date().toISOString(),
  });
  return { saved: true, reason, endpoint: replacement.endpoint };
}

// "enabled", "gone", "disabled" or "unknown"; null when the server can't say
// (signed out, offline), which never triggers a replacement.
async function fetchSubscriptionState(endpoint) {
  try {
    const response = await fetch("/api/account/push/subscription/status", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "accept": "application/json" },
      body: JSON.stringify({ endpoint }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body?.state === "string" ? body.state : null;
  } catch {
    return null;
  }
}

async function restoreDroppedSubscription(oldEndpoint) {
  const check = self.LineWatchPushSubscriptionCheck;
  const saved = check ? await check.readSavedSubscriptionState() : null;
  // Restore only what this device had saved, and only with permission.
  if (!saved?.endpointHash || (self.Notification && self.Notification.permission !== "granted")) {
    return { saved: false, detail: "not-restorable" };
  }
  const config = await fetchPushConfigForSubscriptionRepair();
  if (!config?.webPushAvailable || typeof config.vapidPublicKey !== "string" || config.vapidPublicKey.length === 0) {
    return { saved: false, detail: "push config unavailable" };
  }
  const subscription = await self.registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(config.vapidPublicKey),
  });
  return saveCheckedSubscription(subscription, saved, oldEndpoint, true);
}

async function saveCheckedSubscription(subscription, savedState, oldEndpoint, subscribedAnew = false) {
  const check = self.LineWatchPushSubscriptionCheck;
  const saved = savedState || (check ? await check.readSavedSubscriptionState() : null);
  const currentHash = check ? await check.endpointHash(subscription.endpoint) : "";
  const previousEndpointHash = saved?.endpointHash && saved.endpointHash !== currentHash
    ? saved.endpointHash
    : (oldEndpoint && check ? await check.endpointHash(oldEndpoint) : undefined);
  const reason = check
    ? check.registrationReasonFor({ savedEndpointHash: previousEndpointHash, currentEndpointHash: currentHash, subscribedAnew })
    : "endpoint-replaced";
  let result = await saveChangedPushSubscription(subscription, reason, previousEndpointHash, saved?.displayMode);
  let savedSubscription = subscription;
  if (result.status === "rejected") {
    await subscription.unsubscribe();
    const config = await fetchPushConfigForSubscriptionRepair();
    if (!config?.webPushAvailable || !config.vapidPublicKey) {
      return { saved: false, detail: "rejected; push config unavailable", endpoint: subscription.endpoint };
    }
    savedSubscription = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(config.vapidPublicKey),
    });
    result = await saveChangedPushSubscription(savedSubscription, "invalid-endpoint-replacement", currentHash, saved?.displayMode);
  }
  if (result.status !== "saved") {
    return { saved: false, detail: result.detail, endpoint: savedSubscription.endpoint };
  }
  if (check) {
    await check.writeSavedSubscriptionState({
      endpointHash: await check.endpointHash(savedSubscription.endpoint),
      savedAt: new Date().toISOString(),
    });
  }
  return { saved: true, reason, endpoint: savedSubscription.endpoint };
}

async function reportWorkerStage(stage, message, endpoint) {
  try {
    const body = { stage };
    if (typeof message === "string" && message.trim().length > 0) body.message = message.trim().slice(0, 255);
    if (typeof endpoint === "string" && endpoint.length > 0) body.endpoint = endpoint;
    await fetch("/api/account/push/subscription/worker-stage", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Stage reports are diagnostics; they never block the repair itself.
  }
}

async function fetchPushConfigForSubscriptionRepair() {
  const response = await fetch("/api/account/push/config", {
    method: "GET",
    credentials: "include",
    headers: {
      "accept": "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return await response.json();
}

async function saveChangedPushSubscription(subscription, reason, previousEndpointHash, displayMode) {
  if (!subscription?.endpoint) return { status: "failed", detail: "no endpoint" };
  const installationId = await getOrCreatePushInstallationId();
  const check = self.LineWatchPushSubscriptionCheck;
  const body = {
    endpoint: subscription.endpoint,
    keys: pushSubscriptionKeys(subscription),
    userAgent: serviceWorkerUserAgent(),
    reason: typeof reason === "string" && reason.length > 0 ? reason : "endpoint-replaced",
    installationId,
  };
  if (previousEndpointHash) body.previousEndpointHash = previousEndpointHash;
  const browserMajorVersion = check?.browserMajorVersion(serviceWorkerUserAgent(), self.navigator?.userAgentData);
  if (browserMajorVersion) body.browserMajorVersion = browserMajorVersion;
  if (displayMode === "standalone" || displayMode === "browser") body.displayMode = displayMode;
  const response = await fetch("/api/account/push/subscription", {
    method: "PUT",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { status: "failed", detail: `save failed with ${response.status}` };
  const result = await response.json();
  return result?.enabled === false ? { status: "rejected", detail: "endpoint rejected" } : { status: "saved" };
}

function pushSubscriptionKeys(subscription) {
  const serialized = typeof subscription?.toJSON === "function" ? subscription.toJSON() : {};
  return {
    p256dh: serialized.keys?.p256dh || "",
    auth: serialized.keys?.auth || "",
  };
}

function serviceWorkerUserAgent() {
  if (typeof navigator !== "undefined" && typeof navigator.userAgent === "string") {
    return navigator.userAgent;
  }
  return "Service Worker";
}

async function getOrCreatePushInstallationId() {
  const cache = await caches.open(PUSH_IDENTITY_CACHE);
  const cached = typeof cache.match === "function" ? await cache.match(PUSH_IDENTITY_CACHE_KEY) : null;
  const cachedValue = cached ? (await cached.text()).trim() : "";
  if (/^[A-Za-z0-9._:-]{8,80}$/.test(cachedValue)) return cachedValue;

  const installationId = typeof self.crypto?.randomUUID === "function"
    ? self.crypto.randomUUID()
    : fallbackPushInstallationId();
  await cache.put(PUSH_IDENTITY_CACHE_KEY, new Response(installationId, {
    headers: { "content-type": "text/plain" },
  }));
  return installationId;
}

function fallbackPushInstallationId() {
  if (typeof self.crypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    self.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function base64UrlToUint8Array(base64Url) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }
  return output;
}

function shouldShowFallbackPushNotification(status) {
  return !Number.isFinite(status) || status === 401 || status === 403 || status >= 500;
}

function normalizePendingNotifications(body) {
  if (Array.isArray(body?.notifications)) {
    return body.notifications.filter((notification) => notification && typeof notification.tag === "string");
  }
  return body?.notification && typeof body.notification.tag === "string" ? [body.notification] : [];
}

function notificationStateFor(notification) {
  return notification.state === "CLEARED" ? "CLEARED" : "ACTIVE";
}

function baseLifecycleTag(tag) {
  if (typeof tag !== "string") return "";
  if (tag.endsWith("|active")) return tag.slice(0, -"|active".length);
  if (tag.endsWith("|cleared")) return tag.slice(0, -"|cleared".length);
  return tag;
}

function batchHasClearedPartner(notification, pendingNotifications) {
  const baseTag = baseLifecycleTag(notification.tag);
  if (!baseTag) return false;
  return pendingNotifications.some((candidate) => (
    candidate !== notification
    && notificationStateFor(candidate) === "CLEARED"
    && baseLifecycleTag(candidate.tag) === baseTag
  ));
}

function shouldShowPendingNotification(notification, pendingNotifications, tagState) {
  const notificationState = notificationStateFor(notification);
  if (
    notificationState !== "CLEARED"
    && Array.isArray(tagState?.activeTags)
    && !tagState.activeTags.includes(notification.tag)
  ) {
    return Array.isArray(tagState?.retainedTags)
      && tagState.retainedTags.includes(notification.tag)
      && batchHasClearedPartner(notification, pendingNotifications);
  }

  if (
    notificationState === "CLEARED"
    && Array.isArray(tagState?.retainedTags)
    && !tagState.retainedTags.includes(notification.tag)
  ) {
    return false;
  }

  return true;
}

async function reconcilePushNotifications() {
  try {
    const tagState = await fetchPushNotificationTagState();
    if (!tagState) return null;
    await closeInactivePushNotifications(tagState.retainedTags);
    return tagState;
  } catch {
    // Notification cleanup is best-effort; failed cleanup must not hide new alerts.
    return null;
  }
}

async function fetchPushNotificationTagState() {
  const subscription = await self.registration.pushManager.getSubscription();
  if (!subscription) return { activeTags: [], retainedTags: [] };

  const response = await fetch("/api/account/push/active", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  if (!response.ok) return null;

  const body = await response.json();
  if (body?.cleanupAllowed === false) return null;
  const activeTags = Array.isArray(body.activeTags) ? body.activeTags : [];
  const retainedTags = Array.isArray(body.retainedTags) ? body.retainedTags : activeTags;
  return { activeTags, retainedTags };
}

async function closeInactivePushNotifications(retainedTags) {
  if (typeof self.registration.getNotifications !== "function") return;

  const retainedTagSet = new Set(retainedTags.filter((tag) => typeof tag === "string" && tag.length > 0));
  const notifications = await self.registration.getNotifications();
  const alerts = notifications.filter((notification) => isLineWatchPushNotification(notification.tag));
  const inactive = alerts.filter((notification) => !retainedTagSet.has(notification.tag));
  await Promise.all(inactive.map((notification) => notification.close()));
  // A catch-up summary goes once none of the alerts it introduced remain.
  if (inactive.length === alerts.length) {
    await Promise.all(
      notifications
        .filter((notification) => typeof notification.tag === "string" && notification.tag.startsWith(CATCH_UP_SUMMARY_TAG_PREFIX))
        .map((notification) => notification.close()),
    );
  }
}

function isLineWatchPushNotification(tag) {
  if (tag === FALLBACK_PUSH_TAG) return true;
  if (typeof tag !== "string") return false;

  const [category] = tag.split("|");
  return LINEWATCH_PUSH_CATEGORIES.has(category);
}

const NOTIFICATION_OPEN_MESSAGE = "linewatch-notification-open";
const NOTIFICATION_OPEN_ACK_TIMEOUT_MS = 1500;

function notificationTargetUrl(notification) {
  const target = new URL(notification?.data?.url || "/", self.location.origin);
  if (target.origin !== self.location.origin) return "/";
  // Cleared payloads queued before targets carried state keep their meaning on tap.
  if (notification?.data?.state === "CLEARED" && target.search && !target.searchParams.has("state")) {
    target.searchParams.set("state", "cleared");
  }
  return `${target.pathname}${target.search}`;
}

// A tap steers the running app instead of stacking a second window. The dashboard
// resolves the target itself; pages that never acknowledge are navigated instead.
async function openNotificationUrl(url) {
  const targetUrl = new URL(url, self.location.origin);
  const windowClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const appClients = windowClients.filter((client) => new URL(client.url).origin === self.location.origin);
  const client = appClients.find((candidate) => candidate.focused)
    || appClients.find((candidate) => candidate.visibilityState === "visible")
    || appClients[0];

  if (!client) {
    return self.clients.openWindow(targetUrl.href);
  }

  const focusedClient = "focus" in client ? await client.focus().catch(() => client) : client;
  const dashboardClient = new URL(client.url).pathname === "/";
  if (dashboardClient && await postNotificationTarget(focusedClient || client, `${targetUrl.pathname}${targetUrl.search}`)) {
    return focusedClient;
  }
  if ("navigate" in client) {
    const navigated = await client.navigate(targetUrl.href).catch(() => null);
    if (navigated) return navigated;
  }
  return self.clients.openWindow(targetUrl.href);
}

function postNotificationTarget(client, url) {
  if (typeof MessageChannel !== "function" || typeof client?.postMessage !== "function") {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const settle = (acknowledged) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(acknowledged);
    };
    const timeout = setTimeout(() => settle(false), NOTIFICATION_OPEN_ACK_TIMEOUT_MS);
    channel.port1.onmessage = (event) => settle(event.data?.type === `${NOTIFICATION_OPEN_MESSAGE}-ack`);
    try {
      client.postMessage({ type: NOTIFICATION_OPEN_MESSAGE, url }, [channel.port2]);
    } catch {
      settle(false);
    }
  });
}
