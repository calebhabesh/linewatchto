export type ImpactListSort = "updated" | "line" | "location" | "soonest";

export type ImpactListControls = {
  lineId: string | "all";
  sort: ImpactListSort;
  query?: string;
};

type SortableImpact = {
  id: string;
  lineId: string;
  lineNumber?: string;
  title: string;
  location: string;
  description?: string;
  displayDirection?: string | null;
  cause?: string | null;
  updatedAt?: string | null;
  activeNow?: boolean;
  nextWindowStart?: string | null;
  activeWindowStart?: string | null;
};

function timestamp(value: string | null | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function lineNumber(item: SortableImpact) {
  const parsed = Number(item.lineNumber ?? item.lineId.replace("line-", ""));
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function filterAndSortImpacts<T extends SortableImpact>(items: T[], controls: ImpactListControls): T[] {
  const lineFiltered = controls.lineId === "all"
    ? [...items]
    : items.filter((item) => item.lineId === controls.lineId);
  const normalizedQuery = controls.query?.trim().toLocaleLowerCase() ?? "";
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const filtered = queryTokens.length === 0
    ? lineFiltered
    : lineFiltered.filter((item) => {
        const document = [
          item.title,
          item.location,
          item.description,
          item.displayDirection,
          item.cause,
          `line ${item.lineNumber ?? item.lineId.replace("line-", "")}`,
        ].filter(Boolean).join(" ").toLocaleLowerCase();
        return queryTokens.every((token) => document.includes(token));
      });

  return filtered.sort((a, b) => {
    if (controls.sort === "updated") {
      return timestamp(b.updatedAt, 0) - timestamp(a.updatedAt, 0) || a.title.localeCompare(b.title);
    }
    if (controls.sort === "line") {
      return lineNumber(a) - lineNumber(b) || a.location.localeCompare(b.location) || a.title.localeCompare(b.title);
    }
    if (controls.sort === "location") {
      return a.location.localeCompare(b.location) || lineNumber(a) - lineNumber(b) || a.title.localeCompare(b.title);
    }

    if (a.activeNow !== b.activeNow) return a.activeNow ? -1 : 1;
    const aStart = timestamp(a.nextWindowStart ?? a.activeWindowStart, Number.MAX_SAFE_INTEGER);
    const bStart = timestamp(b.nextWindowStart ?? b.activeWindowStart, Number.MAX_SAFE_INTEGER);
    return aStart - bStart || lineNumber(a) - lineNumber(b) || a.title.localeCompare(b.title);
  });
}
