const fallbackVersion = "1.3.0";
const fallbackBuildLabel = process.env.NODE_ENV === "production" ? "local" : "dev";

export const lineWatchAppVersion = process.env.NEXT_PUBLIC_LINEWATCH_APP_VERSION || fallbackVersion;
export const lineWatchBuildLabel = process.env.NEXT_PUBLIC_LINEWATCH_BUILD_LABEL || fallbackBuildLabel;
export const lineWatchAppVersionLabel = `v${lineWatchAppVersion} · ${lineWatchBuildLabel}`;

/**
 * An authored public file whose name stays fixed between releases (the geographic JSON under
 * /assets/linewatch/geographic/), addressed per build. /assets/* is served immutable for a year and
 * held at Cloudflare's edge, so a bare URL would keep the previous release's routes, stops and
 * search index after a deploy.
 */
export function releaseAssetUrl(path: string): string {
  return `${path}?v=${encodeURIComponent(lineWatchBuildLabel)}`;
}
