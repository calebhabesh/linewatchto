/**
 * TTC surface route badge colours, by route family, matching the colours the
 * published TTC GTFS gives each route (routes.txt route_color, feed S1000544;
 * every bus and streetcar route follows its number range):
 *
 * - regular routes: red ED1C24, white number;
 * - 300-series night routes: blue 0054A6, drawn as blue on white with a blue
 *   edge, as the TTC draws its night badges;
 * - 400-series Community routes: grey 6D6E71, white number;
 * - 900-series Express routes: green 00A651, white number;
 * - Lines 5 and 6 (light rail, GTFS route_type 0 like streetcars, so they can
 *   appear in stop data): the app's authored line colours.
 */
import { TTC_LINE_COLORS } from "./geographic-config.ts";

export const TTC_NIGHT_ROUTE_BLUE = "#0054A6";
export const TTC_DAY_ROUTE_RED = "#ED1C24";
export const TTC_COMMUNITY_ROUTE_GREY = "#6D6E71";
export const TTC_EXPRESS_ROUTE_GREEN = "#00A651";

export type TtcRouteFamily = "regular" | "night" | "community" | "express" | "line-5" | "line-6";

export function ttcRouteFamily(route: string): TtcRouteFamily {
  const value = route.trim();
  if (value === "5") return "line-5";
  if (value === "6") return "line-6";
  if (/^3\d\d[A-Za-z]?$/.test(value)) return "night";
  if (/^4\d\d[A-Za-z]?$/.test(value)) return "community";
  if (/^9\d\d[A-Za-z]?$/.test(value)) return "express";
  return "regular";
}

export function isTtcNightRoute(route: string): boolean {
  return ttcRouteFamily(route) === "night";
}

/** Fill, number colour and edge (null: no edge) for a route's badge. */
export function ttcRouteBadgeColors(route: string): { fill: string; text: string; edge: string | null } {
  switch (ttcRouteFamily(route)) {
    case "night":
      return { fill: "#FFFFFF", text: TTC_NIGHT_ROUTE_BLUE, edge: TTC_NIGHT_ROUTE_BLUE };
    case "community":
      return { fill: TTC_COMMUNITY_ROUTE_GREY, text: "#FFFFFF", edge: null };
    case "express":
      return { fill: TTC_EXPRESS_ROUTE_GREEN, text: "#FFFFFF", edge: null };
    case "line-5":
      return { fill: TTC_LINE_COLORS["line-5"], text: "#FFFFFF", edge: null };
    case "line-6":
      return { fill: TTC_LINE_COLORS["line-6"], text: "#FFFFFF", edge: null };
    default:
      return { fill: TTC_DAY_ROUTE_RED, text: "#FFFFFF", edge: null };
  }
}

/**
 * Inline style for a route badge: fill and number, and where the family has an
 * edge, a solid border that is the badge's outermost line (nothing white
 * outside it), thick enough to read at badge size.
 */
export function ttcRouteBadgeStyle(route: string): { backgroundColor: string; color: string; border?: string } {
  const colors = ttcRouteBadgeColors(route);
  return colors.edge
    ? { backgroundColor: colors.fill, color: colors.text, border: `2.5px solid ${colors.edge}` }
    : { backgroundColor: colors.fill, color: colors.text };
}
