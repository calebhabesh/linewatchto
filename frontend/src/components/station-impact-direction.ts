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
  | "up-left"
  | "up-right"
  | "down-left"
  | "down-right"
  | "horizontal-bidirectional"
  | "vertical-bidirectional"
  | "three-way-no-left"
  | "three-way-no-right"
  | "three-way-no-up"
  | "three-way-no-down"
  | "four-way";

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

export type StationImpactDirectionSummary = {
  displayDirection: string;
  arrow: StationImpactDirectionArrow;
};

type CardinalDirection = "left" | "right" | "up" | "down";

const HORIZONTAL_LINE_IDS = new Set([
  "line-2",
  "line-4",
  "line-5",
  "line-6",
  "regional-ki",
  "regional-le",
  "regional-lw",
  "regional-mi",
  "regional-up",
]);
const VERTICAL_LINE_IDS = new Set([
  "line-1",
  "regional-br",
  "regional-rh",
  "regional-st",
]);

export function stationImpactDirectionForImpact(
  impact: Pick<StationNodeImpact, "stationId" | "kind" | "cardId">,
  data: StationImpactDirectionData,
): StationImpactDirectionDetails | null {
  const source = stationImpactDirectionSource(impact, data);
  if (!source) return null;
  const displayDirection = source.displayDirection;
  if (!displayDirection) return null;

  if (isUnionLineOneStationImpact(impact, source.lineId)) {
    const unionArrow = unionStationImpactDirectionArrow(displayDirection);
    if (!unionArrow) return null;

    return {
      lineId: source.lineId,
      displayDirection,
      arrow: unionArrow,
    };
  }

  const arrow = stationImpactDirectionArrow(source.lineId, displayDirection);
  if (!arrow) return null;

  return {
    lineId: source.lineId,
    displayDirection,
    arrow,
  };
}

