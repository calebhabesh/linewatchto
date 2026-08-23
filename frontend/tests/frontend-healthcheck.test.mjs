import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const healthRoute = readFileSync(
  new URL("../src/app/healthz/route.ts", import.meta.url),
  "utf8",
);

const composeFiles = [
  ["production", "../../docker-compose.prod.yml"],
  ["staging", "../../docker-compose.staging.yml"],
  ["AWS lab", "../../docker-compose.aws-lab.yml"],
];

describe("frontend container health check", () => {
  it("uses a static no-store route", () => {
    assert.match(healthRoute, /linewatch-frontend/);
    assert.match(healthRoute, /status: "ok"/);
    assert.match(healthRoute, /Cache-Control": "no-store"/);
  });

  for (const [label, path] of composeFiles) {
    it(`${label} probes healthz without rendering the dashboard`, () => {
      const compose = readFileSync(new URL(path, import.meta.url), "utf8");
      assert.match(compose, /fetch\('http:\/\/127\.0\.0\.1:3000\/healthz'/);
      assert.match(compose, /AbortSignal\.timeout\(3000\)/);
      assert.doesNotMatch(compose, /fetch\('http:\/\/127\.0\.0\.1:3000\/'\)/);
    });
  }
});
