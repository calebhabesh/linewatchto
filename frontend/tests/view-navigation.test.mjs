import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { popViewHistory, pushViewHistory } from "../src/app/view-navigation.ts";

describe("view navigation history", () => {
  it("reverses nested views in chronological order", () => {
    let history = [];
    history = pushViewHistory(history, "more", "commutes");
    history = pushViewHistory(history, "commutes", "notifications");

    const firstBack = popViewHistory(history, "map");
    assert.equal(firstBack.view, "commutes");

    const secondBack = popViewHistory(firstBack.history, "map");
    assert.equal(secondBack.view, "more");
    assert.deepEqual(secondBack.history, []);
  });

  it("does not add duplicate entries and uses a root fallback when empty", () => {
    assert.deepEqual(pushViewHistory(["more"], "commutes", "commutes"), ["more"]);
    assert.deepEqual(popViewHistory([], "status"), { history: [], view: "status" });
  });
});
