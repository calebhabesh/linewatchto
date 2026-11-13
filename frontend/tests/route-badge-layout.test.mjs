import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { currentServiceRouteLayout } from "../src/app/route-badge-layout.ts";

describe("currentServiceRouteLayout", () => {
  it("centers a single route", () => {
    assert.equal(currentServiceRouteLayout(["71"]), "single");
    assert.equal(currentServiceRouteLayout(["24B"]), "single");
  });

  it("puts square codes in a grid", () => {
    assert.equal(currentServiceRouteLayout(["71", "79"]), "grid");
    assert.equal(currentServiceRouteLayout(["7", "29", "41", "52"]), "grid");
  });

  it("stacks rows with any code too wide to be square", () => {
    assert.equal(currentServiceRouteLayout(["29", "329"]), "stack");
    assert.equal(currentServiceRouteLayout(["52A", "52B"]), "stack");
  });
});
