import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";

import manifest from "../src/app/manifest.ts";

const layoutSource = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
const nextConfigSource = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
const registrationSource = readFileSync(
  new URL("../src/components/PwaServiceWorkerRegistration.tsx", import.meta.url),
  "utf8",
);
const serviceWorkerSource = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const offlinePageSource = readFileSync(new URL("../public/offline.html", import.meta.url), "utf8");
const appUpdateBannerUrl = new URL("../src/components/AppUpdateBanner.tsx", import.meta.url);
const appUpdatePageUrl = new URL("../public/app-update.html", import.meta.url);
const localAppResetUrl = new URL("../src/app/local-app-reset.ts", import.meta.url);
const versionRouteUrl = new URL("../src/app/version.json/route.ts", import.meta.url);
const devResetPageUrl = new URL("../public/dev-reset.html", import.meta.url);
const prodBuildPushSource = readFileSync(new URL("../../scripts/prod-build-push.sh", import.meta.url), "utf8");

const iconSpecs = [
  {
    path: "../public/assets/linewatch/pwa/app-icon-192.png",
    expectedWidth: 192,
    expectedHeight: 192,
  },
  {
    path: "../public/assets/linewatch/pwa/app-icon-512.png",
    expectedWidth: 512,
    expectedHeight: 512,
  },
  {
    path: "../public/assets/linewatch/pwa/apple-touch-icon.png",
    expectedWidth: 180,
    expectedHeight: 180,
  },
  {
    path: "../public/assets/linewatch/pwa/maskable-app-icon-512.png",
    expectedWidth: 512,
    expectedHeight: 512,
  },
  {
    path: "../public/assets/linewatch/pwa/offline-icon-512.png",
    expectedWidth: 512,
    expectedHeight: 512,
  },
  {
    path: "../public/assets/linewatch/pwa/notification-badge-96.png",
    expectedWidth: 96,
    expectedHeight: 96,
  },
];

function withEnvValue(key, value, callback) {
  const previous = process.env[key];

  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }

  try {
    return callback();
  } finally {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
}

