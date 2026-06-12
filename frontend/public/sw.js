const CACHE_PREFIX = "linewatch-pwa";
const CACHE_VERSION = "v2";
const APP_SHELL_CACHE = `${CACHE_PREFIX}-${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_PREFIX}-${CACHE_VERSION}-static`;
const OFFLINE_URL = "/offline.html";

const APP_SHELL_URLS = [
  OFFLINE_URL,
  "/assets/linewatch/pwa/app-icon-192.png",
  "/assets/linewatch/pwa/app-icon-512.png",
  "/assets/linewatch/pwa/apple-touch-icon.png",
  "/assets/linewatch/pwa/maskable-app-icon-512.png",
  "/assets/linewatch/pwa/offline-icon-512.png",
  "/assets/linewatch/logo.svg",
  "/assets/linewatch/ttc-subway-map-edited.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE);
    await cache.addAll(APP_SHELL_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const expectedCaches = new Set([APP_SHELL_CACHE, STATIC_CACHE]);
    const cacheNames = await caches.keys();

    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && !expectedCaches.has(cacheName))
        .map((cacheName) => caches.delete(cacheName)),
    );

    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirstStatic(request));
    event.waitUntil(refreshStaticAsset(request));
  }
});

self.addEventListener("push", (event) => {
  event.waitUntil(showPendingPushNotification());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openNotificationUrl(event.notification.data?.url || "/"));
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/assets/") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/icon.svg"
  );
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const offlineResponse = await caches.match(OFFLINE_URL);
    return offlineResponse || Response.error();
  }
}

async function cacheFirstStatic(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  const networkResponse = await fetch(request);
  if (networkResponse.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, networkResponse.clone());
  }

  return networkResponse;
}

async function refreshStaticAsset(request) {
  try {
    const networkResponse = await fetch(request);
    if (!networkResponse.ok) return;

    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, networkResponse);
  } catch {
    // Static refresh is best-effort. The cached response remains available.
  }
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
    if (!notification) return;

    await self.registration.showNotification(notification.title, {
      body: notification.body,
      tag: notification.tag,
      icon: "/assets/linewatch/pwa/app-icon-192.png",
      badge: "/assets/linewatch/pwa/offline-icon-512.png",
      data: {
        url: notification.url || "/",
      },
    });
  } catch {
    await showFallbackPushNotification();
  }
}

async function showFallbackPushNotification() {
  await self.registration.showNotification("LineWatch TO commute update", {
    body: "Open LineWatch TO to check your saved commute.",
    tag: "linewatch-commute-update",
    icon: "/assets/linewatch/pwa/app-icon-192.png",
    badge: "/assets/linewatch/pwa/offline-icon-512.png",
    data: {
      url: "/",
    },
  });
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
