// Reviewed GO route identity colors, not disruption severity.
// Source: https://www.gotransit.com/en/see-schedules/pdf-schedules (2026-09-14).
// Route 11 also appears in the supplied GO schedule reference.
const groups: [string, string[]][] = [
  ["#98002e", ["11", "15"]],
  ["#f78025", ["17", "21", "22", "25", "27"]],
  ["#f57f25", ["19"]],
  ["#00853e", ["29", "30", "31", "33"]],
  ["#a11984", ["40", "41", "47", "48", "94"]],
  ["#6f298d", ["52", "56"]],
  ["#0099c7", ["61"]],
  ["#003767", ["65", "67", "68"]],
  ["#794500", ["70", "71"]],
  ["#ff0d00", ["88", "90", "92", "96"]],
];
const colors = new Map(groups.flatMap(([color, routes]) => routes.map(route => [route, color] as const)));

export function goBusRouteColor(route: string) {
  // Published letter branches retain their parent route's identity.
  const base = /^(\d+)[A-Z]*$/i.exec(route.trim())?.[1];
  return base ? colors.get(String(Number(base))) ?? "#52616b" : "#52616b";
}

export function goBusRouteTextColor(route: string) {
  return ["#f78025", "#f57f25", "#0099c7"].includes(goBusRouteColor(route)) ? "#101820" : "#ffffff";
}

const REGIONAL_TRAIN_LINE_COLORS: Record<string, string> = {
  BR: "#155ba0",
  "GO-BR": "#155ba0",
  "REGIONAL-BR": "#155ba0",
  KI: "#138336",
  "GO-KI": "#138336",
  "REGIONAL-KI": "#138336",
  GT: "#138336",
  "GO-GT": "#138336",
  "REGIONAL-GT": "#138336",
  LE: "#ee2722",
  "GO-LE": "#ee2722",
  "REGIONAL-LE": "#ee2722",
  LW: "#8b0a31",
  "GO-LW": "#8b0a31",
  "REGIONAL-LW": "#8b0a31",
  MI: "#f47216",
  "GO-MI": "#f47216",
  "REGIONAL-MI": "#f47216",
  RH: "#27adea",
  "GO-RH": "#27adea",
  "REGIONAL-RH": "#27adea",
  ST: "#774111",
  "GO-ST": "#774111",
  "REGIONAL-ST": "#774111",
  UP: "#4084cd",
  "UP-EXPRESS": "#4084cd",
  "REGIONAL-UP": "#4084cd",
};

const REGIONAL_TRAIN_LINE_NAMES: Record<string, string> = {
  BR: "Barrie",
  "GO-BR": "Barrie",
  "REGIONAL-BR": "Barrie",
  KI: "Kitchener",
  "GO-KI": "Kitchener",
  "REGIONAL-KI": "Kitchener",
  GT: "Kitchener",
  "GO-GT": "Kitchener",
  "REGIONAL-GT": "Kitchener",
  LE: "Lakeshore East",
  "GO-LE": "Lakeshore East",
  "REGIONAL-LE": "Lakeshore East",
  LW: "Lakeshore West",
  "GO-LW": "Lakeshore West",
  "REGIONAL-LW": "Lakeshore West",
  MI: "Milton",
  "GO-MI": "Milton",
  "REGIONAL-MI": "Milton",
  RH: "Richmond Hill",
  "GO-RH": "Richmond Hill",
  "REGIONAL-RH": "Richmond Hill",
  ST: "Stouffville",
  "GO-ST": "Stouffville",
  "REGIONAL-ST": "Stouffville",
  UP: "UP Express",
  "UP-EXPRESS": "UP Express",
  "REGIONAL-UP": "UP Express",
};

export function goNoticeRouteColor(route: string): string {
  const trainColor = REGIONAL_TRAIN_LINE_COLORS[route.trim().toUpperCase()];
  if (trainColor) return trainColor;
  return goBusRouteColor(route);
}

export function goNoticeRouteTextColor(route: string): string {
  const trainColor = REGIONAL_TRAIN_LINE_COLORS[route.trim().toUpperCase()];
  if (trainColor) return "#ffffff";
  return goBusRouteTextColor(route);
}

export function goNoticeRouteBadgeStyle(route: string) {
  return {
    backgroundColor: goNoticeRouteColor(route),
    color: goNoticeRouteTextColor(route),
  };
}

export function goNoticeRouteLabel(route: string): string {
  const normalized = route.trim().toUpperCase();
  const trainName = REGIONAL_TRAIN_LINE_NAMES[normalized];
  if (trainName) {
    return trainName === "UP Express" ? trainName : `${trainName} Line`;
  }
  if (normalized === "GO") return "GO Transit";
  return `GO Bus ${route}`;
}

