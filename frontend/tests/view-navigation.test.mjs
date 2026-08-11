import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { popViewHistory, pushViewHistory, resolveInAppBackAction } from "../src/app/view-navigation.ts";

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

describe("browser back actions", () => {
  const closed = {
    accountDialogOpen: false,
    stationOpen: false,
    commutePreviewOpen: false,
    viewOpen: false,
    impactOpen: false,
  };

  it("dismisses the topmost in-app surface before leaving the root view", () => {
    assert.equal(resolveInAppBackAction({ ...closed, accountDialogOpen: true, stationOpen: true }), "close-account-dialog");
    assert.equal(resolveInAppBackAction({ ...closed, stationOpen: true }), "close-station");
    assert.equal(resolveInAppBackAction({ ...closed, commutePreviewOpen: true }), "close-commute-preview");
    assert.equal(resolveInAppBackAction({ ...closed, viewOpen: true, impactOpen: true }), "navigate-view");
    assert.equal(resolveInAppBackAction({ ...closed, impactOpen: true }), "clear-impact");
  });

  it("allows normal browser back behavior when no in-app surface is open", () => {
    assert.equal(resolveInAppBackAction(closed), "none");
  });
});
