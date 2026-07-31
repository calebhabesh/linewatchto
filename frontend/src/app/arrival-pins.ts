import type { NetworkId } from "./regional-data.ts";

export const ARRIVAL_PINS_STORAGE_KEY = "linewatch-arrival-line-pins-v1";
export const ARRIVAL_PINS_CHANGED_EVENT = "linewatch-arrival-line-pins-changed";

export type ArrivalLinePin = {
  networkId: NetworkId;
  stationId: string;
  lineId: string;
};

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

function isArrivalLinePin(value: unknown): value is ArrivalLinePin {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ArrivalLinePin>;
  return (candidate.networkId === "ttc" || candidate.networkId === "regional")
    && typeof candidate.stationId === "string"
    && candidate.stationId.length > 0
    && typeof candidate.lineId === "string"
    && candidate.lineId.length > 0;
}

function pinKey(pin: ArrivalLinePin) {
  return `${pin.networkId}|${pin.stationId}|${pin.lineId}`;
}

export function readArrivalLinePins(storage: StorageReader): ArrivalLinePin[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(ARRIVAL_PINS_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isArrivalLinePin).filter((pin, index, pins) =>
      pins.findIndex((candidate) => isArrivalLinePin(candidate) && pinKey(candidate) === pinKey(pin)) === index
    );
  } catch {
    return [];
  }
}

export function toggleArrivalLinePin(
  storage: StorageReader & StorageWriter,
  target: ArrivalLinePin,
): ArrivalLinePin[] {
  const pins = readArrivalLinePins(storage);
  const targetKey = pinKey(target);
  const next = pins.some((pin) => pinKey(pin) === targetKey)
    ? pins.filter((pin) => pinKey(pin) !== targetKey)
    : [...pins, target];
  storage.setItem(ARRIVAL_PINS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function pinnedLineIdsForStation(
  pins: ArrivalLinePin[],
  networkId: NetworkId,
  stationId: string,
): string[] {
  return pins
    .filter((pin) => pin.networkId === networkId && pin.stationId === stationId)
    .map((pin) => pin.lineId);
}

export function sortArrivalGroupsByPinnedLine<T extends { lineId: string }>(
  groups: T[],
  pinnedLineIds: Iterable<string>,
): T[] {
  const pinned = new Set(pinnedLineIds);
  return groups
    .map((group, index) => ({ group, index }))
    .sort((left, right) => {
      const leftRank = pinned.has(left.group.lineId) ? 0 : 1;
      const rightRank = pinned.has(right.group.lineId) ? 0 : 1;
      return leftRank - rightRank || left.index - right.index;
    })
    .map(({ group }) => group);
}
