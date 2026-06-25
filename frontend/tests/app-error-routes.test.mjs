import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readRequiredSource(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  assert.ok(existsSync(url), `expected ${relativePath} to exist`);
  return readFileSync(url, "utf8");
}

describe("Next.js branded error routes", () => {
  it("provides a LineWatchTO 404 page with a dashboard return action", () => {
    const source = readRequiredSource("../src/app/not-found.tsx");

    assert.match(source, /lineWatchAppTitle/);
    assert.match(source, /Page not in service/);
    assert.match(source, /Return to dashboard/);
    assert.match(source, /primaryActionHref="\/"/);
  });

  it("provides a route error boundary with a retry action", () => {
    const source = readRequiredSource("../src/app/error.tsx");

    assert.match(source, /"use client"/);
    assert.match(source, /Something interrupted the dashboard/);
    assert.match(source, /reset\(\)/);
    assert.match(source, /Try again/);
  });

  it("provides a global error boundary with full document markup", () => {
    const source = readRequiredSource("../src/app/global-error.tsx");

    assert.match(source, /"use client"/);
    assert.match(source, /<html/);
    assert.match(source, /<body/);
    assert.match(source, /LineWatchTO needs a refresh/);
    assert.match(source, /window\.location\.assign\("\/"\)/);
  });

  it("styles branded error screens with the transit line strip", () => {
    const source = readRequiredSource("../src/app/globals.css");

    assert.match(source, /\.linewatch-error-screen/);
    assert.match(source, /\.linewatch-error-strip/);
    assert.match(source, /#fed105/);
    assert.match(source, /#0a7c3f/);
    assert.match(source, /#7c277d/);
    assert.match(source, /#e8721b/);
  });
});
