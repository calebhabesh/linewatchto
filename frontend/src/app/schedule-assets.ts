/**
 * Schedule-derived Map View and search files at runtime (plan 16).
 *
 * The schedule-assets service regenerates the surface catalogs, route stop
 * lists and search indexes when the TTC or GO GTFS changes, and publishes
 * them as content-hashed files under /data/schedule/files/ with a short-lived
 * /data/schedule/manifest.json naming them. The page reads the manifest once
 * and then asks for the hashed files, so a new schedule reaches riders without
 * a release.
 *
 * Without a usable manifest (local `next dev`, Playwright's server, a first
 * deploy before the service has run, or a failed read) every file comes from
 * the release's own copy under /assets/linewatch/geographic/, for the whole
 * page, so one page never mixes the release's files with the service's.
 * Files the manifest does not name (subway and rail catalogs, station plans
 * and bays) always come from the release.
 */

import { releaseAssetUrl } from "./app-build.ts";

export const SCHEDULE_MANIFEST_URL = "/data/schedule/manifest.json";
const SCHEDULE_BASE = "/data/schedule/";
const GEOGRAPHIC_PREFIX = "/assets/linewatch/geographic/";
const MANIFEST_TIMEOUT_MS = 5_000;

export type ScheduleNetworkEntry = {
  /** "release" while the service still serves the release's files; "runtime" once it has checked the feed. */
  origin: "release" | "runtime";
  feedVersion: string;
  feedStartDate: string;
  feedEndDate: string;
  publishedAt: string;
  /** Logical file name -> path under /data/schedule/ ("files/ttc-surface-bus.<hash>.json"). */
  files: Record<string, string>;
};

export type ScheduleManifest = {
  schemaVersion: string;
  generation: string;
  publishedAt: string;
  networks: Record<string, ScheduleNetworkEntry>;
};

export function isScheduleManifest(value: unknown): value is ScheduleManifest {
  const manifest = value as Partial<ScheduleManifest> | null;
  if (!manifest || typeof manifest.schemaVersion !== "string" || !manifest.schemaVersion.startsWith("1.")) return false;
  if (!manifest.networks || typeof manifest.networks !== "object") return false;
  return Object.values(manifest.networks).every((entry) => Boolean(entry
    && typeof entry.files === "object" && entry.files
    && Object.values(entry.files).every((path) => typeof path === "string" && /^files\/[A-Za-z0-9._-]+$/.test(path))));
}

let manifestRead: Promise<ScheduleManifest | null> | null = null;

async function readManifest(): Promise<ScheduleManifest | null> {
  try {
    const response = await fetch(SCHEDULE_MANIFEST_URL, { signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS) });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    return isScheduleManifest(value) ? value : null;
  } catch {
    return null;
  }
}

/** The manifest for this page, read once; null means the release's files are used. */
export function loadScheduleManifest(): Promise<ScheduleManifest | null> {
  manifestRead ??= readManifest();
  return manifestRead;
}

/**
 * Reads the manifest again after a hashed file was gone (the page outlived
 * several publications). A failed re-read keeps the page's current choice.
 */
async function rereadScheduleManifest(): Promise<void> {
  const current = await loadScheduleManifest();
  if (!current) return;
  const fresh = await readManifest();
  if (fresh) manifestRead = Promise.resolve(fresh);
}

/** For tests: forget the page's manifest. */
export function resetScheduleManifestForTests(): void {
  manifestRead = null;
}

/** The URL for a geographic file: its hashed copy when the manifest names it, else the release's. */
export async function scheduleAssetUrl(path: string): Promise<{ url: string; fromManifest: boolean }> {
  if (path.startsWith(GEOGRAPHIC_PREFIX)) {
    const name = path.slice(GEOGRAPHIC_PREFIX.length);
    const manifest = await loadScheduleManifest();
    for (const entry of Object.values(manifest?.networks ?? {})) {
      const file = entry.files[name];
      if (file) return { url: `${SCHEDULE_BASE}${file}`, fromManifest: true };
    }
  }
  return { url: releaseAssetUrl(path), fromManifest: false };
}

/** Fetches a geographic file through the manifest; a hashed file that is gone rereads it once. */
export async function fetchScheduleAsset(path: string): Promise<Response> {
  const first = await scheduleAssetUrl(path);
  const response = await fetch(first.url);
  if (response.status !== 404 || !first.fromManifest) return response;
  await rereadScheduleManifest();
  const second = await scheduleAssetUrl(path);
  return second.url === first.url ? response : fetch(second.url);
}
