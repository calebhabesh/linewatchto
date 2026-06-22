const CACHE_PREFIX = "linewatch-pwa";
const CACHE_VERSION = "v3";
const APP_SHELL_CACHE = `${CACHE_PREFIX}-${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_PREFIX}-${CACHE_VERSION}-static`;
const OFFLINE_URL = "/offline.html";
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

const isDev = new URL(self.location.href).searchParams.get("env") === "dev";

const APP_SHELL_URLS = [
  OFFLINE_URL,
  NOTIFICATION_ICON_URL,
  "/assets/linewatch/pwa/app-icon-512.png",
  "/assets/linewatch/pwa/apple-touch-icon.png",
  "/assets/linewatch/pwa/maskable-app-icon-512.png",
  NOTIFICATION_BADGE_URL,
  "/assets/linewatch/pwa/offline-icon-512.png",
  "/assets/linewatch/logo.svg",
  "/assets/linewatch/ttc-subway-map-edited.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    if (isDev) {
      await self.skipWaiting();
      return;
    }
    const cache = await caches.open(APP_SHELL_CACHE);
    await cache.addAll(APP_SHELL_URLS);
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

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isNextStaticAsset(url)) {
    event.respondWith(networkFirstStatic(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(networkFirstStatic(request));
  }
});

self.addEventListener("push", (event) => {
  event.waitUntil(showPendingPushNotification());
});

self.addEventListener("message", (event) => {
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
  event.waitUntil(openNotificationUrl(event.notification.data?.url || "/"));
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
    return await fetch(request);
  } catch {
    const offlineResponse = await caches.match(OFFLINE_URL);
    return offlineResponse || Response.error();
  }
}

async function networkFirstStatic(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    const cachedResponse = await caches.match(request);
    return cachedResponse || Response.error();
  }
}

async function deleteCaches(cacheNames) {
  await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
}

async function showPendingPushNotification() {
  try {
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
      await showFallbackPushNotification();
      return;
    }

    const body = await response.json();
    const notification = body.notification;
    const activeTags = await reconcilePushNotifications();
    if (!notification) {
      return;
    }
    const notificationState = notification.state === "CLEARED" ? "CLEARED" : "ACTIVE";
    if (
      notificationState !== "CLEARED"
      && Array.isArray(activeTags)
      && !activeTags.includes(notification.tag)
    ) {
      return;
    }

    const options = {
      body: notification.body,
      tag: notification.tag,
      icon: NOTIFICATION_ICON_URL,
      badge: NOTIFICATION_BADGE_URL,
      renotify: false,
      requireInteraction: false,
      data: {
        state: notificationState,
        url: notification.url || "/",
      },
    };
    if (notificationState === "CLEARED") {
      options.silent = true;
    }
    const timestamp = Date.parse(notification.timestamp);
    if (Number.isFinite(timestamp)) {
      options.timestamp = timestamp;
    }

    await self.registration.showNotification(notification.title, options);
  } catch {
    await showFallbackPushNotification();
  }
}

async function showFallbackPushNotification() {
  await self.registration.showNotification("⚠️ LineWatch TO Service Alert", {
    body: "Open LineWatch TO to view the latest service update.",
    tag: FALLBACK_PUSH_TAG,
    icon: NOTIFICATION_ICON_URL,
    badge: NOTIFICATION_BADGE_URL,
    data: {
      url: "/",
    },
  });
}

async function reconcilePushNotifications() {
  try {
    const activeTags = await fetchActivePushNotificationTags();
    if (!activeTags) return null;
    await closeInactivePushNotifications(activeTags);
    return activeTags;
  } catch {
    // Notification cleanup is best-effort; failed cleanup must not hide new alerts.
    return null;
  }
}

async function fetchActivePushNotificationTags() {
  const subscription = await self.registration.pushManager.getSubscription();
  if (!subscription) return [];

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
  return Array.isArray(body.activeTags) ? body.activeTags : [];
}

async function closeInactivePushNotifications(activeTags) {
  if (typeof self.registration.getNotifications !== "function") return;

  const activeTagSet = new Set(activeTags.filter((tag) => typeof tag === "string" && tag.length > 0));
  const notifications = await self.registration.getNotifications();
  await Promise.all(
    notifications
      .filter((notification) => isLineWatchPushNotification(notification.tag) && !activeTagSet.has(notification.tag))
      .map((notification) => notification.close()),
  );
}

function isLineWatchPushNotification(tag) {
  if (tag === FALLBACK_PUSH_TAG) return true;
  if (typeof tag !== "string") return false;

  const [category] = tag.split("|");
  return LINEWATCH_PUSH_CATEGORIES.has(category);
}

async function openNotificationUrl(url) {
  const targetUrl = new URL(url, self.location.origin).href;
  const windowClients = await clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  for (const client of windowClients) {
    if (client.url === targetUrl && "focus" in client) {
      return client.focus();
    }
  }

  return clients.openWindow(targetUrl);
}
