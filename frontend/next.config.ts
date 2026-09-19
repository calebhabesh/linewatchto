import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version?: string };

function shortSha(value: string | undefined) {
  return value ? value.slice(0, 7) : "";
}

function environmentLabel() {
  if (process.env.NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL !== undefined) {
    return process.env.NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL;
  }

  return process.env.NODE_ENV === "development" ? "Dev" : "";
}

const allowedDevOrigins = [
  '192.0.2.25',
  '192.0.2.25:3000',
  process.env.LINEWATCH_DEV_ALLOWED_ORIGIN,
].filter((origin): origin is string => Boolean(origin));

const staticGuideCacheControl = "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";
const staticGuideSources = ["/explore", "/ttc", "/ttc/:path*", "/go-up", "/go-up/:path*"];

const nextConfig: NextConfig = {
  // Keep the development badge from covering mobile search/account controls.
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: {
    NEXT_PUBLIC_LINEWATCH_APP_VERSION:
      process.env.NEXT_PUBLIC_LINEWATCH_APP_VERSION ||
      packageJson.version ||
      "1.1.0",
    NEXT_PUBLIC_LINEWATCH_BUILD_LABEL:
      process.env.NEXT_PUBLIC_LINEWATCH_BUILD_LABEL ||
      shortSha(process.env.VERCEL_GIT_COMMIT_SHA) ||
      shortSha(process.env.CF_PAGES_COMMIT_SHA) ||
      shortSha(process.env.GITHUB_SHA) ||
      (process.env.NODE_ENV === "production" ? "local" : "dev"),
    NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL: environmentLabel(),
  },
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  allowedDevOrigins,
  async headers() {
    return [
      ...staticGuideSources.map((source) => ({
        source,
        headers: [
          {
            key: "Cache-Control",
            value: staticGuideCacheControl,
          },
        ],
      })),
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
      {
        source: '/dev-reset.html',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
          {
            key: 'Clear-Site-Data',
            value: '"cache", "storage"',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
      {
        source: '/app-update.html',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
  async rewrites() {
    const backendUrl =
      process.env.LINEWATCH_BACKEND_URL ||
      process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_LINEWATCH_API_BASE_URL ||
      "http://localhost:8080";
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`
      }
    ]
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = config.watchOptions || {};
      config.watchOptions.ignored = [
        ...(Array.isArray(config.watchOptions.ignored)
          ? config.watchOptions.ignored
          : config.watchOptions.ignored
          ? [config.watchOptions.ignored]
          : []),
        '**/.git',
      ];
    }
    return config;
  },
};

export default nextConfig;
