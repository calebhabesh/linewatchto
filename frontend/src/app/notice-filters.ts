import type { SurfaceNoticeDetail } from "./surface-notice-data.ts";

export const canonicalNoticeRoute = (route: string) => {
  const code = route.trim().toUpperCase();
  return code === "GT" ? "KI" : code;
};

export function matchesNoticeFilters(notice: SurfaceNoticeDetail, filters: {
  route?: string; service?: string; category?: string; timing?: string; query?: string;
}, now: number) {
  const routes = notice.routeIds.map(canonicalNoticeRoute);
  if (filters.route && filters.route !== "all"
    && (filters.route === "unspecified" ? routes.length > 0 : !routes.includes(canonicalNoticeRoute(filters.route)))) return false;
  if (filters.service && filters.service !== "all") {
    const matchesService = filters.service === "train" ? notice.routeType !== "GO Bus"
      : notice.routeType === (filters.service === "bus" ? "GO Bus" : filters.service);
    if (!matchesService) return false;
  }
  if (filters.category && filters.category !== "all" && notice.category !== filters.category) return false;
  const start = Date.parse(notice.startAt ?? "");
  const end = Date.parse(notice.endAt ?? "");
  if (filters.timing === "upcoming" && !(start > now)) return false;
  if (filters.timing === "ongoing" && !(start <= now && (!Number.isFinite(end) || end > now))) return false;
  if (filters.timing === "unknown" && Number.isFinite(start)) return false;
  const text = [notice.title, notice.description, notice.location, notice.direction, notice.cause,
    notice.source, notice.routeType, ...routes, ...notice.stopIds, ...(notice.stops ?? []).map(stop => stop.stopName)]
    .filter(Boolean).join(" ").toLocaleLowerCase();
  return (filters.query ?? "").trim().toLocaleLowerCase().split(/\s+/).every(term => text.includes(term));
}


// Each dropdown respects every other filter, while keeping alternatives in its
// own dimension available (for example, switching between matching routes).
export function noticeFacetRows(notices: SurfaceNoticeDetail[],
  filters: Parameters<typeof matchesNoticeFilters>[1],
  facet: "service" | "route" | "category" | "timing", now: number) {
  return notices.filter(notice => matchesNoticeFilters(notice, { ...filters, [facet]: "all" }, now));
}
