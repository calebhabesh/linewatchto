import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version?: string };

function shortSha(value: string | undefined) {
  return value ? value.slice(0, 7) : "";
}

const allowedDevOrigins = [
  '192.0.2.25',
  '192.0.2.25:3000',
  process.env.LINEWATCH_DEV_ALLOWED_ORIGIN,
].filter((origin): origin is string => Boolean(origin));

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: {
    NEXT_PUBLIC_LINEWATCH_APP_VERSION:
      process.env.NEXT_PUBLIC_LINEWATCH_APP_VERSION ||
      packageJson.version ||
      "0.1.0",
    NEXT_PUBLIC_LINEWATCH_BUILD_LABEL:
      process.env.NEXT_PUBLIC_LINEWATCH_BUILD_LABEL ||
      shortSha(process.env.VERCEL_GIT_COMMIT_SHA) ||
      shortSha(process.env.CF_PAGES_COMMIT_SHA) ||
      shortSha(process.env.GITHUB_SHA) ||
      (process.env.NODE_ENV === "production" ? "local" : "dev"),
  },
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  allowedDevOrigins,
  async headers() {
    return [
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
            key: 'Clear-Site-Data',
            value: '"cache"',
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
};

export default nextConfig;