export function stationImpactDirectionForStationImpacts(
  impacts: Array<Pick<StationNodeImpact, "stationId" | "kind" | "cardId">>,
  data: StationImpactDirectionData,
): StationImpactDirectionSummary | null {
  const directions = new Set<CardinalDirection>();
  const directionLabels: string[] = [];
  const seenLabels = new Set<string>();
  const seenImpacts = new Set<string>();

  for (const impact of impacts) {
    const impactKey = `${impact.stationId}:${impact.kind}:${impact.cardId}`;
    if (seenImpacts.has(impactKey)) continue;
    seenImpacts.add(impactKey);

    const details = stationImpactDirectionForImpact(impact, data);
    if (!details) continue;

    for (const direction of cardinalDirectionsForArrow(details.arrow.direction)) {
      directions.add(direction);
    }

    const label = details.displayDirection.trim();
    const normalizedLabel = label.toLowerCase().replace(/\s+/g, " ");
    if (label && !seenLabels.has(normalizedLabel)) {
      seenLabels.add(normalizedLabel);
      directionLabels.push(label);
    }
  }

  const aggregateDirection = arrowForCardinalDirections(directions);
  if (!aggregateDirection) return null;

  return {
    displayDirection: directionLabels.join("; "),
    arrow: arrow(aggregateDirection, directionLabels.join("; ") || "Station impact"),
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

export function stationImpactDirectionSource(
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

function isUnionLineOneStationImpact(
  impact: Pick<StationNodeImpact, "stationId">,
  lineId: string | null | undefined,
): boolean {
  return impact.stationId === "union" && lineId === "line-1";
}

function unionStationImpactDirectionArrow(
  displayDirection: string,
): StationImpactDirectionArrow | null {
  const direction = displayDirection.trim();
  const normalized = direction.toLowerCase().replace(/\s+/g, " ");
  const hasVaughanTerminal = /\bvaughan\b|\bvmc\b/.test(normalized);
  const hasFinchTerminal = /\bfinch\b/.test(normalized);

  if (hasVaughanTerminal && hasFinchTerminal) {
    return arrow("horizontal-bidirectional", direction);
  }
  if (hasVaughanTerminal) {
    return arrow("left", direction);
  }
  if (hasFinchTerminal) {
    return arrow("right", direction);
  }

  return null;
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

function cardinalDirectionsForArrow(direction: StationImpactArrowDirection): CardinalDirection[] {
  switch (direction) {
    case "left":
      return ["left"];
    case "right":
      return ["right"];
    case "up":
      return ["up"];
    case "down":
      return ["down"];
    case "up-left":
      return ["up", "left"];
    case "up-right":
      return ["up", "right"];
    case "down-left":
      return ["down", "left"];
    case "down-right":
      return ["down", "right"];
    case "horizontal-bidirectional":
      return ["left", "right"];
    case "vertical-bidirectional":
      return ["up", "down"];
    case "three-way-no-left":
      return ["right", "up", "down"];
    case "three-way-no-right":
      return ["left", "up", "down"];
    case "three-way-no-up":
      return ["left", "right", "down"];
    case "three-way-no-down":
      return ["left", "right", "up"];
    case "four-way":
      return ["left", "right", "up", "down"];
  }
}

function arrowForCardinalDirections(
  directions: Set<CardinalDirection>,
): StationImpactArrowDirection | null {
  const left = directions.has("left");
  const right = directions.has("right");
  const up = directions.has("up");
  const down = directions.has("down");
  const count = Number(left) + Number(right) + Number(up) + Number(down);

  if (count === 0) return null;
  if (count === 4) return "four-way";

  if (count === 1) {
    if (left) return "left";
    if (right) return "right";
    if (up) return "up";
    return "down";
  }

  if (count === 2) {
    if (left && right) return "horizontal-bidirectional";
    if (up && down) return "vertical-bidirectional";
    if (up && left) return "up-left";
    if (up && right) return "up-right";
    if (down && left) return "down-left";
    return "down-right";
  }

  if (!left) return "three-way-no-left";
  if (!right) return "three-way-no-right";
  if (!up) return "three-way-no-up";
  return "three-way-no-down";
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

const FOUR_WAY_STATION_IMPACT_ARROW_SCALE = 0.94;

export function stationImpactDirectionPath(direction: StationImpactArrowDirection, radius: number): string {
  const parts = stationImpactDirectionParts(direction);
  const pathMetricsRadius =
    direction === "four-way" ? radius * FOUR_WAY_STATION_IMPACT_ARROW_SCALE : radius;
  const metrics = stationImpactDirectionMetrics(pathMetricsRadius);

  if (parts.length === 1) {
    return stationImpactDirectionCenteredPartPath(parts[0], metrics);
  }

  if (
    direction === "up-right" ||
    direction === "up-left" ||
    direction === "down-right" ||
    direction === "down-left"
  ) {
    const cx = Math.round(pathMetricsRadius * 0.52);
    const cy = Math.round(pathMetricsRadius * 0.52);
    const offX = Math.round(metrics.headHalf * 0.38);
    const offY = Math.round(metrics.headHalf * 0.38);

    const isUp = direction === "up-right" || direction === "up-left";
    const isRight = direction === "up-right" || direction === "down-right";

    const cornerX = (isRight ? -cx : cx) + (isRight ? offX : -offX);
    const cornerY = (isUp ? cy : -cy) + (isUp ? -offY : offY);

    const verticalTipY = (isUp ? -cy : cy) + (isUp ? -offY : offY);
    const horizontalTipX = (isRight ? cx : -cx) + (isRight ? offX : -offX);

    const headInset = metrics.headInset;
    const headHalf = metrics.headHalf;

    const upDownHeadDir = isUp ? -1 : 1;
    const rightLeftHeadDir = isRight ? 1 : -1;

    return [
      `M ${cornerX} ${cornerY} V ${verticalTipY}`,
      `M ${cornerX - headHalf} ${verticalTipY - upDownHeadDir * headInset} L ${cornerX} ${verticalTipY} L ${cornerX + headHalf} ${verticalTipY - upDownHeadDir * headInset}`,
      `M ${cornerX} ${cornerY} H ${horizontalTipX}`,
      `M ${horizontalTipX - rightLeftHeadDir * headInset} ${cornerY - headHalf} L ${horizontalTipX} ${cornerY} L ${horizontalTipX - rightLeftHeadDir * headInset} ${cornerY + headHalf}`,
    ].join(" ");
  }

  if (direction === "horizontal-bidirectional") {
    return [
      `M -${metrics.extent} 0 H ${metrics.extent}`,
      `M -${metrics.extent - metrics.headInset} -${metrics.headHalf} L -${metrics.extent} 0 L -${metrics.extent - metrics.headInset} ${metrics.headHalf}`,
      `M ${metrics.extent - metrics.headInset} -${metrics.headHalf} L ${metrics.extent} 0 L ${metrics.extent - metrics.headInset} ${metrics.headHalf}`,
    ].join(" ");
  }

  if (direction === "vertical-bidirectional") {
    return [
      `M 0 -${metrics.extent} V ${metrics.extent}`,
      `M -${metrics.headHalf} -${metrics.extent - metrics.headInset} L 0 -${metrics.extent} L ${metrics.headHalf} -${metrics.extent - metrics.headInset}`,
      `M -${metrics.headHalf} ${metrics.extent - metrics.headInset} L 0 ${metrics.extent} L ${metrics.headHalf} ${metrics.extent - metrics.headInset}`,
    ].join(" ");
  }

  if (direction === "four-way") {
    return [
      `M -${metrics.extent} 0 H ${metrics.extent}`,
      `M 0 -${metrics.extent} V ${metrics.extent}`,
      `M -${metrics.extent - metrics.headInset} -${metrics.headHalf} L -${metrics.extent} 0 L -${metrics.extent - metrics.headInset} ${metrics.headHalf}`,
      `M ${metrics.extent - metrics.headInset} -${metrics.headHalf} L ${metrics.extent} 0 L ${metrics.extent - metrics.headInset} ${metrics.headHalf}`,
      `M -${metrics.headHalf} -${metrics.extent - metrics.headInset} L 0 -${metrics.extent} L ${metrics.headHalf} -${metrics.extent - metrics.headInset}`,
      `M -${metrics.headHalf} ${metrics.extent - metrics.headInset} L 0 ${metrics.extent} L ${metrics.headHalf} ${metrics.extent - metrics.headInset}`,
    ].join(" ");
  }

  return parts
    .map((part) => stationImpactDirectionSpokePartPath(part, metrics))
    .join(" ");
}

function stationImpactDirectionParts(direction: StationImpactArrowDirection): Array<"left" | "right" | "up" | "down"> {
  switch (direction) {
    case "left":
      return ["left"];
    case "right":
      return ["right"];
    case "up":
      return ["up"];
    case "down":
      return ["down"];
    case "up-left":
      return ["left", "up"];
    case "up-right":
      return ["right", "up"];
    case "down-left":
      return ["left", "down"];
    case "down-right":
      return ["right", "down"];
    case "horizontal-bidirectional":
      return ["left", "right"];
    case "vertical-bidirectional":
      return ["up", "down"];
    case "three-way-no-left":
      return ["right", "up", "down"];
    case "three-way-no-right":
      return ["left", "up", "down"];
    case "three-way-no-up":
      return ["left", "right", "down"];
    case "three-way-no-down":
      return ["left", "right", "up"];
    case "four-way":
      return ["left", "right", "up", "down"];
  }
}

function stationImpactDirectionMetrics(radius: number): {
  extent: number;
  gap: number;
  headInset: number;
  headHalf: number;
} {
  const extent = Math.round(radius * 0.75);
  return {
    extent,
    gap: Math.max(4, Math.round(radius * 0.17)),
    headInset: Math.max(8, Math.round(extent * 0.42)),
    headHalf: Math.max(8, Math.round(radius * 0.25)),
  };
}

function stationImpactDirectionCenteredPartPath(
  direction: "left" | "right" | "up" | "down",
  metrics: ReturnType<typeof stationImpactDirectionMetrics>,
): string {
  switch (direction) {
    case "left":
      return `M ${metrics.extent} 0 H -${metrics.extent} M -${metrics.extent - metrics.headInset} -${metrics.headHalf} L -${metrics.extent} 0 L -${metrics.extent - metrics.headInset} ${metrics.headHalf}`;
    case "right":
      return `M -${metrics.extent} 0 H ${metrics.extent} M ${metrics.extent - metrics.headInset} -${metrics.headHalf} L ${metrics.extent} 0 L ${metrics.extent - metrics.headInset} ${metrics.headHalf}`;
    case "up":
      return `M 0 ${metrics.extent} V -${metrics.extent} M -${metrics.headHalf} -${metrics.extent - metrics.headInset} L 0 -${metrics.extent} L ${metrics.headHalf} -${metrics.extent - metrics.headInset}`;
    case "down":
      return `M 0 -${metrics.extent} V ${metrics.extent} M -${metrics.headHalf} ${metrics.extent - metrics.headInset} L 0 ${metrics.extent} L ${metrics.headHalf} ${metrics.extent - metrics.headInset}`;
  }
}

function stationImpactDirectionSpokePartPath(
  direction: "left" | "right" | "up" | "down",
  metrics: ReturnType<typeof stationImpactDirectionMetrics>,
): string {
  switch (direction) {
    case "left":
      return `M 0 0 H -${metrics.extent} M -${metrics.extent - metrics.headInset} -${metrics.headHalf} L -${metrics.extent} 0 L -${metrics.extent - metrics.headInset} ${metrics.headHalf}`;
    case "right":
      return `M 0 0 H ${metrics.extent} M ${metrics.extent - metrics.headInset} -${metrics.headHalf} L ${metrics.extent} 0 L ${metrics.extent - metrics.headInset} ${metrics.headHalf}`;
    case "up":
      return `M 0 0 V -${metrics.extent} M -${metrics.headHalf} -${metrics.extent - metrics.headInset} L 0 -${metrics.extent} L ${metrics.headHalf} -${metrics.extent - metrics.headInset}`;
    case "down":
      return `M 0 0 V ${metrics.extent} M -${metrics.headHalf} ${metrics.extent - metrics.headInset} L 0 ${metrics.extent} L ${metrics.headHalf} ${metrics.extent - metrics.headInset}`;
  }
}
