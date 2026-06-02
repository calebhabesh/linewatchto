import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");

describe("dashboard server data binding", () => {
  it("trusts map API overlay metadata instead of rebuilding reduced speed zone impacts", () => {
    assert.doesNotMatch(pageSource, /networkSegments = networkSegments\.map/);
    assert.doesNotMatch(pageSource, /alertId:\s*alert\.id/);
    assert.match(pageSource, /networkSegments:\s*useFallback \? fallbackSegments : mapData\.segments/);
  });
});
