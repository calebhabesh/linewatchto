/**
 * How a notice row arranges its route badges in its fixed route column
 * (current-service.css), centred beside the row's divider:
 *   1 route   one larger badge
 *   2 routes  side by side
 *   3 routes  two, then one centred below
 *   4 routes  a 2x2 grid
 *   5+        three badges and a "+N" badge, so a row is never taller than two badges
 * Codes of up to two characters use the standard square badge; a grid with any
 * three-character code ("11C", "124") uses the compact size so two still fit side by
 * side. Only a code too long for even that ("300A") stands alone on its line.
 */
export type RouteBadgeLayout = "single" | "grid" | "grid-compact" | "stack";

export const MAX_ROUTE_BADGES = 4;

export type RouteBadgeArrangement = {
  layout: RouteBadgeLayout;
  /** The routes drawn as badges, in the notice's order. */
  shown: string[];
  /** Routes summarised by the "+N" badge (0: none). */
  hidden: number;
};

export function currentServiceRouteBadges(routeIds: readonly string[]): RouteBadgeArrangement {
  const routes = routeIds.map((route) => route.trim()).filter(Boolean);
  const shown = routes.length > MAX_ROUTE_BADGES ? routes.slice(0, MAX_ROUTE_BADGES - 1) : routes;
  const hidden = routes.length - shown.length;
  const longest = Math.max(0, ...shown.map((route) => route.length), hidden > 0 ? `+${hidden}`.length : 0);
  const layout: RouteBadgeLayout = routes.length <= 1
    ? "single"
    : longest <= 2 ? "grid" : longest <= 3 ? "grid-compact" : "stack";
  return { layout, shown, hidden };
}
