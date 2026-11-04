import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createRecentStopsStore,
  readRecentStops,
  RECENT_STOPS_LIMIT,
  RECENT_STOPS_STORAGE_KEY,
  withRecentStop,
  writeRecentStops,
} from "../src/app/recent-stops.ts";

const memoryStorage = (initial = {}) => {
  const values = { ...initial };
  return { values, getItem: (key) => values[key] ?? null, setItem: (key, value) => { values[key] = String(value); } };
};
const throwingStorage = {
  getItem() { throw new DOMException("blocked", "SecurityError"); },
  setItem() { throw new DOMException("full", "QuotaExceededError"); },
};

describe("recent stops", () => {
  it("puts the newest first, drops its earlier entry, and keeps five", () => {
    let list = [];
    for (const code of ["1", "2", "3", "4", "5", "6"]) list = withRecentStop(list, { network: "ttc", code });
    assert.equal(RECENT_STOPS_LIMIT, 5);
    assert.deepEqual(list.map((entry) => entry.code), ["6", "5", "4", "3", "2"]);
    list = withRecentStop(list, { network: "ttc", code: "3" });
    assert.deepEqual(list.map((entry) => entry.code), ["3", "6", "5", "4", "2"]);
    // The same number on the other network is another stop.
    list = withRecentStop(list, { network: "regional", code: "3" });
    assert.deepEqual(list.slice(0, 2), [{ network: "regional", code: "3" }, { network: "ttc", code: "3" }]);
  });

  it("stores only stop numbers and networks", () => {
    const storage = memoryStorage();
    assert.equal(writeRecentStops(storage, [{ network: "ttc", code: "100", lat: 43.6, lon: -79.4, name: "x" }]), true);
    assert.deepEqual(JSON.parse(storage.values[RECENT_STOPS_STORAGE_KEY]), [{ network: "ttc", code: "100" }]);
  });

  it("reads nothing from missing, corrupt, foreign or blocked storage", () => {
    assert.deepEqual(readRecentStops(null), []);
    assert.deepEqual(readRecentStops(memoryStorage()), []);
    assert.deepEqual(readRecentStops(memoryStorage({ [RECENT_STOPS_STORAGE_KEY]: "{not json" })), []);
    assert.deepEqual(readRecentStops(memoryStorage({ [RECENT_STOPS_STORAGE_KEY]: '{"code":"1"}' })), []);
    assert.deepEqual(readRecentStops(throwingStorage), []);
    assert.deepEqual(
      readRecentStops(memoryStorage({ [RECENT_STOPS_STORAGE_KEY]: JSON.stringify([
        { network: "ttc", code: "100" }, { network: "bus", code: "1" }, { network: "regional", code: "<b>" }, null, { network: "regional", code: "00008" },
      ]) })),
      [{ network: "ttc", code: "100" }, { network: "regional", code: "00008" }],
    );
  });

  it("keeps the list for this page when storage refuses to save it", () => {
    assert.equal(writeRecentStops(throwingStorage, [{ network: "ttc", code: "1" }]), false);
    const store = createRecentStopsStore(() => throwingStorage);
    let changes = 0;
    store.subscribe(() => changes++);
    store.record({ network: "ttc", code: "100" });
    store.record({ network: "regional", code: "00008" });
    assert.deepEqual(store.getSnapshot(), [{ network: "regional", code: "00008" }, { network: "ttc", code: "100" }]);
    assert.equal(changes, 2);
  });

  it("reads storage once, saves each change, and ignores reopening the newest stop", () => {
    const storage = memoryStorage({ [RECENT_STOPS_STORAGE_KEY]: JSON.stringify([{ network: "ttc", code: "100" }]) });
    const store = createRecentStopsStore(() => storage);
    const first = store.getSnapshot();
    assert.deepEqual(first, [{ network: "ttc", code: "100" }]);
    store.record({ network: "ttc", code: "100" });
    assert.equal(store.getSnapshot(), first);
    store.record({ network: "ttc", code: "2034" });
    assert.deepEqual(JSON.parse(storage.values[RECENT_STOPS_STORAGE_KEY]), [{ network: "ttc", code: "2034" }, { network: "ttc", code: "100" }]);
  });
});
