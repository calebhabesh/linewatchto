import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildLineWatchRobots,
  buildLineWatchSitemap,
  buildLineWatchWebsiteStructuredData,
  DEFAULT_LINEWATCH_SITE_ORIGIN,
  getLineWatchSiteOrigin,
  getLineWatchSiteVerification,
} from "../src/app/seo.ts";

function readRequiredSource(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  assert.ok(existsSync(url), `expected ${relativePath} to exist`);
  return readFileSync(url, "utf8");
}

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

describe("LineWatchTO SEO baseline", () => {
  it("sets canonical production metadata and social share cards at the app root", () => {
    const layoutSource = readRequiredSource("../src/app/layout.tsx");
    const pageSource = readRequiredSource("../src/app/page.tsx");
    const seoSource = readRequiredSource("../src/app/seo.ts");

    assert.match(layoutSource, /metadataBase:\s*getLineWatchSiteOrigin\(\)/);
    assert.match(layoutSource, /alternates:\s*{\s*canonical:\s*"\/"/s);
    assert.match(layoutSource, /openGraph:\s*{/);
    assert.match(layoutSource, /twitter:\s*{/);
    assert.match(layoutSource, /description:\s*lineWatchSeoDescription/);
    assert.match(seoSource, /Unofficial Toronto transit dashboard for TTC subway and LRT, GO Transit, and UP Express/);
    assert.match(pageSource, /buildLineWatchWebsiteStructuredData/);
    assert.match(pageSource, /<JsonLd data=/);
  });

  it("centralizes the production origin while allowing environment overrides", () => {
    const seoSource = readRequiredSource("../src/app/seo.ts");

    assert.match(seoSource, /DEFAULT_LINEWATCH_SITE_ORIGIN\s*=\s*"https:\/\/linewatchto\.ca"/);
    assert.match(seoSource, /NEXT_PUBLIC_LINEWATCH_SITE_URL/);
    assert.match(seoSource, /getLineWatchSiteOrigin/);
  });

  it("publishes crawl rules and a focused sitemap", () => {
    const robotsSource = readRequiredSource("../src/app/robots.ts");
    const sitemapSource = readRequiredSource("../src/app/sitemap.ts");
    const origin = new URL(DEFAULT_LINEWATCH_SITE_ORIGIN);
    const lastModified = new Date("2026-07-03T00:00:00.000Z");

    assert.match(robotsSource, /buildLineWatchRobots/);
    assert.match(sitemapSource, /buildLineWatchSitemap/);
    assert.match(sitemapSource, /transitGuideSitemapPages/);
    assert.deepEqual(buildLineWatchRobots(origin), {
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/reset-password",
          "/app-update.html",
          "/dev-reset.html",
          "/offline.html",
        ],
      },
      sitemap: "https://linewatchto.ca/sitemap.xml",
    });
    assert.deepEqual(buildLineWatchSitemap(origin, [
      {
        path: "/",
        lastModified,
        changeFrequency: "hourly",
        priority: 1,
      },
      {
        path: "/ttc/stations/union",
        changeFrequency: "monthly",
        priority: 0.6,
      },
    ]), [
      {
        url: "https://linewatchto.ca/",
        lastModified,
        changeFrequency: "hourly",
        priority: 1,
      },
      {
        url: "https://linewatchto.ca/ttc/stations/union",
        changeFrequency: "monthly",
        priority: 0.6,
      },
    ]);

    assert.deepEqual(buildLineWatchSitemap(origin), [
      {
        url: "https://linewatchto.ca/",
        changeFrequency: "hourly",
        priority: 1,
      },
    ], "the sitemap must not claim every request time as a content modification");
  });

  it("uses a valid environment origin override and ignores invalid values", () => {
    assert.equal(
      withEnvValue("NEXT_PUBLIC_LINEWATCH_SITE_URL", "https://staging.linewatchto.ca/path", () =>
        getLineWatchSiteOrigin().toString(),
      ),
      "https://staging.linewatchto.ca/",
    );

    assert.equal(
      withEnvValue("NEXT_PUBLIC_LINEWATCH_SITE_URL", "not a url", () =>
        getLineWatchSiteOrigin().toString(),
      ),
      "https://linewatchto.ca/",
    );
  });

  it("keeps password reset links out of search indexes", () => {
    const resetPasswordSource = readRequiredSource("../src/app/reset-password/page.tsx");
    const notFoundSource = readRequiredSource("../src/app/not-found.tsx");

    assert.match(resetPasswordSource, /robots:\s*{\s*index:\s*false,\s*follow:\s*false/s);
    assert.match(notFoundSource, /robots:\s*{\s*index:\s*false,\s*follow:\s*false/s);
  });

  it("renders a semantic dashboard heading without changing the visual layout", () => {
    const shellSource = readRequiredSource("../src/components/LineWatchShell.tsx");

    assert.match(shellSource, /<h1\s+className="sr-only">/);
    assert.match(shellSource, /TTC subway and LRT reliability dashboard/);
  });

  it("publishes site identity structured data without overstating official affiliation", () => {
    const graph = buildLineWatchWebsiteStructuredData(new URL(DEFAULT_LINEWATCH_SITE_ORIGIN));

    assert.deepEqual(graph.map((entry) => entry["@type"]), ["WebSite", "WebApplication"]);
    assert.equal(graph[0].name, "LineWatchTO");
    assert.equal(graph[0].url, "https://linewatchto.ca/");
    assert.doesNotMatch(JSON.stringify(graph), /official TTC|official Metrolinx/i);
  });

  it("emits configured search ownership tags and omits empty ones", () => {
    assert.equal(
      withEnvValue("NEXT_PUBLIC_LINEWATCH_GOOGLE_SITE_VERIFICATION", undefined, () =>
        withEnvValue("NEXT_PUBLIC_LINEWATCH_BING_SITE_VERIFICATION", undefined, () =>
          getLineWatchSiteVerification(),
        ),
      ),
      undefined,
    );

    assert.deepEqual(
      withEnvValue("NEXT_PUBLIC_LINEWATCH_GOOGLE_SITE_VERIFICATION", "google-code", () =>
        withEnvValue("NEXT_PUBLIC_LINEWATCH_BING_SITE_VERIFICATION", "bing-code", () =>
          getLineWatchSiteVerification(),
        ),
      ),
      {
        google: "google-code",
        other: { "msvalidate.01": "bing-code" },
      },
    );
  });
});
