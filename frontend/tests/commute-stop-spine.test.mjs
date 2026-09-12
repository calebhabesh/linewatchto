import assert from "node:assert/strict";
import { test } from "node:test";
import { commuteStopSpine } from "../src/app/commute-stop-spine.ts";
const hop = (fromStationId, toStationId, lineId) => ({ fromStationId, toStationId, lineId });
test("spine changes line at the transfer and terminates at endpoints", () => {
  assert.deepEqual(commuteStopSpine({
    stationIds: ["a", "b", "c"],
    segmentHops: [hop("a", "b", "line-1"), hop("b", "c", "line-2")],
  }), [
    { stationId: "a", incomingLineId: null, outgoingLineId: "line-1" },
    { stationId: "b", incomingLineId: "line-1", outgoingLineId: "line-2" },
    { stationId: "c", incomingLineId: "line-2", outgoingLineId: null },
  ]);
});
test("return legs use the matching adjacent corridor even with reversed hop endpoints", () => {
  const rows = commuteStopSpine({ stationIds: ["b", "a"], segmentHops: [hop("a", "b", "go-br")] });
  assert.equal(rows[0].outgoingLineId, "go-br");
  assert.equal(rows[1].incomingLineId, "go-br");
});
test("missing or ambiguous hops do not invent a line", () => {
  const rows = commuteStopSpine({ stationIds: ["a", "b", "c"], segmentHops: [hop("a", "b", "line-1"), hop("a", "b", "line-2")] });
  assert.ok(rows.every(row => row.incomingLineId === null && row.outgoingLineId === null));
});
