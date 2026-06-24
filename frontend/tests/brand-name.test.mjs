import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

import { getLineWatchAppTitle } from "../src/app/app-title.ts";

const repoRoot = new URL("../../", import.meta.url).pathname;
const scannedPaths = [
  "frontend/src",
  "frontend/public",
  "backend/src/main",
  "scripts",
  "view_ttc_alerts.py",
];

const textFilePattern = /\.(css|html|java|js|mjs|py|ts|tsx)$/;

function collectTextFiles(path) {
  const absolutePath = join(repoRoot, path);
  const stat = statSync(absolutePath);

  if (stat.isFile()) {
    return textFilePattern.test(absolutePath) ? [absolutePath] : [];
  }

  return readdirSync(absolutePath).flatMap((entry) => collectTextFiles(join(path, entry)));
}

describe("LineWatchTO brand spelling", () => {
  it("uses the no-space product name in app runtime files", () => {
    const offenders = scannedPaths
      .flatMap(collectTextFiles)
      .filter((file) => readFileSync(file, "utf8").includes("LineWatch TO"))
      .map((file) => relative(repoRoot, file));

    assert.deepEqual(offenders, []);
  });

  it("uses the no-space product name for browser tab titles", () => {
    const appTitleSource = readFileSync(new URL("../src/app/app-title.ts", import.meta.url), "utf8");
    const layoutSource = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");

    assert.equal(getLineWatchAppTitle(), "LineWatchTO");
    assert.match(appTitleSource, /const baseAppTitle = "LineWatchTO"/);
    assert.doesNotMatch(appTitleSource, /LineWatch TO/);
    assert.match(layoutSource, /title:\s*\{\s*default:\s*lineWatchAppTitle/s);
    assert.match(layoutSource, /template:\s*`%s \| \$\{lineWatchAppTitle\}`/);
    assert.doesNotMatch(layoutSource, /LineWatch TO/);
  });
});
