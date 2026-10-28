import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRepeatMapSelection } from "../src/app/map-repeat-selection.ts";

describe("map clicks on the selected alert", () => {
  const selected = { kind: "planned-closure", id: "regional-go-1-br" };

  it("change nothing when the same alert is clicked again", () => {
    assert.equal(isRepeatMapSelection({ selection: selected }, { ...selected }), true);
  });

  it("still select a different alert, or the alert from a station or commute view", () => {
    assert.equal(isRepeatMapSelection({ selection: selected }, { kind: "delay", id: "regional-go-1-br" }), false);
    assert.equal(isRepeatMapSelection({ selection: null }, selected), false);
    assert.equal(isRepeatMapSelection({ selection: selected, selectedStationId: "union" }, selected), false);
    assert.equal(isRepeatMapSelection({ selection: selected, commutePathPreview: { id: "c" } }, selected), false);
    assert.equal(isRepeatMapSelection({ selection: selected }, null), false);
  });
});
