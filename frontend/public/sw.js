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
const PUSH_IDENTITY_CACHE = "linewatch-push-identity-v1";
const PUSH_IDENTITY_CACHE_KEY = "/__linewatch/push-installation-id";

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
  "/assets/linewatch/ttc-subway-map-custom.svg",
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

  if (isVersionedMapAsset(url)) {
    event.respondWith(cacheFirstMapAsset(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(networkFirstStatic(request));
  }
});

self.addEventListener("push", (event) => {
  event.waitUntil(showPendingPushNotification(event));
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(handlePushSubscriptionChange(event));
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

function isVersionedMapAsset(url) {
  const version = url.searchParams.get("v");
  if (!version || version === "local" || version === "dev") return false;
  return url.pathname === "/assets/linewatch/ttc-subway-map-custom.svg"
    || url.pathname === "/assets/linewatch/regional-rail-map.svg"
    || (url.pathname.startsWith("/assets/linewatch/raster-maps/") && url.pathname.endsWith(".png"));
}

async function cacheFirstMapAsset(request) {
  // Match the complete URL: a new release must never reuse an older map.
  const cachedResponse = await caches.match(request);
  return cachedResponse || networkFirstStatic(request);
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
  };
}

function shouldSkipExpiredNotification(notification) {
  if (notificationStateFor(notification) === "CLEARED") return false;
  const expiresAt = Date.parse(notification.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

async function showPushNotification(notification) {
  const notificationState = notificationStateFor(notification);
  const options = {
    body: notification.body,
    tag: notification.tag,
    icon: NOTIFICATION_ICON_URL,
    badge: NOTIFICATION_BADGE_URL,
    renotify: true,
    requireInteraction: true,
    silent: false,
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

async function handlePushSubscriptionChange(event) {
  try {
    if (event.oldSubscription?.endpoint) {
      await disableChangedPushSubscription(event.oldSubscription.endpoint);
    }

    let subscription = event.newSubscription || await self.registration.pushManager.getSubscription();
    if (!subscription) {
      const config = await fetchPushConfigForSubscriptionRepair();
      if (!config?.webPushAvailable || typeof config.vapidPublicKey !== "string" || config.vapidPublicKey.length === 0) {
        return;
      }
      subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(config.vapidPublicKey),
      });
    }

    const saveResult = await saveChangedPushSubscription(subscription, "subscription-change");
    if (saveResult === "rejected") {
      await subscription.unsubscribe();
      const replacementConfig = await fetchPushConfigForSubscriptionRepair();
      if (!replacementConfig?.webPushAvailable || !replacementConfig.vapidPublicKey) return;
      subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(replacementConfig.vapidPublicKey),
      });
      await saveChangedPushSubscription(subscription, "invalid-endpoint-replacement");
    }
  } catch {
    // Browsers fire pushsubscriptionchange inconsistently. App-open subscription refresh remains the fallback.
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

async function saveChangedPushSubscription(subscription, reason) {
  if (!subscription?.endpoint) return "failed";
  const installationId = await getOrCreatePushInstallationId();
  const response = await fetch("/api/account/push/subscription", {
    method: "PUT",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: pushSubscriptionKeys(subscription),
      userAgent: serviceWorkerUserAgent(),
      reason: typeof reason === "string" && reason.length > 0 ? reason : "service-worker-refresh",
      installationId,
    }),
  });
  if (!response.ok) return "failed";
  const body = await response.json();
  return body?.enabled === false ? "rejected" : "saved";
}

async function disableChangedPushSubscription(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length === 0) return;
  await fetch("/api/account/push/subscription/disable", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ endpoint, reason: "subscription-change" }),
  });
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
