import type { Metadata, MetadataRoute } from "next";
import { lineWatchAppTitle } from "./app-title.ts";

export const DEFAULT_LINEWATCH_SITE_ORIGIN = "https://linewatchto.ca";
export const lineWatchSeoTitle = `${lineWatchAppTitle} - TTC, GO & UP Transit Status`;
export const lineWatchSeoDescription =
  "Unofficial Toronto transit dashboard for TTC subway and LRT, GO Transit, and UP Express alerts, closures, accessibility, and reliability.";
export const lineWatchSeoImagePath = "/assets/linewatch/og-image.png";

export type LineWatchSitemapPage = {
  path: string;
  changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority?: number;
  lastModified?: string | Date;
};

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

function optionalPublicValue(value: string | undefined) {
  return value?.trim() || undefined;
}

export function getLineWatchSiteVerification(): Metadata["verification"] {
  const google = optionalPublicValue(process.env.NEXT_PUBLIC_LINEWATCH_GOOGLE_SITE_VERIFICATION);
  const bing = optionalPublicValue(process.env.NEXT_PUBLIC_LINEWATCH_BING_SITE_VERIFICATION);

  if (!google && !bing) return undefined;

  return {
    ...(google ? { google } : {}),
    ...(bing ? { other: { "msvalidate.01": bing } } : {}),
  };
}

export function buildTransitGuideMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | ${lineWatchAppTitle}`,
      description,
      url: path,
      siteName: lineWatchAppTitle,
      locale: "en_CA",
      type: "website",
      images: [{
        url: lineWatchSeoImagePath,
        width: 1200,
        height: 630,
        alt: "LineWatchTO Toronto transit dashboard preview",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${lineWatchAppTitle}`,
      description,
      images: [lineWatchSeoImagePath],
    },
  };
}

export function buildLineWatchWebsiteStructuredData(origin = getLineWatchSiteOrigin()) {
  const url = origin.toString();
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${url}#website`,
      url,
      name: lineWatchAppTitle,
      alternateName: "LineWatch Toronto",
      description: lineWatchSeoDescription,
      inLanguage: "en-CA",
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "@id": `${url}#application`,
      url,
      name: lineWatchAppTitle,
      description: lineWatchSeoDescription,
      applicationCategory: "TravelApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires a modern web browser",
      isAccessibleForFree: true,
      inLanguage: "en-CA",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "CAD",
      },
    },
  ];
}

export function buildLineWatchRobots(origin = getLineWatchSiteOrigin()): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/reset-password",
        "/verify-email",
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
  pages: readonly LineWatchSitemapPage[] = [
    { path: "/", changeFrequency: "hourly", priority: 1 },
  ],
): MetadataRoute.Sitemap {
  return pages.map(({ path, ...metadata }) => ({
    url: new URL(path, origin).toString(),
    ...metadata,
  }));
}
