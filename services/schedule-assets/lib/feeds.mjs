/**
 * Reads the TTC and GO GTFS publications (plan 16). Nothing here is served:
 * archives stay in the volume's private .state directory.
 *
 * TTC: the CKAN package lists the zip; its URL plus `last_modified` is the
 * release key the backend's GtfsScheduleDownloadClient also uses, so the zip
 * is downloaded only when that changes. GO: a conditional GET on the zip.
 * `file:` URLs are read from disk (tests and staging feed overrides).
 */

import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { copyFile, readFile, rename, rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

export class FeedError extends Error {
  constructor(stage, message) {
    super(message);
    this.stage = stage;
  }
}

async function readText(url, { fetchImpl, userAgent }) {
  if (url.startsWith("file:")) return readFile(fileURLToPath(url), "utf8");
  const response = await fetchImpl(url, { headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new FeedError("lookup", `${new URL(url).host} answered ${response.status}`);
  return response.text();
}

/** The current TTC zip and its release key, from the CKAN package. */
export async function currentTtcRelease(packageUrl, options) {
  let body;
  try {
    body = JSON.parse(await readText(packageUrl, options));
  } catch (error) {
    throw error instanceof FeedError ? error : new FeedError("lookup", `CKAN package unreadable: ${error.message}`);
  }
  const resources = body?.result?.resources;
  if (!Array.isArray(resources)) throw new FeedError("lookup", "CKAN package has no resources");
  for (const resource of resources) {
    const url = String(resource?.url ?? "");
    const format = String(resource?.format ?? "").toLowerCase();
    if (url && (url.toLowerCase().endsWith(".zip") || format.includes("zip"))) {
      const lastModified = String(resource.last_modified ?? "");
      return { zipUrl: url, releaseKey: lastModified ? `${url}@${lastModified}` : null };
    }
  }
  throw new FeedError("lookup", "CKAN package lists no zip");
}

/**
 * Downloads `url` to `dest` (via a temporary sibling). With `etag` or
 * `lastModified` the request is conditional; returns
 * { status: "not-modified" } or { status: "downloaded", etag, lastModified, bytes }.
 */
export async function downloadArchive(url, dest, { fetchImpl, userAgent, etag, lastModified }) {
  const temp = `${dest}.part`;
  if (url.startsWith("file:")) {
    const source = fileURLToPath(url);
    const info = await stat(source);
    const tag = `"${info.size}-${info.mtimeMs}"`;
    if (etag && etag === tag) return { status: "not-modified" };
    await copyFile(source, temp);
    await rename(temp, dest);
    return { status: "downloaded", etag: tag, lastModified: null, bytes: info.size };
  }
  const headers = { "User-Agent": userAgent };
  if (etag) headers["If-None-Match"] = etag;
  if (lastModified) headers["If-Modified-Since"] = lastModified;
  const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (response.status === 304) return { status: "not-modified" };
  if (!response.ok || !response.body) throw new FeedError("download", `${new URL(url).host} answered ${response.status}`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_ARCHIVE_BYTES) throw new FeedError("download", `archive is ${declared} bytes, over the limit`);
  let bytes = 0;
  const limit = async function* (source) {
    for await (const chunk of source) {
      bytes += chunk.length;
      if (bytes > MAX_ARCHIVE_BYTES) throw new FeedError("download", "archive is over the size limit");
      yield chunk;
    }
  };
  try {
    await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(temp));
  } catch (error) {
    await rm(temp, { force: true });
    throw error instanceof FeedError ? error : new FeedError("download", `download failed: ${error.message}`);
  }
  await rename(temp, dest);
  return {
    status: "downloaded",
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    bytes,
  };
}

export async function verifyArchive(path) {
  try {
    await execFileAsync("unzip", ["-tq", path], { maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    throw new FeedError("archive", `archive failed its integrity test: ${String(error.stderr || error.message).trim().slice(0, 200)}`);
  }
}

/**
 * One hash over the extracted tables (name and contents, in name order), so a
 * re-zipped archive with the same tables hashes the same.
 */
export async function tablesSha256(path) {
  const { stdout } = await execFileAsync("unzip", ["-Z1", path], { maxBuffer: 16 * 1024 * 1024 });
  const names = stdout.split("\n").map(name => name.trim()).filter(name => name && !name.endsWith("/")).sort();
  if (names.length === 0) throw new FeedError("archive", "archive holds no tables");
  const total = createHash("sha256");
  for (const name of names) {
    const table = createHash("sha256");
    const child = spawn("unzip", ["-p", path, name], { stdio: ["ignore", "pipe", "ignore"] });
    for await (const chunk of child.stdout) table.update(chunk);
    const code = await new Promise(done => child.on("close", done));
    if (code !== 0) throw new FeedError("archive", `unzip ${name} exited with ${code}`);
    total.update(`${name}\0${table.digest("hex")}\n`);
  }
  return total.digest("hex");
}
