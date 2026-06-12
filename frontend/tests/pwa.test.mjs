import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

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
    assert.match(registrationSource, /navigator\.serviceWorker\.register\("\/sw\.js"/);
    assert.match(registrationSource, /scope:\s*"\/"/);
    assert.match(registrationSource, /updateViaCache:\s*"none"/);
    assert.match(registrationSource, /process\.env\.NODE_ENV !== "production"/);
    assert.match(registrationSource, /NEXT_PUBLIC_LINEWATCH_ENABLE_SW/);
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

  it("handles Web Push notifications without caching service data", () => {
    assert.match(serviceWorkerSource, /self\.addEventListener\("push"/);
    assert.match(serviceWorkerSource, /registration\.pushManager\.getSubscription\(\)/);
    assert.match(serviceWorkerSource, /\/api\/account\/push\/latest/);
    assert.match(serviceWorkerSource, /credentials:\s*"include"/);
    assert.match(serviceWorkerSource, /self\.registration\.showNotification/);
    assert.match(serviceWorkerSource, /self\.addEventListener\("notificationclick"/);
    assert.match(serviceWorkerSource, /clients\.openWindow/);
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
});
