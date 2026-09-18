#!/usr/bin/env node

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";

const targetDir = resolve(process.argv[2] ?? "/tmp/linewatch-gtfs");

const SOURCES = {
  ttc: {
    name: "TTC Rapid Transit GTFS",
    filename: "completegtfs.zip",
    url: "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/b811ead4-6eaf-4adb-8408-d389fb5a069c/resource/c920e221-7a1c-488b-8c5b-6d8cd4e85eaf/download/completegtfs.zip",
    expectedSha256: "e70efd86a1991b302d97d82554180efc482484bb79440f07a09e95031e310e3c",
  },
  go: {
    name: "GO Transit GTFS",
    filename: "GO-GTFS.zip",
    url: "https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/GO-GTFS.zip",
    expectedSha256: "e2c80eeed718af9e58315c4198b1bd7e338a00171c658197f04d116421f14fc6",
  },
  up: {
    name: "UP Express GTFS",
    filename: "UP-GTFS.zip",
    url: "https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/UP-GTFS.zip",
    expectedSha256: "a8f2147147143a0068a93cf7c7ec73d050d9a3f95004967535ef7eed0a256320",
  },
};

async function computeSha256(filePath) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

await mkdir(targetDir, { recursive: true });

console.log(`Downloading authoritative GTFS archives to: ${targetDir}`);

for (const [key, source] of Object.entries(SOURCES)) {
  const destPath = resolve(targetDir, source.filename);
  let needsDownload = true;

  try {
    const s = await stat(destPath);
    if (s.isFile() && s.size > 0) {
      const existingHash = await computeSha256(destPath);
      if (existingHash === source.expectedSha256) {
        console.log(`[${key}] ${source.name}: already present with verified checksum (${existingHash})`);
        needsDownload = false;
      }
    }
  } catch {
    // file does not exist, proceed to download
  }

  if (needsDownload) {
    console.log(`[${key}] Fetching ${source.name} from ${source.url}...`);
    const response = await fetch(source.url);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download ${source.name}: HTTP ${response.status}`);
    }

    await pipeline(response.body, createWriteStream(destPath));
    const downloadedHash = await computeSha256(destPath);
    console.log(`[${key}] Downloaded ${source.filename}: SHA-256 = ${downloadedHash}`);
    if (source.expectedSha256 && downloadedHash !== source.expectedSha256) {
      console.warn(`[${key}] Warning: Checksum differs from audited version (${source.expectedSha256})`);
    } else {
      console.log(`[${key}] Checksum verified against Phase A audit manifest.`);
    }
  }
}

console.log("All authoritative GTFS archives ready.");
