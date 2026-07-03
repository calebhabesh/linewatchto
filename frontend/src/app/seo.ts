import type { MetadataRoute } from "next";

export const DEFAULT_LINEWATCH_SITE_ORIGIN = "https://linewatchto.ca";
export const lineWatchSeoTitle = "LineWatchTO | TTC Subway & LRT Reliability Dashboard";
export const lineWatchSeoDescription =
  "Unofficial TTC subway and LRT reliability dashboard for Toronto riders, with map-first service status, delays, closures, accessibility outages, and saved commute checks.";
export const lineWatchSeoImagePath = "/assets/linewatch/pwa/app-icon-512.png";

function normalizeSiteOrigin(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return DEFAULT_LINEWATCH_SITE_ORIGIN;
  }

  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}`;
  } catch {
    return DEFAULT_LINEWATCH_SITE_ORIGIN;
  }
}

export function getLineWatchSiteOrigin() {
  return new URL(normalizeSiteOrigin(process.env.NEXT_PUBLIC_LINEWATCH_SITE_URL));
}

export function buildLineWatchRobots(origin = getLineWatchSiteOrigin()): MetadataRoute.Robots {
  return {
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
    sitemap: new URL("/sitemap.xml", origin).toString(),
  };
}

export function buildLineWatchSitemap(
  origin = getLineWatchSiteOrigin(),
  lastModified = new Date(),
): MetadataRoute.Sitemap {
  return [
    {
      url: new URL("/", origin).toString(),
      lastModified,
      changeFrequency: "hourly",
      priority: 1,
    },
  ];
}
