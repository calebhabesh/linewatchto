import type {
  ActiveAlert,
  DelayAlert,
  PlannedClosure,
  ReducedSpeedZone,
  StationNodeImpact,
} from "../app/linewatch-data";

export type StationImpactArrowDirection =
  | "left"
  | "right"
  | "up"
  | "down"
  | "horizontal-bidirectional"
  | "vertical-bidirectional";

export type StationImpactDirectionArrow = {
  direction: StationImpactArrowDirection;
  ariaLabel: string;
};

type DirectionSource = {
  id: string;
  lineId: string;
  displayDirection?: string | null;
};

export type StationImpactDirectionData = {
  activeAlerts: Array<Pick<ActiveAlert, "id" | "lineId" | "displayDirection">>;
  delays: Array<Pick<DelayAlert, "id" | "lineId" | "displayDirection">>;
  reducedSpeedZones: Array<Pick<ReducedSpeedZone, "id" | "lineId" | "displayDirection">>;
  plannedClosures: Array<Pick<PlannedClosure, "id" | "lineId" | "displayDirection">>;
};

export type StationImpactDirectionDetails = {
  lineId: string;
  displayDirection: string;
  arrow: StationImpactDirectionArrow;
};

const HORIZONTAL_LINE_IDS = new Set(["line-2", "line-4", "line-5", "line-6"]);
const VERTICAL_LINE_IDS = new Set(["line-1"]);

export function stationImpactDirectionForImpact(
  impact: Pick<StationNodeImpact, "kind" | "cardId">,
  data: StationImpactDirectionData,
): StationImpactDirectionDetails | null {
  const source = stationImpactDirectionSource(impact, data);
  if (!source?.displayDirection) return null;

  const arrow = stationImpactDirectionArrow(source.lineId, source.displayDirection);
  if (!arrow) return null;

  return {
    lineId: source.lineId,
    displayDirection: source.displayDirection,
    arrow,
  };
}

export function stationImpactDirectionArrow(
  lineId: string | null | undefined,
  displayDirection: string | null | undefined,
): StationImpactDirectionArrow | null {
  const direction = displayDirection?.trim();
  if (!direction) return null;

  const normalized = direction.toLowerCase().replace(/\s+/g, " ");
  if (
    normalized === "direction not specified" ||
    normalized === "not specified" ||
    normalized === "unknown"
  ) {
    return null;
  }

  const hasEastbound = /\beastbound\b/.test(normalized);
  const hasWestbound = /\bwestbound\b/.test(normalized);
  const hasNorthbound = /\bnorthbound\b/.test(normalized);
  const hasSouthbound = /\bsouthbound\b/.test(normalized);

  if (hasEastbound && hasWestbound) {
    return arrow("horizontal-bidirectional", direction);
  }

  if (hasNorthbound && hasSouthbound) {
    return arrow("vertical-bidirectional", direction);
  }

  if (isBidirectionalLabel(normalized)) {
    const bidirectionalDirection = bidirectionalArrowForLine(lineId);
    return bidirectionalDirection ? arrow(bidirectionalDirection, direction) : null;
  }

  if (hasWestbound) return arrow("left", direction);
  if (hasEastbound) return arrow("right", direction);
  if (hasNorthbound) return arrow("up", direction);
  if (hasSouthbound) return arrow("down", direction);

  return null;
}

function stationImpactDirectionSource(
  impact: Pick<StationNodeImpact, "kind" | "cardId">,
  data: StationImpactDirectionData,
): DirectionSource | undefined {
  if (impact.kind === "suspension") {
    return data.activeAlerts.find((alert) => alert.id === impact.cardId);
  }

  if (impact.kind === "delay") {
    return (
      data.delays.find((delay) => delay.id === impact.cardId) ??
      data.activeAlerts.find((alert) => alert.id === impact.cardId)
    );
  }

  if (impact.kind === "reduced-speed-zone") {
    return data.reducedSpeedZones.find((zone) => zone.id === impact.cardId);
  }

  return (
    data.plannedClosures.find((closure) => closure.id === impact.cardId) ??
    data.activeAlerts.find((alert) => alert.id === impact.cardId)
  );
}

function bidirectionalArrowForLine(
  lineId: string | null | undefined,
): Extract<StationImpactArrowDirection, "horizontal-bidirectional" | "vertical-bidirectional"> | null {
  if (lineId && VERTICAL_LINE_IDS.has(lineId)) {
    return "vertical-bidirectional";
  }

  if (lineId && HORIZONTAL_LINE_IDS.has(lineId)) {
    return "horizontal-bidirectional";
  }

  return null;
}

function isBidirectionalLabel(normalized: string): boolean {
  return normalized === "bidirectional" ||
    normalized === "both way" ||
    normalized === "both ways" ||
    normalized === "both directions" ||
    normalized === "in both directions";
}

function arrow(
  direction: StationImpactArrowDirection,
  displayDirection: string,
): StationImpactDirectionArrow {
  return {
    direction,
    ariaLabel: `${displayDirection} station impact`,
  };
}