function readPngDimensions(url) {
  const buffer = readFileSync(url);
  const pngSignature = "89504e470d0a1a0a";

  assert.equal(buffer.subarray(0, 8).toString("hex"), pngSignature);

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function serviceWorkerInstall(locationUrl = "https://linewatch.test/sw.js") {
  const listeners = new Map();
  const waitUntilPromises = [];
  const cachedUrls = [];
  let skipWaitingCalls = 0;
  const context = {
    URL,
    Promise,
    Response: {
      error: () => ({ source: "response-error" }),
    },
    caches: {
      keys: async () => [],
      delete: async () => true,
      match: async () => undefined,
      open: async () => ({
        addAll: async (urls) => {
          cachedUrls.push(...urls);
        },
        put: async () => undefined,
      }),
    },
    fetch: async () => undefined,
    self: {
      location: new URL(locationUrl),
      addEventListener: (type, listener) => {
        listeners.set(type, listener);
      },
      skipWaiting: async () => {
        skipWaitingCalls += 1;
      },
      clients: {
        claim: async () => undefined,
        matchAll: async () => [],
        openWindow: async () => undefined,
      },
      registration: {
        pushManager: {
          getSubscription: async () => null,
        },
        showNotification: async () => undefined,
      },
    },
  };

  runInNewContext(serviceWorkerSource, context, { filename: "sw.js" });

  const installListener = listeners.get("install");
  assert.equal(typeof installListener, "function");

  installListener({
    waitUntil: (promise) => {
      waitUntilPromises.push(Promise.resolve(promise));
    },
  });
  await Promise.all(waitUntilPromises);

  return { cachedUrls, skipWaitingCalls };
}

async function serviceWorkerSkipWaitingMessage() {
  const listeners = new Map();
  const waitUntilPromises = [];
  let skipWaitingCalls = 0;
  const context = {
    URL,
    Promise,
    Response: {
      error: () => ({ source: "response-error" }),
    },
    caches: {
      keys: async () => [],
      delete: async () => true,
      match: async () => undefined,
      open: async () => ({
        addAll: async () => undefined,
        put: async () => undefined,
      }),
    },
    fetch: async () => undefined,
    self: {
      location: new URL("https://linewatch.test/sw.js"),
      addEventListener: (type, listener) => {
        listeners.set(type, listener);
      },
      skipWaiting: async () => {
        skipWaitingCalls += 1;
      },
      clients: {
        claim: async () => undefined,
        matchAll: async () => [],
        openWindow: async () => undefined,
      },
      registration: {
        pushManager: {
          getSubscription: async () => null,
        },
        showNotification: async () => undefined,
      },
    },
  };

  runInNewContext(serviceWorkerSource, context, { filename: "sw.js" });

  const messageListener = listeners.get("message");
  assert.equal(typeof messageListener, "function");

  messageListener({
    data: {
      type: "linewatch-skip-waiting",
    },
    waitUntil: (promise) => {
      waitUntilPromises.push(Promise.resolve(promise));
    },
  });
  await Promise.all(waitUntilPromises);

  return { skipWaitingCalls };
}

async function serviceWorkerFetch(requestUrl, { cachedResponse, networkResponse }, locationUrl = "https://linewatch.test/sw.js") {
  const listeners = new Map();
  const waitUntilPromises = [];
  const cacheWrites = [];
  const context = {
    URL,
    Promise,
    Response: {
      error: () => ({ source: "response-error" }),
    },
    caches: {
      keys: async () => [],
      delete: async () => true,
      match: async () => cachedResponse,
      open: async () => ({
        addAll: async () => undefined,
        put: async (_request, response) => {
          cacheWrites.push(response);
        },
      }),
    },
    fetch: async () => networkResponse,
    self: {
      location: new URL(locationUrl),
      addEventListener: (type, listener) => {
        listeners.set(type, listener);
      },
      skipWaiting: async () => undefined,
      clients: {
        claim: async () => undefined,
        matchAll: async () => [],
        openWindow: async () => undefined,
      },
      registration: {
        pushManager: {
          getSubscription: async () => null,
        },
        showNotification: async () => undefined,
      },
    },
  };

  runInNewContext(serviceWorkerSource, context, { filename: "sw.js" });

  const fetchListener = listeners.get("fetch");
  assert.equal(typeof fetchListener, "function");

  const event = {
    request: {
      method: "GET",
      mode: "no-cors",
      url: requestUrl,
    },
    respondWith: (responsePromise) => {
      event.responsePromise = Promise.resolve(responsePromise);
    },
    waitUntil: (promise) => {
      waitUntilPromises.push(Promise.resolve(promise));
    },
  };

  fetchListener(event);

  const response = await event.responsePromise;
  await Promise.all(waitUntilPromises);

  return { response, cacheWrites };
}

async function serviceWorkerPush({
  fetchOk = true,
  fetchStatus = fetchOk ? 200 : 503,
  fetchBody = {
    notification: {
      title: "⚠️ Line 1 Yonge-University Reduced Speed Zone",
      body: "Glencairn to Lawrence West.\nAffects Work (Outbound).\n🕗 Jun 5, 10:20 AM",
      url: "/?panel=commutes&commute=commute_1",
      tag: "saved-commute-impact|commute_1|dedupe-1|active",
      state: "ACTIVE",
      timestamp: "2026-06-05T15:00:00Z",
    },
    activeTags: ["saved-commute-impact|commute_1|dedupe-1|active"],
    retainedTags: ["saved-commute-impact|commute_1|dedupe-1|active"],
  },
  existingNotifications = [],
  pushData = null,
  showNotificationError = null,
} = {}) {
  const listeners = new Map();
  const waitUntilPromises = [];
  const fetchRequests = [];
  const shownNotifications = [];
  const operationLog = [];
  let showNotificationCalls = 0;
  const clients = {
    claim: async () => undefined,
    matchAll: async () => [],
    openWindow: async () => undefined,
  };
  const context = {
    URL,
    Promise,
    Response: {
      error: () => ({ source: "response-error" }),
    },
    caches: {
      keys: async () => [],
      delete: async () => true,
      match: async () => undefined,
      open: async () => ({
        addAll: async () => undefined,
        put: async () => undefined,
      }),
    },
    fetch: async (url, options) => {
      operationLog.push(`fetch:${url}`);
      fetchRequests.push({ url, options });
      return {
        ok: fetchOk,
        status: fetchStatus,
        json: async () => fetchBody,
      };
    },
    self: {
      location: new URL("https://linewatch.test/sw.js"),
      addEventListener: (type, listener) => {
        listeners.set(type, listener);
      },
      skipWaiting: async () => undefined,
      clients,
      registration: {
        getNotifications: async () => existingNotifications,
        pushManager: {
          getSubscription: async () => ({
            endpoint: "https://fcm.googleapis.com/fcm/send/subscription",
          }),
        },
        showNotification: async (title, options) => {
          operationLog.push("show-notification");
          showNotificationCalls += 1;
          if (showNotificationError && showNotificationCalls === 1) {
            throw showNotificationError;
          }
          shownNotifications.push({ title, options });
        },
      },
    },
    clients,
  };

  runInNewContext(serviceWorkerSource, context, { filename: "sw.js" });

  const pushListener = listeners.get("push");
  assert.equal(typeof pushListener, "function");

  const event = {
    waitUntil: (promise) => {
      waitUntilPromises.push(Promise.resolve(promise));
    },
  };
  if (pushData !== null) {
    event.data = {
      json: () => pushData,
      text: () => JSON.stringify(pushData),
    };
  }

  pushListener(event);
  await Promise.all(waitUntilPromises);

  return { fetchRequests, shownNotifications, listeners, operationLog };
}

function clientEventRequests(fetchRequests) {
  return fetchRequests
    .filter((request) => request.url === "/api/account/push/client-event")
    .map((request) => JSON.parse(request.options.body));
}

function fakePushSubscription(endpoint) {
  return {
    endpoint,
    toJSON: () => ({
      keys: {
        p256dh: `${endpoint}-p256dh`,
        auth: `${endpoint}-auth`,
      },
    }),
  };
}

async function serviceWorkerPushSubscriptionChange({
  oldSubscription = fakePushSubscription("https://fcm.googleapis.com/fcm/send/old-subscription"),
  newSubscription = null,
  subscribeResult = fakePushSubscription("https://fcm.googleapis.com/fcm/send/new-subscription"),
  configBody = {
    webPushAvailable: true,
    vapidPublicKey: "AQIDBA",
  },
} = {}) {
  const listeners = new Map();
  const fetchRequests = [];
  const subscribeCalls = [];
  let identityResponse = null;
  const context = {
    URL,
    Promise,
    Response: globalThis.Response,
    Uint8Array,
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
    caches: {
      keys: async () => [],
      delete: async () => true,
      match: async () => undefined,
      open: async () => ({
        addAll: async () => undefined,
        match: async () => identityResponse,
        put: async (_key, response) => {
          identityResponse = response;
        },
      }),
    },
    fetch: async (url, options = {}) => {
      fetchRequests.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => configBody,
      };
    },
    self: {
      location: new URL("https://linewatch.test/sw.js"),
      crypto: {
        randomUUID: () => "6d0e67af-4971-4e9c-98a2-c0b3dc6cf324",
      },
      addEventListener: (type, listener) => {
        listeners.set(type, listener);
      },
      skipWaiting: async () => undefined,
      clients: {
        claim: async () => undefined,
        matchAll: async () => [],
        openWindow: async () => undefined,
      },
      registration: {
        pushManager: {
          getSubscription: async () => null,
          subscribe: async (options) => {
            subscribeCalls.push(options);
            return subscribeResult;
          },
        },
        showNotification: async () => undefined,
      },
    },
  };

  runInNewContext(serviceWorkerSource, context, { filename: "sw.js" });

  const subscriptionChangeListener = listeners.get("pushsubscriptionchange");
  assert.equal(typeof subscriptionChangeListener, "function");

  const waitUntilPromises = [];
  subscriptionChangeListener({
    oldSubscription,
    newSubscription,
    waitUntil: (promise) => {
      waitUntilPromises.push(Promise.resolve(promise));
    },
  });
  await Promise.all(waitUntilPromises);

  return { fetchRequests, subscribeCalls };
}

