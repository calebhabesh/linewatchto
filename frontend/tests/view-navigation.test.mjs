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

  it("restores a submenu after a temporary Show on Map drill-down", () => {
    let history = [];
    history = pushViewHistory(history, "status", "delays");
    history = pushViewHistory(history, "delays", "map");

    const backFromFocusedMap = popViewHistory(history, "map");
    assert.equal(backFromFocusedMap.view, "delays");

    const backFromDelays = popViewHistory(backFromFocusedMap.history, "map");
    assert.equal(backFromDelays.view, "status");

    const backFromStatus = popViewHistory(backFromDelays.history, "map");
    assert.deepEqual(backFromStatus, { history: [], view: "map" });
  });

  it("keeps a direct map selection on the map when no launching view exists", () => {
    assert.deepEqual(popViewHistory([], "map"), { history: [], view: "map" });
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
