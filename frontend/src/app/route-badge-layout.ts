/**
 * How a notice row arranges its route badges in its fixed route column
 * (current-service.css): one badge, centered and larger; square badges (codes
 * of up to two characters) in a two-column grid, so 2 sit side by side and 3-4
 * form a 2x2; any longer code ("24B", "300A") stacks one per row, centered.
 */
export type RouteBadgeLayout = "single" | "grid" | "stack";

export function currentServiceRouteLayout(routeIds: readonly string[]): RouteBadgeLayout {
  if (routeIds.length <= 1) return "single";
  return routeIds.every((route) => route.trim().length <= 2) ? "grid" : "stack";
}
