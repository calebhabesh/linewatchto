import type {
  ActiveAlert,
  DelayAlert,
  PlannedClosure,
  ReducedSpeedZone,
  StationNodeImpact,
} from "../app/linewatch-data";
import { REGIONAL_ROUTE_STATIONS, stationName, type RegionalRouteCode } from "../app/regional-data.ts";

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

  const towards = regionalTowardsArrow(impact.stationId, source.lineId, displayDirection);
  if (towards) {
    return {
      lineId: source.lineId,
      displayDirection,
      arrow: towards,
    };
  }

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

/**
 * Which way a GO/UP train heading for Union points on the schematic map. The
 * opposite way is away from Union. Lines run out of Union, so "towards" a
 * station nearer Union is inbound.
 */
const REGIONAL_TOWARDS_UNION: Record<RegionalRouteCode, CardinalDirection> = {
  BR: "down",
  KI: "right",
  LE: "left",
  LW: "right",
  MI: "right",
  RH: "down",
  ST: "down",
  UP: "right",
};

const OPPOSITE: Record<CardinalDirection, CardinalDirection> = {
  left: "right",
  right: "left",
  up: "down",
  down: "up",
};

function normalizedStationName(name: string): string {
  return name.toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/\s+(?:go\s+)?station$/, "")
    .replace(/\s+go$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Metrolinx alerts carry no direction field. The backend names a trip's
 * destination ("Towards Union Station") when the wording identifies the trip;
 * this turns that into an arrow from where the alerted station sits on the line.
 */
function regionalTowardsArrow(
  stationId: string,
  lineId: string | null | undefined,
  displayDirection: string,
): StationImpactDirectionArrow | null {
  const match = /^towards\s+(.+)$/i.exec(displayDirection.trim());
  if (!match || !lineId?.startsWith("regional-")) return null;
  const routeCode = lineId.slice("regional-".length).toUpperCase() as RegionalRouteCode;
  const route = REGIONAL_ROUTE_STATIONS[routeCode];
  if (!route) return null;
  const destination = normalizedStationName(match[1]);
  const destinationIndex = route.findIndex((id) => normalizedStationName(stationName(id)) === destination);
  const stationIndex = route.indexOf(stationId);
  if (destinationIndex < 0 || stationIndex < 0 || destinationIndex === stationIndex) return null;
  const towardsUnion = REGIONAL_TOWARDS_UNION[routeCode];
  return arrow(destinationIndex < stationIndex ? towardsUnion : OPPOSITE[towardsUnion], displayDirection.trim());
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

type GlyphPoint = [number, number];

const UNIT_VECTOR: Record<CardinalDirection, GlyphPoint> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};

/**
 * The arrow's line weight in a badge of this radius. The whole glyph scales
 * with its badge, so a small dot's arrow is the large one shrunk and its
 * heads never run together.
 */
export function stationImpactDirectionStrokeWidth(radius: number): number {
  return glyphNumber(radius * 0.15);
}

/**
 * The arrow drawn in a station dot's direction badge, as a path around the
 * badge's centre, optically centred in the dot (see `centeredGlyphPath`).
 */
export function stationImpactDirectionPath(direction: StationImpactArrowDirection, radius: number): string {
  return centeredGlyphPath(stationImpactDirectionStrokes(direction, radius), isCornerArrow(direction));
}

function isCornerArrow(direction: StationImpactArrowDirection): boolean {
  return direction === "up-right" ||
    direction === "up-left" ||
    direction === "down-right" ||
    direction === "down-left";
}

function stationImpactDirectionStrokes(direction: StationImpactArrowDirection, radius: number): GlyphPoint[][] {
  const metrics = stationImpactDirectionMetrics(radius);
  const parts = stationImpactDirectionParts(direction);

  if (isCornerArrow(direction)) {
    const reach = radius * 1.04;
    const vertical: CardinalDirection = direction.startsWith("up") ? "up" : "down";
    const horizontal: CardinalDirection = direction.endsWith("right") ? "right" : "left";
    // The two arms meet at the corner opposite the way they point.
    const corner = scale(add(UNIT_VECTOR[vertical], UNIT_VECTOR[horizontal]), -reach / 2);
    const verticalTip = add(corner, scale(UNIT_VECTOR[vertical], reach));
    const horizontalTip = add(corner, scale(UNIT_VECTOR[horizontal], reach));
    return [
      [corner, verticalTip],
      arrowHead(verticalTip, vertical, metrics),
      [corner, horizontalTip],
      arrowHead(horizontalTip, horizontal, metrics),
    ];
  }

  // A spoke from the centre per direction; a lone arrow runs right through it.
  return parts.flatMap((part) => {
    const tip = scale(UNIT_VECTOR[part], metrics.extent);
    const tail: GlyphPoint = parts.length === 1 ? scale(tip, -1) : [0, 0];
    return [[tail, tip], arrowHead(tip, part, metrics)];
  });
}

function arrowHead(
  tip: GlyphPoint,
  direction: CardinalDirection,
  metrics: ReturnType<typeof stationImpactDirectionMetrics>,
): GlyphPoint[] {
  const [ux, uy] = UNIT_VECTOR[direction];
  const back = add(tip, scale([ux, uy], -metrics.headInset));
  const side: GlyphPoint = [-uy * metrics.headHalf, ux * metrics.headHalf];
  return [add(back, side), tip, add(back, scale(side, -1))];
}

/**
 * The strokes as one path, centred in the dot. A corner centres its bounding
 * box. Spokes from a junction (three ways) move halfway from the junction to
 * their bounding box's centre: either extreme looks off-centre, since a T's
 * bar outweighs its stem. Symmetric arrows land on the centre either way.
 */
function centeredGlyphPath(strokes: GlyphPoint[][], centreBox: boolean): string {
  const points = strokes.flat();
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const share = centreBox ? 1 : 0.5;
  const dx = -share * (Math.min(...xs) + Math.max(...xs)) / 2;
  const dy = -share * (Math.min(...ys) + Math.max(...ys)) / 2;
  return strokes
    .map((stroke) => stroke
      .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${glyphNumber(x + dx)} ${glyphNumber(y + dy)}`)
      .join(" "))
    .join(" ");
}

function glyphNumber(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}

function add([ax, ay]: GlyphPoint, [bx, by]: GlyphPoint): GlyphPoint {
  return [ax + bx, ay + by];
}

function scale([x, y]: GlyphPoint, factor: number): GlyphPoint {
  return [x * factor, y * factor];
}

function stationImpactDirectionParts(direction: StationImpactArrowDirection): CardinalDirection[] {
  return cardinalDirectionsForArrow(direction);
}

function stationImpactDirectionMetrics(radius: number): {
  extent: number;
  headInset: number;
  headHalf: number;
} {
  return {
    extent: radius * 0.75,
    headInset: radius * 0.3,
    headHalf: radius * 0.25,
  };
}
