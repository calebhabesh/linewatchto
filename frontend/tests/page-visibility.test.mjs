import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pageVisibleAfterLifecycleSignal } from "../src/hooks/usePageVisibility.ts";

describe("page lifecycle visibility", () => {
  it("treats explicit background and foreground events as authoritative", () => {
    assert.equal(pageVisibleAfterLifecycleSignal("background", "visible"), false);
    assert.equal(pageVisibleAfterLifecycleSignal("foreground", "hidden"), true);
  });

  it("uses document visibility for ordinary synchronization events", () => {
    assert.equal(pageVisibleAfterLifecycleSignal("synchronize", "visible"), true);
    assert.equal(pageVisibleAfterLifecycleSignal("synchronize", "hidden"), false);
  });
});
