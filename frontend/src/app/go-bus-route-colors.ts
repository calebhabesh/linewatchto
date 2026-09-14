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
