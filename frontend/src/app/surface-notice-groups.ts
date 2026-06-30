import type { SurfaceNoticeDetail } from "./surface-notice-data.ts";

export type SurfaceNoticeGroupItem = SurfaceNoticeDetail & {
  primaryStopId: string | null;
  displayLocation: string;
  displayStops: SurfaceNoticeDisplayStop[];
  compactCause: string | null;
  compactDirection: string | null;
};

export type SurfaceNoticeDisplayStop = {
  stopId: string | null;
  stopName: string;
};

export type SurfaceNoticeRouteGroup = {
  key: string;
  category: string;
  routeType: string;
  routeIds: string[];
  routeIdsLabel: string;
  routeName: string | null;
  notices: SurfaceNoticeGroupItem[];
};

export function groupSurfaceNoticesByRoute(
  notices: SurfaceNoticeDetail[]
): SurfaceNoticeRouteGroup[] {
  const groups = new Map<string, SurfaceNoticeRouteGroup>();

  for (const notice of notices) {
    const routeIds = notice.routeIds?.length ? notice.routeIds : ["Route"];
    const routeIdsLabel = routeIds.join(" / ");
    const key = `${notice.category}:${routeIdsLabel}`;
    const group = groups.get(key) ?? {
      key,
      category: notice.category,
      routeType: notice.routeType,
      routeIds,
      routeIdsLabel,
      routeName: deriveRouteName(notice),
      notices: [],
    };

    const displayStops = deriveDisplayStops(notice);
    group.notices.push({
      ...notice,
      primaryStopId: displayStops[0]?.stopId ?? null,
      displayLocation: deriveDisplayLocation(notice, displayStops),
      displayStops,
      compactCause: deriveSurfaceNoticeCause(notice),
      compactDirection: deriveSurfaceNoticeDirection(notice),
    });
    groups.set(key, group);
  }

  return Array.from(groups.values());
}

export function deriveDisplayStops(notice: SurfaceNoticeDetail): SurfaceNoticeDisplayStop[] {
  if (notice.stops?.length) {
    return notice.stops
      .map((stop) => normalizeDisplayStop(stop.stopId, stop.stopName))
      .filter((stop): stop is SurfaceNoticeDisplayStop => stop !== null);
  }

  const location = notice.location?.trim();
  const stopIds = notice.stopIds ?? [];
  if (location && stopIds.length === 1) {
    return [normalizeDisplayStop(stopIds[0], location)].filter((stop): stop is SurfaceNoticeDisplayStop => stop !== null);
  }

  if (location && stopIds.length > 1) {
    const names = splitLocationEndpoints(location);
    if (names.length >= 2) {
      return [
        normalizeDisplayStop(stopIds[0], names[0]),
        normalizeDisplayStop(stopIds[stopIds.length - 1], names[names.length - 1]),
      ].filter((stop): stop is SurfaceNoticeDisplayStop => stop !== null);
    }
  }

  if (stopIds.length > 1) {
    return [
      normalizeDisplayStop(stopIds[0], `Stop ${stopIds[0]}`),
      normalizeDisplayStop(stopIds[stopIds.length - 1], `Stop ${stopIds[stopIds.length - 1]}`),
    ].filter((stop): stop is SurfaceNoticeDisplayStop => stop !== null);
  }

  if (location) {
    return [normalizeDisplayStop(null, location)].filter((stop): stop is SurfaceNoticeDisplayStop => stop !== null);
  }

  if (stopIds.length === 1) {
    return [normalizeDisplayStop(stopIds[0], `Stop ${stopIds[0]}`)].filter((stop): stop is SurfaceNoticeDisplayStop => stop !== null);
  }

  return [];
}

export function deriveDisplayLocation(
  notice: SurfaceNoticeDetail,
  displayStops: SurfaceNoticeDisplayStop[] = deriveDisplayStops(notice),
): string {
  if (displayStops.length === 1) {
    return displayStops[0].stopName;
  }

  if (displayStops.length >= 2) {
    return `${displayStops[0].stopName} to ${displayStops[displayStops.length - 1].stopName}`;
  }

  return notice.location?.trim() || "Route-wide Notice";
}

export function deriveSurfaceNoticeCause(notice: SurfaceNoticeDetail): string | null {
  if (notice.cause && notice.cause.trim()) {
    return trimSentence(notice.cause);
  }

  const text = [notice.title, notice.description].filter(Boolean).join(" ");
  const dueToMatch = text.match(/\bdue to\s+([^.;]+[.]?)/i);
  if (dueToMatch?.[1]) {
    return trimSentence(dueToMatch[1]);
  }

  const whileMatch = text.match(/\bwhile\s+([^.;]+[.]?)/i);
  if (whileMatch?.[1]) {
    return trimSentence(whileMatch[1]);
  }

  return firstSentence(notice.title || notice.description);
}

