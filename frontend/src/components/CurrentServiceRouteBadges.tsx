import { goNoticeRouteBadgeStyle, goNoticeRouteLabel } from "../app/go-bus-route-colors";
import { currentServiceRouteBadges } from "../app/route-badge-layout";
import { ttcRouteBadgeStyle } from "../app/ttc-route-badge";

/**
 * A surface notice row's route column (Current Service and the desktop status
 * overview): its badges arranged beside the divider by currentServiceRouteBadges.
 */
export function CurrentServiceRouteBadges({ routeIds, regional }: { routeIds: readonly string[]; regional: boolean }) {
  if (!routeIds.length) return null;
  const { layout, shown, hidden } = currentServiceRouteBadges(routeIds);
  const size = layout === "single" ? " is-large" : "";
  return (
    <span className="current-service-routes" data-route-layout={layout}>
      {shown.map((route) => (
        <span
          className={`current-service-route route-code-badge${size}`}
          key={route}
          style={regional ? goNoticeRouteBadgeStyle(route) : ttcRouteBadgeStyle(route)}
          aria-label={regional ? goNoticeRouteLabel(route) : undefined}
        >
          {route}
        </span>
      ))}
      {hidden > 0 ? (
        <span
          className="current-service-route route-code-badge is-overflow"
          aria-label={`and ${hidden} more ${hidden === 1 ? "route" : "routes"}`}
          title={routeIds.slice(shown.length).join(", ")}
        >
          +{hidden}
        </span>
      ) : null}
    </span>
  );
}
