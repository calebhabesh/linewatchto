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
  event.waitUntil(showPendingPushNotification(event));
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
  event.waitUntil((async () => {
    await recordDisplayedNotificationClientEvent(event.notification, "notification_click");
    await openNotificationUrl(event.notification.data?.url || "/");
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

async function showPendingPushNotification(event) {
  try {
    const payloadNotification = notificationFromPushPayload(event);
    if (payloadNotification) {
      await showTrackedPushNotification(payloadNotification);
      await acknowledgeDisplayedPushNotification(payloadNotification);
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
      if (!shouldShowPendingNotification(notification, pendingNotifications, tagState)) {
        await recordPushClientEvent(notification, "pending_skipped");
        continue;
      }

      await showTrackedPushNotification(notification);
      await acknowledgeDisplayedPushNotification(notification);
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
  };
}

async function showPushNotification(notification) {
  const notificationState = notificationStateFor(notification);
  const options = {
    body: notification.body,
    tag: notification.tag,
    icon: NOTIFICATION_ICON_URL,
    badge: NOTIFICATION_BADGE_URL,
    renotify: false,
    requireInteraction: true,
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
}

async function showTrackedPushNotification(notification) {
  const receiptEvent = recordPushClientEvent(notification, "push_received");
  try {
    await showPushNotification(notification);
  } catch (error) {
    await Promise.allSettled([
      receiptEvent,
      recordPushClientEvent(notification, "show_failed", clientEventErrorMessage(error)),
    ]);
    throw error;
  }
  await receiptEvent;
}

async function acknowledgeDisplayedPushNotification(notification) {
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
  }, stage);
}

async function recordPushClientEvent(notification, stage, message) {
  try {
    if (!notification || !isLineWatchPushNotification(notification.tag)) return;
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
    data: {
      url: "/",
    },
  });
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
  await Promise.all(
    notifications
      .filter((notification) => isLineWatchPushNotification(notification.tag) && !retainedTagSet.has(notification.tag))
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
