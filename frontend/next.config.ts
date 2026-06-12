import type { NextConfig } from "next";

const allowedDevOrigins = [
  '192.0.2.25',
  '192.0.2.25:3000',
  process.env.LINEWATCH_DEV_ALLOWED_ORIGIN,
].filter((origin): origin is string => Boolean(origin));

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
