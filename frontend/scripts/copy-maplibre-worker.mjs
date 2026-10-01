import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = dirname(
  createRequire(import.meta.url).resolve("maplibre-gl/package.json"),
);
const { version } = JSON.parse(
  await readFile(join(packageDirectory, "package.json"), "utf8"),
);
const generatedDirectory = fileURLToPath(
  new URL("../public/assets/maplibre/", import.meta.url),
);
const outputDirectory = join(generatedDirectory, version);

// The worker imports the shared module by relative path. Both must match the
// installed MapLibre version; versioned URLs prevent stale worker cache reuse.
// This directory contains only generated dependency files, never authored maps.
await rm(generatedDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
for (const filename of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(
    join(packageDirectory, "dist", filename),
    join(outputDirectory, filename),
  );
}
await copyFile(join(packageDirectory, "LICENSE.txt"), join(outputDirectory, "LICENSE.txt"));
