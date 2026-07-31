import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ARRIVAL_PINS_STORAGE_KEY,
  pinnedLineIdsForStation,
  readArrivalLinePins,
  sortArrivalGroupsByPinnedLine,
  toggleArrivalLinePin,
} from "../src/app/arrival-pins.ts";

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem(key) {
      return key === ARRIVAL_PINS_STORAGE_KEY ? value : null;
    },
    setItem(key, next) {
      if (key === ARRIVAL_PINS_STORAGE_KEY) value = next;
    },
  };
}

describe("arrival line pins", () => {
  it("persists network, station, and line scoped pins", () => {
    const storage = memoryStorage();
    toggleArrivalLinePin(storage, { networkId: "ttc", stationId: "cedarvale", lineId: "line-1" });
    toggleArrivalLinePin(storage, { networkId: "regional", stationId: "union", lineId: "regional-br" });

    const pins = readArrivalLinePins(storage);
    assert.deepEqual(pinnedLineIdsForStation(pins, "ttc", "cedarvale"), ["line-1"]);
    assert.deepEqual(pinnedLineIdsForStation(pins, "regional", "union"), ["regional-br"]);
    assert.deepEqual(pinnedLineIdsForStation(pins, "ttc", "union"), []);

    toggleArrivalLinePin(storage, { networkId: "ttc", stationId: "cedarvale", lineId: "line-1" });
    assert.deepEqual(pinnedLineIdsForStation(readArrivalLinePins(storage), "ttc", "cedarvale"), []);
  });

  it("moves every direction for a pinned line ahead of unpinned lines", () => {
    const groups = [
      { lineId: "line-1", direction: "north" },
      { lineId: "line-1", direction: "south" },
      { lineId: "line-5", direction: "east" },
      { lineId: "line-5", direction: "west" },
    ];

    assert.deepEqual(
      sortArrivalGroupsByPinnedLine(groups, ["line-5"]),
      [groups[2], groups[3], groups[0], groups[1]],
    );
  });

  it("ignores malformed stored preferences", () => {
    assert.deepEqual(readArrivalLinePins(memoryStorage("not-json")), []);
    assert.deepEqual(readArrivalLinePins(memoryStorage(JSON.stringify([{ networkId: "ttc" }]))), []);
  });
});