async function serviceWorkerMessage({
  fetchBody = {
    activeTags: ["saved-commute-impact|commute_1|dedupe-1|active"],
    retainedTags: ["saved-commute-impact|commute_1|dedupe-1|active"],
  },
  existingNotifications = [],
} = {}) {
  const listeners = new Map();
  const fetchRequests = [];
  const shownNotifications = [];
  const context = {
    URL,
    Promise,
    Response: {
      error: () => ({ source: "response-error" }),
    },
    caches: {
      keys: async () => [],
      delete: async () => true,
      match: async () => undefined,
      open: async () => ({
        addAll: async () => undefined,
        put: async () => undefined,
      }),
    },
    fetch: async (url, options) => {
      fetchRequests.push({ url, options });
      return {
        ok: true,
        json: async () => fetchBody,
      };
    },
    self: {
      location: new URL("https://linewatch.test/sw.js"),
      addEventListener: (type, listener) => {
        listeners.set(type, listener);
      },
      skipWaiting: async () => undefined,
      clients: {
        claim: async () => undefined,
        matchAll: async () => [],
        openWindow: async () => undefined,
      },
      registration: {
        getNotifications: async () => existingNotifications,
        pushManager: {
          getSubscription: async () => ({
            endpoint: "https://fcm.googleapis.com/fcm/send/subscription",
          }),
        },
        showNotification: async (title, options) => {
          shownNotifications.push({ title, options });
        },
      },
    },
  };

  runInNewContext(serviceWorkerSource, context, { filename: "sw.js" });

  const messageListener = listeners.get("message");
  assert.equal(typeof messageListener, "function");

  const waitUntilPromises = [];
  messageListener({
    data: {
      type: "linewatch-cleanup-notifications",
    },
    waitUntil: (promise) => {
      waitUntilPromises.push(Promise.resolve(promise));
    },
  });
  await Promise.all(waitUntilPromises);

  return { fetchRequests, shownNotifications };
}