export function deriveSurfaceNoticeDirection(notice: SurfaceNoticeDetail): string | null {
  if (notice.direction && notice.direction.trim()) {
    return normalizeDirection(notice.direction);
  }

  const text = `${notice.title} ${notice.description}`.toLowerCase();
  if (text.includes("both ways") || text.includes("both directions")) {
    return "Both ways";
  }

  const directionalMatch = text.match(/\b(northbound|southbound|eastbound|westbound)\b/);
  if (directionalMatch?.[1]) {
    return titleCase(directionalMatch[1]);
  }

  return null;
}

function deriveRouteName(notice: SurfaceNoticeDetail): string | null {
  const textParts = [notice.title, notice.description].filter(Boolean);
  const text = textParts.join(" ");
  for (const routeId of notice.routeIds ?? []) {
    const escapedRoute = routeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const routeNameMatch = text.match(new RegExp(`(?:^|[^A-Za-z0-9])${escapedRoute}(?![A-Za-z0-9])\\s+([^:;.!?\\n]+)`, "i"));
    const candidate = cleanRouteDescriptor(routeNameMatch?.[1], notice);
    if (candidate) {
      return candidate;
    }
  }

  for (const part of textParts) {
    const toMatch = part.match(/^\s*(to\s+.+?)(?:\s+[-\u2013]\s+|,?\s+(?:temporary route change|route change|service change|detour|no service|due to)\b|$)/i);
    const candidate = cleanRouteDescriptor(toMatch?.[1], notice);
    if (candidate) {
      return candidate;
    }
  }

  for (const part of textParts) {
    const candidate = cleanRouteDescriptor(part, notice);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function cleanRouteDescriptor(
  value: string | null | undefined,
  notice: SurfaceNoticeDetail,
): string | null {
  if (!value || !value.trim()) {
    return null;
  }

  let candidate = value.trim().replace(/\s+/g, " ");
  candidate = candidate.replace(/^(?:\d{2,6}[A-Z]?\s+)+/i, "");
  candidate = candidate.replace(/\s+[-\u2013]\s+.*$/i, "");
  candidate = candidate.replace(/\s+\b(?:streetcars?|buses?)\s+(?:track|road|lane|route|service)\b.*$/i, "");
  candidate = candidate.replace(/\b(?:temporary route change|route change|service change|track renewal work|renewal work|bridge work|due to|while)\b.*$/i, "");
  candidate = candidate.replace(/^[\s:,-]+|[\s:,-]+$/g, "").trim();

  if (!candidate) {
    return null;
  }
  if (notice.routeType && candidate.toLowerCase() === notice.routeType.toLowerCase()) {
    return null;
  }
  if (candidate.match(/^(temporary|route|service|streetcars?|buses?|no service|detour|diversion|modified)\b/i)) {
    return null;
  }
  if (candidate.length > 60) {
    return null;
  }

  return candidate;
}

function firstSentence(value?: string | null): string | null {
  if (!value || !value.trim()) {
    return null;
  }
  const sentence = value.trim().match(/^[^.!?]+[.!?]?/);
  return sentence?.[0] ? trimSentence(sentence[0]) : null;
}

function trimSentence(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return trimmed;
  }
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function normalizeDirection(value: string): string {
  const lower = value.trim().toLowerCase();
  if (lower === "both way" || lower === "both ways" || lower === "both directions") {
    return "Both ways";
  }
  return titleCase(value);
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function normalizeDisplayStop(
  rawStopId: string | null | undefined,
  rawStopName: string | null | undefined,
): SurfaceNoticeDisplayStop | null {
  const stopId = rawStopId?.trim() || null;
  const stopName = rawStopName?.trim() || "";

  if (!stopId && !stopName) {
    return null;
  }

  if (stopName && stopId && stopName !== stopId) {
    return { stopId: isNumeric(stopId) ? stopId : null, stopName };
  }

  if (stopName && !isNumeric(stopName)) {
    return { stopId: null, stopName };
  }

  if (stopId && isNumeric(stopId)) {
    return { stopId, stopName: `Stop ${stopId}` };
  }

  return { stopId: null, stopName: stopName || stopId || "" };
}

function splitLocationEndpoints(location: string): string[] {
  const toParts = location.split(/\s+to\s+/i).map((part) => part.trim()).filter(Boolean);
  if (toParts.length >= 2) {
    return toParts;
  }

  return location.split(",").map((part) => part.trim()).filter(Boolean);
}

function isNumeric(value: string | null | undefined): boolean {
  return Boolean(value && /^\d+$/.test(value));
}
