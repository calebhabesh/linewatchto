/**
 * Publishes one network's schedule asset set into the volume (plan 16):
 * content-hashed files first, then the manifest, each atomically.
 *
 * Volume layout (root):
 *   manifest.json            logical name -> hashed path, per network, with feed metadata
 *   files/<name>.<hash>.<ext> immutable; .json files also get .gz and .br siblings
 *   status.json              the service's health (written by service.mjs)
 *   .state/manifests/        earlier manifests, for retention
 * Caddy serves only manifest.json and files/.
 */

import { mkdir, readdir, readFile, stat, unlink, access } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";
import { readJsonOrNull, sha256, writeFileAtomic, writeJsonAtomic } from "./files.mjs";

export const MANIFEST_SCHEMA_VERSION = "1.0.0";
export const KEEP_MANIFESTS = 3;
export const MIN_FILE_AGE_MS = 2 * 24 * 60 * 60 * 1000;
const HISTORY_LIMIT = 20;

export const manifestPath = root => join(root, "manifest.json");
const filesDir = root => join(root, "files");
const historyDir = root => join(root, ".state", "manifests");

/** `ttc-surface-bus.json` + bytes -> `ttc-surface-bus.<first 16 hex of sha256>.json` */
export function hashedName(name, data) {
  const ext = extname(name);
  return `${basename(name, ext)}.${sha256(data).slice(0, 16)}${ext}`;
}

/** The logical name a hashed file was published under, or null. */
export function logicalName(file) {
  const match = /^(.+)\.[0-9a-f]{16}(\.[a-z]+)(\.gz|\.br)?$/.exec(file);
  return match ? `${match[1]}${match[2]}` : null;
}

const exists = path => access(path).then(() => true, () => false);

/**
 * True when two JSON files hold the same data apart from `archiveSha256`:
 * Open Data Toronto re-zips an unchanged feed, which changes only that field.
 */
export function sameApartFromArchive(a, b) {
  const strip = value => JSON.stringify(value, (key, inner) => (key === "archiveSha256" ? undefined : inner));
  try {
    return strip(JSON.parse(a.toString("utf8"))) === strip(JSON.parse(b.toString("utf8")));
  } catch {
    return false;
  }
}

export async function readManifest(root) {
  const manifest = await readJsonOrNull(manifestPath(root));
  return manifest && manifest.schemaVersion?.startsWith("1.") && manifest.networks ? manifest : null;
}

/** The bytes of a network's current files, by logical name, or null. */
export async function readPublishedFiles(root, manifest, network) {
  const entry = manifest?.networks?.[network];
  if (!entry?.files) return null;
  const out = {};
  for (const [name, path] of Object.entries(entry.files)) out[name] = await readFile(join(root, path));
  return out;
}

async function writeHashedFile(root, name, data) {
  const file = hashedName(name, data);
  const path = join(filesDir(root), file);
  if (!(await exists(path))) {
    if (name.endsWith(".json")) {
      // Precompressed for Caddy's file_server (precompressed br gzip).
      await writeFileAtomic(`${path}.gz`, gzipSync(data, { level: 9 }));
      await writeFileAtomic(`${path}.br`, brotliCompressSync(data, {
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: data.length },
      }));
    }
    // The file itself last: a present file always has its siblings.
    await writeFileAtomic(path, data);
  }
  return `files/${file}`;
}

/** Same generation id for the same set of published paths, in any order. */
export function generationId(networks) {
  const paths = Object.values(networks).flatMap(entry => Object.values(entry.files ?? {})).sort();
  return sha256(paths.join("\n")).slice(0, 16);
}

/**
 * Publishes `files` ({ logical name: Buffer }) as `network`'s set and returns
 * { changed, manifest }. `meta` is the network's feed metadata (feedVersion,
 * feedStartDate, feedEndDate, origin, tablesSha256). A file equal to the
 * current one apart from its archive hash keeps the current path, so riders
 * do not download unchanged data again. The other networks' entries are kept.
 */
export async function publishNetwork(root, network, files, meta, { now = new Date() } = {}) {
  await mkdir(filesDir(root), { recursive: true });
  await mkdir(historyDir(root), { recursive: true });
  const current = await readManifest(root);
  const currentEntry = current?.networks?.[network];
  const paths = {};
  for (const [name, data] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const currentPath = currentEntry?.files?.[name];
    if (currentPath && name.endsWith(".json")) {
      const currentData = await readFile(join(root, currentPath)).catch(() => null);
      if (currentData && (currentData.equals(data) || sameApartFromArchive(currentData, data))) {
        paths[name] = currentPath;
        continue;
      }
    }
    paths[name] = await writeHashedFile(root, name, data);
  }

  const entry = { ...meta, files: paths };
  const sameEntry = currentEntry && JSON.stringify({ ...currentEntry, publishedAt: undefined })
    === JSON.stringify({ ...entry, publishedAt: undefined });
  if (current && sameEntry) return { changed: false, manifest: current };

  const networks = { ...(current?.networks ?? {}), [network]: { ...entry, publishedAt: now.toISOString() } };
  const manifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generation: generationId(networks),
    publishedAt: now.toISOString(),
    networks,
  };
  await writeJsonAtomic(join(historyDir(root), `${now.getTime()}-${manifest.generation}.json`), manifest);
  await writeJsonAtomic(manifestPath(root), manifest);
  return { changed: true, manifest };
}

/**
 * Removes files no recent manifest refers to. Files of the current and the
 * last KEEP_MANIFESTS manifests stay, and so does anything younger than
 * MIN_FILE_AGE_MS, so a page that read an older manifest keeps working.
 */
export async function pruneFiles(root, { now = new Date(), keepManifests = KEEP_MANIFESTS, minAgeMs = MIN_FILE_AGE_MS } = {}) {
  const history = (await readdir(historyDir(root)).catch(() => [])).filter(name => name.endsWith(".json")).sort(
    (a, b) => Number(a.split("-")[0]) - Number(b.split("-")[0]),
  );
  const kept = new Set();
  const manifests = [await readManifest(root)];
  for (const name of history.slice(-keepManifests)) manifests.push(await readJsonOrNull(join(historyDir(root), name)));
  for (const manifest of manifests) {
    for (const entry of Object.values(manifest?.networks ?? {})) {
      for (const path of Object.values(entry.files ?? {})) kept.add(basename(path));
    }
  }
  const removed = [];
  for (const file of await readdir(filesDir(root)).catch(() => [])) {
    if (file.includes(".tmp-")) continue;
    const published = file.replace(/\.(gz|br)$/, "");
    if (kept.has(published) || !logicalName(file)) continue;
    const info = await stat(join(filesDir(root), file));
    if (now.getTime() - info.mtimeMs < minAgeMs) continue;
    await unlink(join(filesDir(root), file));
    removed.push(file);
  }
  for (const name of history.slice(0, Math.max(0, history.length - HISTORY_LIMIT))) {
    await unlink(join(historyDir(root), name)).catch(() => undefined);
  }
  return removed;
}

/** The client's view: logical name -> URL path under /data/schedule/, across networks. */
export function manifestFileUrls(manifest, base = "/data/schedule/") {
  const out = {};
  for (const entry of Object.values(manifest?.networks ?? {})) {
    for (const [name, path] of Object.entries(entry.files ?? {})) out[name] = `${base}${path}`;
  }
  return out;
}
