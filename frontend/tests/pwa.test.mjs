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
  fetchBody = {
    notification: {
      title: "Work Affected",
      body: "Reduced Speed Zone on Line 1: Glencairn to Lawrence West",
      url: "/?panel=commutes&commute=commute_1",
      tag: "saved-commute-impact|commute_1|dedupe-1",
    },
    activeTags: ["saved-commute-impact|commute_1|dedupe-1"],
  },
  existingNotifications = [],
} = {}) {
  const listeners = new Map();
  const waitUntilPromises = [];
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
        ok: fetchOk,
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

  const pushListener = listeners.get("push");
  assert.equal(typeof pushListener, "function");

  const event = {
    waitUntil: (promise) => {
      waitUntilPromises.push(Promise.resolve(promise));
    },
  };

  pushListener(event);
  await Promise.all(waitUntilPromises);

  return { fetchRequests, shownNotifications, listeners };
}

async function serviceWorkerMessage({
  fetchBody = {
    activeTags: ["saved-commute-impact|commute_1|dedupe-1"],
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
    assert.equal(webManifest.name, "LineWatch TO");
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

      assert.equal(webManifest.name, "LineWatch TO Staging");
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
    assert.match(serviceWorkerSource, /clients\.openWindow/);
    assert.match(serviceWorkerSource, /line-current/);
    assert.match(serviceWorkerSource, /line-planned/);
    assert.match(serviceWorkerSource, /saved-commute-current/);
    assert.match(serviceWorkerSource, /\/api\/account\/push\/active/);
  });

  it("shows commute push notifications with the Android badge and no large notification icon", async () => {
    const { fetchRequests, shownNotifications } = await serviceWorkerPush();

    assert.equal(fetchRequests[0].url, "/api/account/push/latest");
    assert.equal(fetchRequests[1].url, "/api/account/push/active");
    assert.equal(shownNotifications.length, 1);
    assert.equal(shownNotifications[0].title, "Work Affected");
    assert.equal(shownNotifications[0].options.body, "Reduced Speed Zone on Line 1: Glencairn to Lawrence West");
    assert.equal(shownNotifications[0].options.tag, "saved-commute-impact|commute_1|dedupe-1");
    assert.equal(shownNotifications[0].options.badge, "/assets/linewatch/pwa/notification-badge-96.png");
    assert.equal(Object.hasOwn(shownNotifications[0].options, "icon"), false);
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
      tag: "saved-commute-impact|commute_1|dedupe-1",
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

  it("shows a fallback notification when a pending push is no longer active", async () => {
    const { shownNotifications } = await serviceWorkerPush({
      fetchBody: {
        notification: {
          title: "Work Affected",
          body: "Reduced Speed Zone on Line 1: Glencairn to Lawrence West",
          url: "/?panel=commutes&commute=commute_1",
          tag: "saved-commute-impact|commute_1|resolved-dedupe",
        },
        activeTags: [],
      },
    });

    assert.equal(shownNotifications.length, 1);
    assert.equal(shownNotifications[0].title, "LineWatch TO commute update");
    assert.equal(shownNotifications[0].options.tag, "linewatch-commute-update");
  });

  it("shows a cleared saved-commute push as a quiet replacement even when the tag is no longer active", async () => {
    const { shownNotifications } = await serviceWorkerPush({
      fetchBody: {
        notification: {
          title: "Commute alert cleared",
          body: "Delay on Line 1: Finch to Union no longer affects this commute.",
          url: "/?panel=commutes&commute=commute_1",
          tag: "saved-commute-impact|commute_1|outbound|delay-line-1",
          state: "CLEARED",
          timestamp: "2026-06-05T15:00:00Z",
        },
        activeTags: [],
      },
    });

    assert.equal(shownNotifications.length, 1);
    assert.equal(shownNotifications[0].title, "Commute alert cleared");
    assert.equal(
      shownNotifications[0].options.body,
      "Delay on Line 1: Finch to Union no longer affects this commute.",
    );
    assert.equal(shownNotifications[0].options.tag, "saved-commute-impact|commute_1|outbound|delay-line-1");
    assert.equal(shownNotifications[0].options.renotify, false);
    assert.equal(shownNotifications[0].options.requireInteraction, false);
    assert.equal(shownNotifications[0].options.silent, true);
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

  it("serves an offline page that does not claim stale TTC service data is current", () => {
    assert.match(offlinePageSource, /LineWatch TO is offline/);
    assert.match(offlinePageSource, /<img src="\/assets\/linewatch\/pwa\/offline-icon-512\.png"/);
    assert.match(offlinePageSource, /Current TTC service cannot be verified while your device is offline\./);
    assert.match(offlinePageSource, /Reconnect and reopen the dashboard for fresh alerts, station details, and saved commute checks\./);
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
    assert.match(versionRouteSource, /NextResponse\.json/);
    assert.match(versionRouteSource, /Cache-Control/);
    assert.match(versionRouteSource, /no-store, no-cache, must-revalidate/);
    assert.match(versionRouteSource, /dynamic\s*=\s*"force-dynamic"/);
  });

  it("mounts an app update banner that compares the baked build label to the version endpoint", () => {
    assert.equal(existsSync(appUpdateBannerUrl), true, "AppUpdateBanner should exist");
    const appUpdateBannerSource = readFileSync(appUpdateBannerUrl, "utf8");

    assert.match(layoutSource, /<AppUpdateBanner \/>/);
    assert.match(appUpdateBannerSource, /lineWatchBuildLabel/);
    assert.match(appUpdateBannerSource, /\/version\.json/);
    assert.match(appUpdateBannerSource, /cache:\s*"no-store"/);
    assert.match(appUpdateBannerSource, /New version available/);
    assert.match(appUpdateBannerSource, /Update LineWatch TO to get the latest fixes and improvements\./);
    assert.match(appUpdateBannerSource, /Update now/);
    assert.match(appUpdateBannerSource, /Later/);
    assert.match(appUpdateBannerSource, /sessionStorage/);
    assert.match(appUpdateBannerSource, /linewatch-dismissed-update-build/);
    assert.doesNotMatch(appUpdateBannerSource, /Installed:/);
    assert.doesNotMatch(appUpdateBannerSource, /Latest:/);
    assert.match(appUpdateBannerSource, /reloadLineWatchAppForUpdate/);
    assert.match(appUpdateBannerSource, /isUpdating/);
    assert.match(appUpdateBannerSource, /disabled=\{isUpdating\}/);
    assert.match(appUpdateBannerSource, /visibilitychange/);
    assert.match(appUpdateBannerSource, /setInterval/);
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
    assert.match(appUpdatePageSource, /LineWatch TO App Update/);
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

    assert.match(devResetPageSource, /LineWatch TO Cache Reset/);
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

  it("LineWatchShell reads URLSearchParams and maps panel query params on mount", () => {
    const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
    assert.match(shellSource, /URLSearchParams/);
    assert.match(shellSource, /window\.location\.search/);
    assert.match(shellSource, /panel=notifications/);
    assert.match(shellSource, /panel=commutes/);
    assert.match(shellSource, /panel=alerts/);
    assert.match(shellSource, /panel=delays/);
    assert.match(shellSource, /panel=reduced-speed-zones/);
    assert.match(shellSource, /panel=closures/);
  });
});
