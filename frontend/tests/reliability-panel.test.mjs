import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/ReliabilityPanel.tsx", import.meta.url), "utf8");

describe("official TTC performance panel source", () => {
  it("renders official TTC performance metrics instead of fake reliability scores", () => {
    assert.match(source, /ttcPerformance/);
    assert.match(source, /Official TTC Performance/);
    assert.match(source, /Source:/);
    assert.doesNotMatch(source, /Reliability Analytics \(7-Day\)/);
    assert.doesNotMatch(source, /incidents7d/);
    assert.doesNotMatch(source, /median delay/);
  });
});
