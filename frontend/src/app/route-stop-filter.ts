/**
 * The route panel's stop filter: narrows a route's stops by name or number.
 * Words match as the main search's do ("avenue" finds "Ave", "saint" finds
 * "St", in any order); a number also matches anywhere in a stop's number.
 */
import type { RouteDirection, RouteVariant } from "./surface-route-stops.ts";
import { stopNameTokens, stopNumberFromQuery } from "./surface-search.ts";

export type TextRange = readonly [start: number, end: number];
export type RouteStopMatch = { name: TextRange[]; code: TextRange[] };

type StopNameOf = (code: string) => string;

function mergeRanges(ranges: TextRange[]): TextRange[] {
  const merged: [number, number][] = [];
  for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** The words a query asks for; empty when it asks for nothing (blank, or only "and"). */
export function routeStopFilterTokens(query: string): string[] {
  const number = stopNumberFromQuery(query);
  return number ? [number] : stopNameTokens(query).slice(0, 8);
}

/** Where a stop matches every token, for highlighting; null when one is missing. */
export function matchRouteStop(tokens: readonly string[], code: string, name: string): RouteStopMatch | null {
  const nameWords = [...name.matchAll(/[\p{L}\p{N}]+/gu)].map((found) => {
    const raw = found[0].toLowerCase();
    return { start: found.index, raw, short: stopNameTokens(found[0])[0] ?? raw, length: found[0].length };
  });
  const nameRanges: TextRange[] = [];
  const codeRanges: TextRange[] = [];
  for (const token of tokens) {
    let found = false;
    for (const word of nameWords) {
      if (word.raw.startsWith(token)) nameRanges.push([word.start, word.start + token.length]);
      // Matched through its short form ("avenue" on "Ave"): the whole word is the match.
      else if (word.short.startsWith(token)) nameRanges.push([word.start, word.start + word.length]);
      else continue;
      found = true;
    }
    if (/^\d+$/.test(token)) {
      const at = code.indexOf(token);
      if (at >= 0) {
        codeRanges.push([at, at + token.length]);
        found = true;
      }
    }
    if (!found) return null;
  }
  return { name: mergeRanges(nameRanges), code: mergeRanges(codeRanges) };
}

export function countBranchMatches(tokens: readonly string[], stops: readonly string[], nameOf: StopNameOf): number {
  return stops.filter((code) => matchRouteStop(tokens, code, nameOf(code))).length;
}

/** A direction's matches: each stop once, however many of its branches serve it. */
export function countDirectionMatches(tokens: readonly string[], direction: RouteDirection, nameOf: StopNameOf): number {
  const codes = new Set(direction.branches.flatMap((branch) => branch.stops));
  return countBranchMatches(tokens, [...codes], nameOf);
}

export function countVariantMatches(tokens: readonly string[], variant: RouteVariant, nameOf: StopNameOf): number {
  const codes = new Set(variant.directions.flatMap((direction) => direction.branches.flatMap((branch) => branch.stops)));
  return countBranchMatches(tokens, [...codes], nameOf);
}

export type RouteStopAlternative = { variant: string; direction: number; label: string; count: number };

/**
 * Where else this route has matches, when the list showing has none: the
 * selected branch's other direction first, then the other branches.
 */
export function routeStopAlternatives(
  tokens: readonly string[],
  variants: readonly RouteVariant[],
  current: { variant: string; direction: number },
  nameOf: StopNameOf,
): RouteStopAlternative[] {
  const found: RouteStopAlternative[] = [];
  const ordered = [...variants].sort((a, b) => Number(b.id === current.variant) - Number(a.id === current.variant));
  for (const variant of ordered) {
    for (const direction of variant.directions) {
      if (variant.id === current.variant && direction.direction === current.direction) continue;
      const count = countBranchMatches(tokens, direction.branches[0]?.stops ?? [], nameOf);
      if (count === 0) continue;
      const label = variants.length > 1 ? `${variant.code} ${direction.label}` : direction.label;
      found.push({ variant: variant.id, direction: direction.direction, label, count });
    }
  }
  return found;
}