describe("LineWatch PWA configuration", () => {
  it("defines an installable standalone web app manifest", () => {
    const webManifest = manifest();

    assert.equal(webManifest.id, "/");
    assert.equal(webManifest.name, "LineWatchTO");
    assert.equal(webManifest.short_name, "LineWatch");
    assert.equal(
      webManifest.description,
      "Unofficial TTC reliability dashboard for Toronto subway and LRT riders.",
    );
    assert.equal(webManifest.start_url, "/");
    assert.equal(webManifest.scope, "/");
    assert.equal(webManifest.display, "standalone");
    assert.equal(webManifest.orientation, "portrait");
    assert.equal(webManifest.background_color, "#0d0808");
    assert.equal(webManifest.theme_color, "#0d0808");
    assert.equal(webManifest.lang, "en-CA");
    assert.deepEqual(webManifest.categories, ["navigation", "travel", "utilities"]);
    assert.equal(webManifest.prefer_related_applications, false);
    assert.deepEqual(webManifest.related_applications, [
      {
        platform: "webapp",
        url: "/manifest.webmanifest",
        id: "/",
      },
    ]);
    assert.deepEqual(webManifest.icons, [
      {
        src: "/assets/linewatch/pwa/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/assets/linewatch/pwa/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/assets/linewatch/pwa/maskable-app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ]);
  });

  it("labels non-production browser metadata from the configured instance label", () => {
    withEnvValue("NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL", "Staging", () => {
      const webManifest = manifest();

      assert.equal(webManifest.name, "LineWatchTO Staging");
    });

    assert.match(layoutSource, /lineWatchAppTitle/);
    assert.match(layoutSource, /applicationName:\s*lineWatchAppTitle/);
    assert.match(layoutSource, /default:\s*lineWatchAppTitle/);
    assert.match(layoutSource, /template:\s*`%s \| \$\{lineWatchAppTitle\}`/);
    assert.match(layoutSource, /title:\s*lineWatchAppTitle/);
  });

  it("ships PWA icons with the expected PNG dimensions", () => {
    for (const icon of iconSpecs) {
      const iconUrl = new URL(icon.path, import.meta.url);

      assert.equal(existsSync(iconUrl), true, `${icon.path} should exist`);
      assert.deepEqual(readPngDimensions(iconUrl), {
        width: icon.expectedWidth,
        height: icon.expectedHeight,
      });
    }
  });

  it("adds mobile install metadata and safe viewport settings", () => {
    assert.match(layoutSource, /applicationName:\s*lineWatchAppTitle/);
    assert.match(layoutSource, /appleWebApp:\s*\{/);
    assert.match(layoutSource, /capable:\s*true/);
    assert.match(layoutSource, /title:\s*lineWatchAppTitle/);
    assert.match(layoutSource, /statusBarStyle:\s*"black-translucent"/);
    assert.match(layoutSource, /formatDetection:\s*\{[\s\S]*telephone:\s*false/);
    assert.match(layoutSource, /export const viewport/);
    assert.match(layoutSource, /viewportFit:\s*"cover"/);
    assert.match(layoutSource, /themeColor:\s*\[/);
    assert.match(layoutSource, /colorScheme:\s*"dark light"/);
    assert.match(layoutSource, /<PwaServiceWorkerRegistration \/>/);
  });

  it("registers the service worker with root scope and fresh update checks", () => {
    assert.match(registrationSource, /"use client"/);
    assert.match(registrationSource, /navigator\.serviceWorker\.register\(`\/sw\.js\$\{devFlag\}`/);
    assert.match(registrationSource, /scope:\s*"\/"/);
    assert.match(registrationSource, /updateViaCache:\s*"none"/);
    assert.match(registrationSource, /process\.env\.NODE_ENV !== "production"/);
    assert.match(registrationSource, /NEXT_PUBLIC_LINEWATCH_ENABLE_SW/);
    assert.match(registrationSource, /unregisterServiceWorkersWithoutPushSubscriptions/);
    assert.match(registrationSource, /linewatch-cleanup-notifications/);
  });

  it("uses a conservative service worker cache policy", () => {
    assert.match(serviceWorkerSource, /const CACHE_VERSION = "v3"/);
    assert.match(serviceWorkerSource, /const OFFLINE_URL = "\/offline\.html"/);
    assert.match(serviceWorkerSource, /APP_SHELL_URLS/);
    assert.match(serviceWorkerSource, /\/assets\/linewatch\/pwa\/offline-icon-512\.png/);
    assert.match(serviceWorkerSource, /event\.request\.mode === "navigate"/);
    assert.match(serviceWorkerSource, /caches\.match\(OFFLINE_URL\)/);
    assert.match(serviceWorkerSource, /url\.pathname\.startsWith\("\/api\/"\)/);
    assert.match(serviceWorkerSource, /event\.respondWith\(fetch\(request\)\)/);
    assert.match(serviceWorkerSource, /url\.pathname\.startsWith\("\/_next\/static\/"\)/);
    assert.match(serviceWorkerSource, /url\.pathname\.startsWith\("\/assets\/"\)/);
  });

  it("keeps production service worker activation user-controlled", async () => {
    const productionInstall = await serviceWorkerInstall();
    assert.equal(productionInstall.skipWaitingCalls, 0);
    assert.ok(productionInstall.cachedUrls.includes("/offline.html"));

    const devInstall = await serviceWorkerInstall("https://linewatch.test/sw.js?env=dev");
    assert.equal(devInstall.skipWaitingCalls, 1);
    assert.equal(devInstall.cachedUrls.length, 0);

    const explicitUpdate = await serviceWorkerSkipWaitingMessage();
    assert.equal(explicitUpdate.skipWaitingCalls, 1);
  });

  it("fetches Next static chunks from the network before cached copies", async () => {
    const cachedResponse = {
      ok: true,
      source: "cache",
      clone: () => cachedResponse,
    };
    const networkResponse = {
      ok: true,
      source: "network",
      clone: () => networkResponse,
    };

    const { response } = await serviceWorkerFetch(
      "https://linewatch.test/_next/static/chunks/app/page.js",
      { cachedResponse, networkResponse },
    );

    assert.equal(response.source, "network");
  });

  it("fetches stable public assets from the network before cached copies", async () => {
    const cachedResponse = {
      ok: true,
      source: "cache",
      clone: () => cachedResponse,
    };
    const networkResponse = {
      ok: true,
      source: "network",
      clone: () => networkResponse,
    };

    const { response } = await serviceWorkerFetch(
      "https://linewatch.test/assets/linewatch/logo.svg",
      { cachedResponse, networkResponse },
    );

    assert.equal(response.source, "network");
  });

  it("bypasses caching entirely in development mode", async () => {
    const cachedResponse = {
      ok: true,
      source: "cache",
      clone: () => cachedResponse,
    };
    const networkResponse = {
      ok: true,
      source: "network",
      clone: () => networkResponse,
    };

    const { response } = await serviceWorkerFetch(
      "https://linewatch.test/_next/static/chunks/app/page.js",
      { cachedResponse, networkResponse },
      "https://linewatch.test/sw.js?env=dev"
    );

    assert.equal(response, undefined);
  });

  it("handles Web Push notifications without caching service data", () => {
    assert.match(serviceWorkerSource, /self\.addEventListener\("push"/);
    assert.match(serviceWorkerSource, /registration\.pushManager\.getSubscription\(\)/);
    assert.match(serviceWorkerSource, /\/api\/account\/push\/latest/);
    assert.match(serviceWorkerSource, /credentials:\s*"include"/);
    assert.match(serviceWorkerSource, /self\.registration\.showNotification/);
    assert.match(serviceWorkerSource, /self\.addEventListener\("notificationclick"/);
    assert.match(serviceWorkerSource, /self\.addEventListener\("pushsubscriptionchange"/);
    assert.match(serviceWorkerSource, /clients\.openWindow/);
    assert.match(serviceWorkerSource, /line-current/);
    assert.match(serviceWorkerSource, /line-planned/);
    assert.match(serviceWorkerSource, /saved-commute-current/);
    assert.match(serviceWorkerSource, /\/api\/account\/push\/active/);
  });

  it("shows commute push notifications with the Android badge and the app icon", async () => {
    const { fetchRequests, shownNotifications } = await serviceWorkerPush();

    assert.equal(fetchRequests[0].url, "/api/account/push/latest");
    assert.equal(fetchRequests[1].url, "/api/account/push/active");
    const displayedRequest = fetchRequests.find((request) => request.url === "/api/account/push/displayed");
    assert.ok(displayedRequest);
    assert.equal(JSON.parse(displayedRequest.options.body).endpoint, "https://fcm.googleapis.com/fcm/send/subscription");
    assert.equal(JSON.parse(displayedRequest.options.body).tag, "saved-commute-impact|commute_1|dedupe-1|active");
    assert.equal(shownNotifications.length, 1);
    assert.equal(
      shownNotifications[0].title,
      "⚠️ Line 1 Yonge-University Reduced Speed Zone",
    );
    assert.equal(
      shownNotifications[0].options.body,
      "Glencairn to Lawrence West.\nAffects Work (Outbound).\n🕗 Jun 5, 10:20 AM",
    );
    assert.equal(shownNotifications[0].options.tag, "saved-commute-impact|commute_1|dedupe-1|active");
    assert.equal(shownNotifications[0].options.requireInteraction, true);
    assert.equal(
      shownNotifications[0].options.icon,
      "/assets/linewatch/pwa/app-icon-192.png",
    );
    assert.equal(shownNotifications[0].options.badge, "/assets/linewatch/pwa/notification-badge-96.png");
  });

  it("shows encrypted payload push notifications before fetching pending notifications", async () => {
    const { fetchRequests, shownNotifications, operationLog } = await serviceWorkerPush({
      pushData: {
        title: "⚠️ Line 1 Yonge-University Delay",
        body: "Finch to Union.\nAffects Morning commute (Outbound).\n🕗 Jun 5, 10:20 AM",
        url: "/?panel=commutes&commute=commute_1",
        tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
        state: "ACTIVE",
        timestamp: "2026-06-05T15:00:00Z",
      },
    });

    assert.equal(shownNotifications.length, 1);
    assert.equal(shownNotifications[0].title, "⚠️ Line 1 Yonge-University Delay");
    assert.equal(
      shownNotifications[0].options.body,
      "Finch to Union.\nAffects Morning commute (Outbound).\n🕗 Jun 5, 10:20 AM",
    );
    assert.equal(shownNotifications[0].options.tag, "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active");
    assert.equal(shownNotifications[0].options.data.url, "/?panel=commutes&commute=commute_1");
    assert.deepEqual(clientEventRequests(fetchRequests)[0], {
      endpoint: "https://fcm.googleapis.com/fcm/send/subscription",
      tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
      stage: "push_received",
    });
    assert.notEqual(fetchRequests[0]?.url, "/api/account/push/latest");
    assert.ok(
      operationLog.indexOf("show-notification") < operationLog.indexOf("fetch:/api/account/push/client-event"),
      "the notification display call should happen before receipt telemetry",
    );
  });

  it("shows a generic fallback for expired active payload push notifications", async () => {
    const { fetchRequests, shownNotifications } = await serviceWorkerPush({
      pushData: {
        title: "⚠️ Line 1 Yonge-University Delay",
        body: "Finch to Union.\nAffects Morning commute (Outbound).\n🕗 Jun 5, 10:20 AM",
        url: "/?panel=commutes&commute=commute_1",
        tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
        state: "ACTIVE",
        timestamp: "2026-06-05T14:20:00Z",
        sentAt: "2026-06-05T15:00:00Z",
        expiresAt: "2020-01-01T00:00:00Z",
      },
    });

    assert.equal(shownNotifications.length, 1);
    assert.equal(shownNotifications[0].title, "⚠️ LineWatchTO Service Alert");
    assert.equal(
      shownNotifications[0].options.body,
      "Open LineWatchTO to view the latest service update.",
    );
    assert.equal(
      clientEventRequests(fetchRequests).some((request) => (
        request.tag === "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active"
        && request.stage === "pending_skipped"
        && request.message === "expired active payload"
      )),
      true,
    );
    assert.equal(
      clientEventRequests(fetchRequests).some((request) => (
        request.tag === "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active"
        && request.stage === "fallback_shown"
        && request.message === "expired active payload"
      )),
      true,
    );
    const displayedRequest = fetchRequests.find((request) => request.url === "/api/account/push/displayed");
    assert.ok(displayedRequest);
    assert.equal(JSON.parse(displayedRequest.options.body).tag, "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active");
    assert.notEqual(fetchRequests[0]?.url, "/api/account/push/latest");
  });

  it("repairs rotated push subscriptions from the service worker", async () => {
    const { fetchRequests, subscribeCalls } = await serviceWorkerPushSubscriptionChange();

    assert.equal(fetchRequests[0].url, "/api/account/push/subscription/disable");
    assert.equal(
      JSON.parse(fetchRequests[0].options.body).endpoint,
      "https://fcm.googleapis.com/fcm/send/old-subscription",
    );
    assert.equal(fetchRequests[1].url, "/api/account/push/config");
    assert.equal(fetchRequests[2].url, "/api/account/push/subscription");
    assert.equal(
      JSON.parse(fetchRequests[2].options.body).endpoint,
      "https://fcm.googleapis.com/fcm/send/new-subscription",
    );
    assert.equal(JSON.parse(fetchRequests[2].options.body).keys.p256dh, "https://fcm.googleapis.com/fcm/send/new-subscription-p256dh");
    assert.equal(
      JSON.parse(fetchRequests[2].options.body).installationId,
      "6d0e67af-4971-4e9c-98a2-c0b3dc6cf324",
    );
    assert.equal(subscribeCalls.length, 1);
    assert.equal(subscribeCalls[0].userVisibleOnly, true);
    assert.equal(subscribeCalls[0].applicationServerKey instanceof Uint8Array, true);
  });

  it("keeps payload push notifications visible when display acknowledgement fails", async () => {
    const { fetchRequests, shownNotifications } = await serviceWorkerPush({
      fetchOk: false,
      fetchStatus: 401,
      pushData: {
        title: "⚠️ Line 1 Yonge-University Delay",
        body: "Finch to Union.\nAffects Morning commute (Outbound).\n🕗 Jun 5, 10:20 AM",
        url: "/?panel=commutes&commute=commute_1",
        tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
        state: "ACTIVE",
        timestamp: "2026-06-05T15:00:00Z",
      },
    });

    assert.equal(shownNotifications.length, 1);
    assert.equal(shownNotifications[0].title, "⚠️ Line 1 Yonge-University Delay");
    assert.equal(
      clientEventRequests(fetchRequests).some((request) => (
        request.tag === "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active"
        && request.stage === "ack_failed"
      )),
      true,
    );
  });

  it("records display API failures before showing the controlled fallback", async () => {
    const { fetchRequests, shownNotifications } = await serviceWorkerPush({
      showNotificationError: new Error("display failed"),
      pushData: {
        title: "⚠️ Line 1 Yonge-University Delay",
        body: "Finch to Union.\nAffects Morning commute (Outbound).\n🕗 Jun 5, 10:20 AM",
        url: "/?panel=commutes&commute=commute_1",
        tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
        state: "ACTIVE",
        timestamp: "2026-06-05T15:00:00Z",
      },
    });

    assert.equal(shownNotifications.length, 1);
    assert.equal(shownNotifications[0].title, "⚠️ LineWatchTO Service Alert");
    assert.equal(
      clientEventRequests(fetchRequests).some((request) => (
        request.tag === "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active"
        && request.stage === "show_failed"
        && request.message === "display failed"
      )),
      true,
    );
  });

  it("shows active and cleared lifecycle notifications as separate browser notifications", async () => {
    const { shownNotifications } = await serviceWorkerPush({
      fetchBody: {
        notification: {
          title: "✅ Line 1 Yonge-University Delay Cleared",
          body: "Service between Finch and Union stations has resumed.\n🕗 Jun 5, 11:00 AM",
          url: "/",
          tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared",
          state: "CLEARED",
          timestamp: "2026-06-05T15:20:00Z",
        },
        notifications: [
          {
            title: "⚠️ Line 1 Yonge-University Delay",
            body: "Finch to Union.\n🕗 Jun 5, 10:20 AM",
            url: "/?panel=commutes&commute=commute_1",
            tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
            state: "ACTIVE",
            timestamp: "2026-06-05T15:00:00Z",
          },
          {
            title: "✅ Line 1 Yonge-University Delay Cleared",
            body: "Service between Finch and Union stations has resumed.\n🕗 Jun 5, 11:00 AM",
            url: "/",
            tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared",
            state: "CLEARED",
            timestamp: "2026-06-05T15:20:00Z",
          },
        ],
        activeTags: [],
        retainedTags: [
          "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
          "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared",
        ],
      },
    });

    assert.equal(shownNotifications.length, 2);
    assert.equal(shownNotifications[0].options.tag, "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active");
    assert.equal(shownNotifications[1].options.tag, "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared");
    assert.equal(shownNotifications[0].options.renotify, true);
    assert.equal(shownNotifications[0].options.silent, false);
    assert.equal(shownNotifications[1].options.renotify, true);
    assert.equal(shownNotifications[1].options.silent, false);
  });

  it("closes stale saved-commute notifications when the backend has no active matching tag", async () => {
    const staleNotification = {
      tag: "saved-commute-impact|commute_1|old-dedupe",
      closed: false,
      close() {
        this.closed = true;
      },
    };
    const activeNotification = {
      tag: "saved-commute-impact|commute_1|dedupe-1|active",
      closed: false,
      close() {
        this.closed = true;
      },
    };

    const { fetchRequests } = await serviceWorkerPush({
      existingNotifications: [staleNotification, activeNotification],
    });

    assert.equal(fetchRequests[1].url, "/api/account/push/active");
    assert.equal(staleNotification.closed, true);
    assert.equal(activeNotification.closed, false);
  });

  it("does not close notifications when backend cleanup is not allowed", async () => {
    const staleNotification = {
      tag: "saved-commute-impact|commute_1|old-dedupe",
      closed: false,
      close() {
        this.closed = true;
      },
    };

    const { fetchRequests } = await serviceWorkerPush({
      fetchBody: {
        notification: null,
        activeTags: [],
        retainedTags: [],
        cleanupAllowed: false,
      },
      existingNotifications: [staleNotification],
    });

    assert.equal(fetchRequests[1].url, "/api/account/push/active");
    assert.equal(staleNotification.closed, false);
  });

  it("keeps displayed cleared notifications while the backend retains the tag", async () => {
    const clearedNotification = {
      tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared",
      closed: false,
      close() {
        this.closed = true;
      },
    };

    const { fetchRequests } = await serviceWorkerMessage({
      fetchBody: {
        activeTags: [],
        retainedTags: ["saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared"],
      },
      existingNotifications: [clearedNotification],
    });

    assert.equal(fetchRequests.at(-1).url, "/api/account/push/active");
    assert.equal(clearedNotification.closed, false);
  });

  it("closes cleared notifications after the backend retention window expires", async () => {
    const expiredClearedNotification = {
      tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared",
      closed: false,
      close() {
        this.closed = true;
      },
    };

    const { fetchRequests } = await serviceWorkerMessage({
      fetchBody: {
        activeTags: [],
        retainedTags: [],
      },
      existingNotifications: [expiredClearedNotification],
    });

    assert.equal(fetchRequests.at(-1).url, "/api/account/push/active");
    assert.equal(expiredClearedNotification.closed, true);
  });

  it("does not show a stale active notification just because a cleared tag is retained", async () => {
    const { fetchRequests, shownNotifications } = await serviceWorkerPush({
      fetchBody: {
        notification: {
          title: "⚠️ Line 1 Yonge-University Delay",
          body: "Finch to Union.\n🕗 Jun 5, 10:20 AM",
          url: "/?panel=commutes&commute=commute_1",
          tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
          state: "ACTIVE",
          timestamp: "2026-06-05T15:00:00Z",
        },
        activeTags: [],
        retainedTags: ["saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared"],
      },
    });

    assert.equal(shownNotifications.length, 0);
    assert.equal(
      clientEventRequests(fetchRequests).some((request) => (
        request.tag === "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active"
        && request.stage === "pending_skipped"
      )),
      true,
    );
  });

  it("allows a pending active notification when the same batch also contains its clearance", async () => {
    const { shownNotifications } = await serviceWorkerPush({
      fetchBody: {
        notification: null,
        notifications: [
          {
            title: "⚠️ Line 1 Yonge-University Delay",
            body: "Finch to Union.\n🕗 Jun 5, 10:20 AM",
            url: "/?panel=commutes&commute=commute_1",
            tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
            state: "ACTIVE",
            timestamp: "2026-06-05T15:00:00Z",
          },
          {
            title: "✅ Line 1 Yonge-University Delay Cleared",
            body: "Service between Finch and Union stations has resumed.\n🕗 Jun 5, 11:00 AM",
            url: "/",
            tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared",
            state: "CLEARED",
            timestamp: "2026-06-05T15:20:00Z",
          },
        ],
        activeTags: [],
        retainedTags: [
          "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
          "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared",
        ],
      },
    });

    assert.equal(shownNotifications.length, 2);
  });

  it("does not show a stale active notification or generic fallback", async () => {
    const { shownNotifications } = await serviceWorkerPush({
      fetchBody: {
        notification: {
          title: "⚠️ Line 1 Yonge-University Reduced Speed Zone",
          body: "Glencairn to Lawrence West.\nAffects Work (Outbound).\n🕗 Jun 5, 10:20 AM",
          url: "/?panel=commutes&commute=commute_1",
          tag: "saved-commute-impact|commute_1|resolved-dedupe",
        },
        activeTags: [],
      },
    });

    assert.equal(shownNotifications.length, 0);
  });

  it("does not show a generic fallback when there is no pending notification", async () => {
    const { shownNotifications } = await serviceWorkerPush({
      fetchBody: {
        notification: null,
        activeTags: [],
      },
    });

    assert.equal(shownNotifications.length, 0);
  });

  it("shows the controlled fallback only when the pending API request fails", async () => {
    const { shownNotifications } = await serviceWorkerPush({ fetchOk: false, fetchStatus: 503 });

    assert.equal(shownNotifications.length, 1);
    assert.equal(shownNotifications[0].title, "⚠️ LineWatchTO Service Alert");
    assert.equal(
      shownNotifications[0].options.body,
      "Open LineWatchTO to view the latest service update.",
    );
    assert.equal(shownNotifications[0].options.renotify, true);
    assert.equal(shownNotifications[0].options.requireInteraction, true);
    assert.equal(shownNotifications[0].options.silent, false);
  });

  it("shows a fallback for unauthenticated or unknown push subscriptions to prevent Android Chrome revocation", async () => {
    const { shownNotifications } = await serviceWorkerPush({ fetchOk: false, fetchStatus: 401 });

    assert.equal(shownNotifications.length, 1);
    assert.equal(shownNotifications[0].title, "⚠️ LineWatchTO Service Alert");
  });

  it("shows a cleared saved-commute push with full attention even when the tag is no longer active", async () => {
    const { shownNotifications } = await serviceWorkerPush({
      fetchBody: {
        notification: {
          title: "✅ Line 1 Yonge-University Delay Cleared",
          body: "Service between Finch and Union stations has resumed.\nNo longer affects Work (Outbound).\n🕗 Jun 5, 11:00 AM",
          url: "/?panel=commutes&commute=commute_1",
          tag: "saved-commute-impact|commute_1|outbound|delay-line-1|cleared",
          state: "CLEARED",
          timestamp: "2026-06-05T15:00:00Z",
        },
        activeTags: [],
        retainedTags: ["saved-commute-impact|commute_1|outbound|delay-line-1|cleared"],
      },
    });

    assert.equal(shownNotifications.length, 1);
    assert.equal(shownNotifications[0].title, "✅ Line 1 Yonge-University Delay Cleared");
    assert.equal(
      shownNotifications[0].options.body,
      "Service between Finch and Union stations has resumed.\nNo longer affects Work (Outbound).\n🕗 Jun 5, 11:00 AM",
    );
    assert.equal(shownNotifications[0].options.tag, "saved-commute-impact|commute_1|outbound|delay-line-1|cleared");
    assert.equal(shownNotifications[0].options.renotify, true);
    assert.equal(shownNotifications[0].options.requireInteraction, true);
    assert.equal(shownNotifications[0].options.silent, false);
    assert.equal(shownNotifications[0].options.timestamp, Date.parse("2026-06-05T15:00:00Z"));
    assert.equal(shownNotifications[0].options.data.state, "CLEARED");
  });

  it("cleans stale saved-commute notifications when the app asks the service worker to reconcile", async () => {
    const staleNotification = {
      tag: "saved-commute-planned|commute_1|resolved-dedupe",
      closed: false,
      close() {
        this.closed = true;
      },
    };

    const { fetchRequests, shownNotifications } = await serviceWorkerMessage({
      existingNotifications: [staleNotification],
    });

    assert.equal(fetchRequests.at(-1).url, "/api/account/push/active");
    assert.equal(shownNotifications.length, 0);
    assert.equal(staleNotification.closed, true);
  });

  it("records notification click and close client events", async () => {
    const { fetchRequests, listeners } = await serviceWorkerPush({
      pushData: {
        title: "⚠️ Line 1 Yonge-University Delay",
        body: "Finch to Union.\nAffects Morning commute (Outbound).\n🕗 Jun 5, 10:20 AM",
        url: "/?panel=commutes&commute=commute_1",
        tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
        state: "ACTIVE",
        timestamp: "2026-06-05T15:00:00Z",
      },
    });

    const notification = {
      tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
      data: {
        state: "ACTIVE",
        url: "/?panel=commutes&commute=commute_1",
      },
      close() {},
    };

    const clickWaits = [];
    listeners.get("notificationclick")({
      notification,
      waitUntil: (promise) => {
        clickWaits.push(Promise.resolve(promise));
      },
    });
    await Promise.all(clickWaits);

    const closeWaits = [];
    listeners.get("notificationclose")({
      notification,
      waitUntil: (promise) => {
        closeWaits.push(Promise.resolve(promise));
      },
    });
    await Promise.all(closeWaits);

    const stages = clientEventRequests(fetchRequests).map((request) => request.stage);
    assert.equal(stages.includes("notification_click"), true);
    assert.equal(stages.includes("notification_close"), true);
  });

  it("serves an offline page that does not claim stale TTC service data is current", () => {
    assert.match(offlinePageSource, /LineWatchTO is offline/);
    assert.match(offlinePageSource, /<img src="\/assets\/linewatch\/pwa\/offline-icon-512\.png"/);
    assert.match(offlinePageSource, /Current TTC service cannot be verified while your device is offline\./);
    assert.match(offlinePageSource, /Reconnect and reopen the dashboard for fresh alerts, station details, and commute impact checks\./);
    assert.doesNotMatch(offlinePageSource, /last loaded service status/i);
    assert.doesNotMatch(offlinePageSource, /cached alerts/i);
  });

  it("prevents browser and CDN caching of the service worker script", () => {
    assert.match(nextConfigSource, /source:\s*['"]\/sw\.js['"]/);
    assert.match(nextConfigSource, /Content-Type/);
    assert.match(nextConfigSource, /application\/javascript; charset=utf-8/);
    assert.match(nextConfigSource, /Cache-Control/);
    assert.match(nextConfigSource, /no-cache, no-store, must-revalidate/);
    assert.match(nextConfigSource, /Service-Worker-Allowed/);
    assert.match(nextConfigSource, /X-Content-Type-Options/);
  });

  it("exposes a no-cache frontend version endpoint for app update checks", () => {
    assert.equal(existsSync(versionRouteUrl), true, "version.json route should exist");
    const versionRouteSource = readFileSync(versionRouteUrl, "utf8");

    assert.match(versionRouteSource, /lineWatchAppVersion/);
    assert.match(versionRouteSource, /lineWatchBuildLabel/);
    assert.match(versionRouteSource, /releaseNotePreviewForVersion/);
    assert.match(versionRouteSource, /releaseNote:/);
    assert.match(versionRouteSource, /NextResponse\.json/);
    assert.match(versionRouteSource, /Cache-Control/);
    assert.match(versionRouteSource, /no-store, no-cache, must-revalidate/);
    assert.match(versionRouteSource, /dynamic\s*=\s*"force-dynamic"/);
  });

  it("mounts an app update banner that compares the baked release identity to the version endpoint", () => {
    assert.equal(existsSync(appUpdateBannerUrl), true, "AppUpdateBanner should exist");
    const appUpdateBannerSource = readFileSync(appUpdateBannerUrl, "utf8");

    assert.match(layoutSource, /<AppUpdateBanner \/>/);
    assert.match(appUpdateBannerSource, /lineWatchAppVersion/);
    assert.match(appUpdateBannerSource, /lineWatchBuildLabel/);
    assert.match(appUpdateBannerSource, /shouldShowAppUpdate/);
    assert.match(appUpdateBannerSource, /appUpdateReleaseKey/);
    assert.match(appUpdateBannerSource, /\/version\.json/);
    assert.match(appUpdateBannerSource, /cache:\s*"no-store"/);
    assert.match(appUpdateBannerSource, /New version available/);
    assert.match(appUpdateBannerSource, /Update LineWatchTO to get the latest fixes and improvements\./);
    assert.match(appUpdateBannerSource, /releaseNote/);
    assert.match(appUpdateBannerSource, /View changes/);
    assert.match(appUpdateBannerSource, /\/app-update\.html/);
    assert.match(appUpdateBannerSource, /panel=release-notes/);
    assert.match(appUpdateBannerSource, /Update now/);
    assert.match(appUpdateBannerSource, /Later/);
    assert.match(appUpdateBannerSource, /sessionStorage/);
    assert.match(appUpdateBannerSource, /linewatch-dismissed-update-release/);
    assert.doesNotMatch(appUpdateBannerSource, /linewatch-dismissed-update-build/);
    assert.doesNotMatch(appUpdateBannerSource, /Installed:/);
    assert.doesNotMatch(appUpdateBannerSource, /Latest:/);
    assert.match(appUpdateBannerSource, /reloadLineWatchAppForUpdate/);
    assert.match(appUpdateBannerSource, /isUpdating/);
    assert.match(appUpdateBannerSource, /disabled=\{isUpdating\}/);
    assert.match(appUpdateBannerSource, /visibilitychange/);
    assert.match(appUpdateBannerSource, /setInterval/);
  });

  it("builds production frontend images from the package app version", () => {
    assert.match(prodBuildPushSource, /FRONTEND_APP_VERSION/);
    assert.match(prodBuildPushSource, /frontend\/package\.json/);
    assert.match(prodBuildPushSource, /NEXT_PUBLIC_LINEWATCH_APP_VERSION=\$FRONTEND_APP_VERSION/);
    assert.doesNotMatch(prodBuildPushSource, /NEXT_PUBLIC_LINEWATCH_APP_VERSION=0\.1\.0/);
  });

  it("routes app updates through a dedicated no-cache refresh page", async () => {
    assert.equal(existsSync(appUpdatePageUrl), true, "app update refresh page should exist");

    const { reloadLineWatchAppForUpdate } = await import("../src/app/local-app-reset.ts");
    const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const navigations = [];

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          href: "https://linewatch.test/?panel=more#tools",
          origin: "https://linewatch.test",
          replace: (url) => {
            navigations.push(url);
          },
          assign: (url) => {
            navigations.push(`assign:${url}`);
          },
        },
      },
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });

    try {
      await reloadLineWatchAppForUpdate();
    } finally {
      if (originalWindowDescriptor) {
        Object.defineProperty(globalThis, "window", originalWindowDescriptor);
      } else {
        delete globalThis.window;
      }

      if (originalNavigatorDescriptor) {
        Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor);
      } else {
        delete globalThis.navigator;
      }
    }

    assert.equal(navigations.length, 1);
    assert.doesNotMatch(navigations[0], /^assign:/);

    const navigationUrl = new URL(navigations[0]);
    assert.equal(navigationUrl.origin, "https://linewatch.test");
    assert.equal(navigationUrl.pathname, "/app-update.html");
    assert.equal(navigationUrl.searchParams.get("auto"), "1");
    assert.equal(navigationUrl.searchParams.get("source"), "update");
    assert.equal(navigationUrl.searchParams.get("return"), "/?panel=more#tools");
  });

  it("provides update and reset escape hatches without clearing auth cookies", () => {
    assert.equal(existsSync(localAppResetUrl), true, "local app reset helper should exist");
    assert.equal(existsSync(appUpdatePageUrl), true, "app update refresh page should exist");
    assert.equal(existsSync(devResetPageUrl), true, "dev reset page should exist");

    const localAppResetSource = readFileSync(localAppResetUrl, "utf8");
    const appUpdatePageSource = readFileSync(appUpdatePageUrl, "utf8");
    const devResetPageSource = readFileSync(devResetPageUrl, "utf8");

    assert.match(localAppResetSource, /reloadLineWatchAppForUpdate/);
    assert.match(localAppResetSource, /\/app-update\.html/);
    assert.match(localAppResetSource, /window\.location\.replace/);
    assert.match(localAppResetSource, /\/dev-reset\.html/);
    assert.match(localAppResetSource, /auto/);
    assert.match(localAppResetSource, /source/);
    assert.doesNotMatch(localAppResetSource, /document\.cookie/);

    assert.match(nextConfigSource, /source:\s*['"]\/app-update\.html['"]/);
    assert.match(nextConfigSource, /Clear-Site-Data/);
    assert.match(nextConfigSource, /"cache"/);
    assert.match(appUpdatePageSource, /LineWatchTO App Update/);
    assert.match(appUpdatePageSource, /Preparing update/);
    assert.match(appUpdatePageSource, /Refreshing app shell/);
    assert.match(appUpdatePageSource, /Reloading dashboard/);
    assert.match(appUpdatePageSource, /navigator\.serviceWorker\.getRegistrations/);
    assert.match(appUpdatePageSource, /registration\.update/);
    assert.match(appUpdatePageSource, /registration\.unregister/);
    assert.match(appUpdatePageSource, /window\.caches\.keys/);
    assert.match(appUpdatePageSource, /linewatch-update/);
    assert.match(appUpdatePageSource, /URLSearchParams/);
    assert.match(appUpdatePageSource, /autoRunUpdate/);
    assert.match(appUpdatePageSource, /window\.location\.replace\(returnUrl\.href\)/);
    assert.doesNotMatch(appUpdatePageSource, /Consolidated Recovery Log/);
    assert.doesNotMatch(appUpdatePageSource, /Finalizing Control Dashboard/);
    assert.doesNotMatch(appUpdatePageSource, /localStorage\.clear/);
    assert.doesNotMatch(appUpdatePageSource, /sessionStorage\.clear/);
    assert.doesNotMatch(appUpdatePageSource, /document\.cookie/);

    assert.match(nextConfigSource, /source:\s*['"]\/dev-reset\.html['"]/);
    assert.match(nextConfigSource, /Clear-Site-Data/);
    assert.match(nextConfigSource, /"cache", "storage"/);

    assert.match(devResetPageSource, /LineWatchTO Cache Reset/);
    assert.match(devResetPageSource, /navigator\.serviceWorker\.getRegistrations/);
    assert.match(devResetPageSource, /window\.caches\.keys/);
    assert.match(devResetPageSource, /indexedDB\.deleteDatabase/);
    assert.match(devResetPageSource, /localStorage\.clear/);
    assert.match(devResetPageSource, /sessionStorage\.clear/);
    assert.match(devResetPageSource, /linewatch-reset/);
    assert.match(devResetPageSource, /URLSearchParams/);
    assert.match(devResetPageSource, /autoRunReset/);
    assert.match(devResetPageSource, /window\.location\.replace\(resetUrl\.href\)/);
    assert.doesNotMatch(devResetPageSource, /document\.cookie/);
    assert.doesNotMatch(nextConfigSource, /Clear-Site-Data[\s\S]*"cookies"/);
  });

  it("LineWatchShell reads URLSearchParams, opens panels, and focuses concrete impacts on the map", () => {
    const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
    assert.match(shellSource, /URLSearchParams/);
    assert.match(shellSource, /window\.location\.search/);
    assert.match(shellSource, /panel=notifications/);
    assert.match(shellSource, /panel=commutes/);
    assert.match(shellSource, /panel=alerts/);
    assert.match(shellSource, /panel=delays/);
    assert.match(shellSource, /panel=reduced-speed-zones/);
    assert.match(shellSource, /panel=closures/);
    assert.match(shellSource, /impactKind/);
    assert.match(shellSource, /impactId/);
    assert.match(shellSource, /const impactSelection = impactKind && impactId/);
    assert.match(shellSource, /setSelection\(impactSelection\)/);
    assert.match(shellSource, /setMobileInspectorDetent\("details-focus"\)/);
    assert.match(shellSource, /setActiveView\("map"\)/);
  });
});
