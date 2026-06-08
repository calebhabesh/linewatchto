import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  allowedDevOrigins: ['192.0.2.25', '192.0.2.25:3000'],
  async rewrites() {
    const backendUrl = process.env.LINEWATCH_BACKEND_URL || "http://localhost:8080";
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`
      }
    ]
  }
};

export default nextConfig;
