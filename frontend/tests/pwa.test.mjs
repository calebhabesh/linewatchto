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

function readPngDimensions(url) {
  const buffer = readFileSync(url);
  const pngSignature = "89504e470d0a1a0a";

  assert.equal(buffer.subarray(0, 8).toString("hex"), pngSignature);

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
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
    assert.match(layoutSource, /applicationName:\s*"LineWatch TO"/);
    assert.match(layoutSource, /appleWebApp:\s*\{/);
    assert.match(layoutSource, /capable:\s*true/);
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
    assert.match(registrationSource, /linewatch-cleanup-notifications/);
  });

  it("uses a conservative service worker cache policy", () => {
    assert.match(serviceWorkerSource, /const CACHE_VERSION = "v2"/);
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

  it("does not show a pending saved-commute push when its tag is no longer active", async () => {
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

    assert.equal(shownNotifications.length, 0);
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
