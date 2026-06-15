import type { SurfaceNoticeDetail } from "./surface-notice-data.ts";

export type SurfaceNoticeGroupItem = SurfaceNoticeDetail & {
  primaryStopId: string | null;
  compactCause: string | null;
  compactDirection: string | null;
};

export type SurfaceNoticeRouteGroup = {
  key: string;
  category: string;
  routeType: string;
  routeIds: string[];
  routeIdsLabel: string;
  routeName: string;
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

    group.notices.push({
      ...notice,
      primaryStopId: notice.stopIds?.[0] ?? null,
      compactCause: deriveSurfaceNoticeCause(notice),
      compactDirection: deriveSurfaceNoticeDirection(notice),
    });
    groups.set(key, group);
  }

  return Array.from(groups.values());
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

function deriveRouteName(notice: SurfaceNoticeDetail): string {
  const text = [notice.title, notice.description].filter(Boolean).join(" ");
  for (const routeId of notice.routeIds ?? []) {
    const escapedRoute = routeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const routeNameMatch = text.match(new RegExp(`\\b${escapedRoute}\\s+([^:–-]+)`, "i"));
    const candidate = routeNameMatch?.[1]?.trim();
    if (candidate && !candidate.match(/^(temporary|route|service|streetcars|buses)\b/i)) {
      return candidate;
    }
  }

  return notice.routeType || "Surface";
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
