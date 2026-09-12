import type { AccountCommutePath } from "./account-data";

/** Use the route's actual hops, not every line served by an interchange. */
export function commuteStopSpine(path: AccountCommutePath) {
  const links = path.stationIds.slice(0, -1).map((from, index) => {
    const to = path.stationIds[index + 1];
    const matches = path.segmentHops.filter((hop) =>
      (hop.fromStationId === from && hop.toStationId === to)
      || (hop.fromStationId === to && hop.toStationId === from));
    const lines = [...new Set(matches.map((hop) => hop.lineId))];
    return lines.length === 1 ? lines[0] : null;
  });
  return path.stationIds.map((stationId, index) => ({
    stationId,
    incomingLineId: index > 0 ? links[index - 1] : null,
    outgoingLineId: links[index] ?? null,
  }));
}
