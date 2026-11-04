/**
 * Surface route and stop search (plan 14, U2).
 *
 * Reads the generated search index (scripts/generate-search-index.mjs,
 * one file per network) and answers each keystroke from tokens built once,
 * when the file loads. Results are wayfinding from published static GTFS:
 * nothing here says whether a route or stop has service now.
 */

import type { NetworkId } from "./dashboard-contract.ts";

export type SurfaceRouteKind = "streetcar" | "bus" | "express" | "night-streetcar" | "night-bus" | "go-bus";

/** The JSON the generator writes (scripts/lib/search-index.mjs documents it). */
export type SurfaceSearchIndexFile = {
  schemaVersion: string;
  network: "ttc" | "regional";
  sources: { layer: string; feedVersion: string; feedStartDate: string; feedEndDate: string; servicePattern: string }[];
  colors: string[];
  routes: {
    route: string[];
    name: string[];
    kind: SurfaceRouteKind[];
    color: number[];
    textColor: number[];
    drawn: (0 | 1)[];
    source: number[];
  };
  stops: {
    code?: string[];
    codeDelta?: number[];
    name: string[];
    lonDeltaE5: number[];
    latDeltaE5: number[];
    routes: string[];
  };
  stations?: Record<string, string>;
};

export type SurfaceSchedulePeriod = { layer: string; feedStartDate: string; feedEndDate: string; servicePattern: string };

export type SurfaceSearchRoute = {
  network: NetworkId;
  route: string;
  name: string;
  kind: SurfaceRouteKind;
  color: string;
  textColor: string;
  drawn: boolean;
  period: SurfaceSchedulePeriod;
};

export type SurfaceSearchStop = {
  network: NetworkId;
  code: string;
  name: string;
  lon: number;
  lat: number;
  routes: string[];
  /** LineWatch station id when the stop is inside a subway station. */
  station: string | null;
};

export type PreparedSurfaceIndex = {
  network: NetworkId;
  routes: SurfaceSearchRoute[];
  stops: SurfaceSearchStop[];
  stopByCode: Map<string, number>;
  /** Sorted unique stop-name tokens, with the stops that carry each. */
  vocabulary: string[];
  postings: Uint32Array[];
  /** Per stop: name tokens in order, for scoring candidates. */
  stopTokens: string[][];
  /** Per stop: intersection key, for grouping opposite-side poles; filled when first matched. */
  groupKeys: (string | undefined)[];
  routeNameTokens: string[][];
};

// Long and short forms riders and the feeds use. Both forms are indexed, so a
// half-typed long form ("aven") still finds "Ave".
const ABBREVIATIONS: Record<string, string> = {
  street: "st",
  saint: "st",
  avenue: "ave",
  av: "ave",
  road: "rd",
  boulevard: "blvd",
  drive: "dr",
  crescent: "cres",
  court: "crt",
  ct: "crt",
  place: "pl",
  parkway: "pkwy",
  highway: "hwy",
  square: "sq",
  gardens: "gdns",
  gate: "gt",
  circle: "cir",
  lane: "ln",
  terrace: "ter",
  trail: "trl",
  heights: "hts",
  mount: "mt",
  centre: "ctr",
  center: "ctr",
  station: "stn",
  terminal: "term",
  east: "e",
  west: "w",
  north: "n",
  south: "s",
};
const LONG_FORM: Record<string, string> = Object.fromEntries(
  Object.entries(ABBREVIATIONS)
    .filter(([long]) => !["saint", "av", "ct", "center"].includes(long))
    .map(([long, short]) => [short, long]),
);
// Joiners riders type or skip: "dufferin and steeles", "dufferin & steeles", "dufferin at steeles".
const JOINERS = new Set(["and", "at", "side", "of", "the"]);
// A query of only these ("st", "ave", "west") matches most stops: no stop-name rows until another word.
const GENERIC = new Set([...Object.keys(ABBREVIATIONS), ...Object.values(ABBREVIATIONS)]
  .filter((word) => !["station", "stn", "terminal", "term"].includes(word)));
const DIRECTIONS = new Set(["e", "w", "n", "s"]);

/** Lowercase words with accents and punctuation removed; "&" and "@" become words. */
function words(value: string): string[] {
  // Unicode normalization is most of the cost of building the index; stop names are nearly all ASCII.
  const plain = /^[\x00-\x7f]*$/.test(value) ? value : value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return plain
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/@/g, " at ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** A whole word in its short form ("Avenue" and "Ave" are both "ave"). */
export function canonicalToken(word: string): string {
  return ABBREVIATIONS[word] ?? word;
}

/** Stop-name tokens: short forms, joiners dropped. */
export function stopNameTokens(name: string): string[] {
  return words(name).filter((word) => !JOINERS.has(word)).map(canonicalToken);
}

/**
 * The intersection a pole stands at, so its other corners group with it:
 * the streets in either order, without directions or the side of the street.
 * "Dufferin St at Steeles Ave West North Side" and "Steeles Ave West at
 * Dufferin St" share one key.
 */
export function intersectionKey(name: string): string {
  const streets = name
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+(?:at|@)\s+/i)
    .map((street) => words(street)
      .map(canonicalToken)
      .filter((token) => !JOINERS.has(token) && !DIRECTIONS.has(token) && token !== "opposite")
      .join(" "))
    .filter(Boolean);
  return streets.sort().join(" | ");
}

/** Name for a group of poles: the shared name without its side of the street. */
export function intersectionLabel(name: string): string {
  return name.replace(/\s+(?:North|South|East|West|NE|NW|SE|SW)\s+Side$/i, "").trim();
}

function decodeStops(file: SurfaceSearchIndexFile, network: NetworkId): SurfaceSearchStop[] {
  const { stops } = file;
  const out: SurfaceSearchStop[] = new Array(stops.name.length);
  let code = 0, lon = 0, lat = 0;
  for (let i = 0; i < stops.name.length; i++) {
    if (stops.codeDelta) code += stops.codeDelta[i];
    lon += stops.lonDeltaE5[i];
    lat += stops.latDeltaE5[i];
    const stopCode = stops.codeDelta ? String(code) : stops.code![i];
    out[i] = {
      network,
      code: stopCode,
      name: stops.name[i],
      lon: lon / 1e5,
      lat: lat / 1e5,
      routes: stops.routes[i] ? stops.routes[i].split(" ") : [],
      station: file.stations?.[stopCode] ?? null,
    };
  }
  return out;
}

const PREPARE_SLICE = 500;

/** The token build in slices: each `yield` is a point where the page may run. */
function* prepareSteps(file: SurfaceSearchIndexFile): Generator<void, PreparedSurfaceIndex> {
  const network: NetworkId = file.network === "regional" ? "regional" : "ttc";
  const stops = decodeStops(file, network);
  const routes: SurfaceSearchRoute[] = file.routes.route.map((route, i) => {
    const source = file.sources[file.routes.source[i]];
    return {
      network,
      route,
      name: file.routes.name[i],
      kind: file.routes.kind[i],
      color: file.colors[file.routes.color[i]],
      textColor: file.colors[file.routes.textColor[i]],
      drawn: file.routes.drawn[i] === 1,
      period: {
        layer: source.layer,
        feedStartDate: source.feedStartDate,
        feedEndDate: source.feedEndDate,
        servicePattern: source.servicePattern,
      },
    };
  });
  yield;

  const stopTokens: string[][] = new Array(stops.length);
  const lists = new Map<string, number[]>();
  const add = (token: string, index: number) => {
    const list = lists.get(token);
    if (!list) lists.set(token, [index]);
    else if (list[list.length - 1] !== index) list.push(index);
  };
  for (let index = 0; index < stops.length; index++) {
    const tokens = stopNameTokens(stops[index].name);
    stopTokens[index] = tokens;
    for (const token of tokens) {
      add(token, index);
      const long = LONG_FORM[token];
      if (long) add(long, index);
    }
    if (index % PREPARE_SLICE === PREPARE_SLICE - 1) yield;
  }
  const vocabulary = [...lists.keys()].sort();
  yield;
  return {
    network,
    routes,
    stops,
    stopByCode: new Map(stops.map((stop, index) => [stop.code, index])),
    vocabulary,
    postings: vocabulary.map((token) => Uint32Array.from(lists.get(token)!)),
    stopTokens,
    groupKeys: new Array(stops.length),
    routeNameTokens: routes.map((route) => stopNameTokens(route.name)),
  };
}

/** Builds every token once, when the index file loads. */
export function prepareSurfaceSearchIndex(file: SurfaceSearchIndexFile): PreparedSurfaceIndex {
  const steps = prepareSteps(file);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * The same build, giving the page a turn whenever a slice has run for
 * `budgetMs`, so the first search focus never blocks input (plan 14, U3).
 */
export async function prepareSurfaceSearchIndexInSlices(
  file: SurfaceSearchIndexFile,
  { budgetMs = 6, yieldToPage = () => new Promise<void>((resolve) => setTimeout(resolve, 0)) }: { budgetMs?: number; yieldToPage?: () => Promise<void> } = {},
): Promise<PreparedSurfaceIndex> {
  const steps = prepareSteps(file);
  let sliceStart = performance.now();
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
    if (performance.now() - sliceStart >= budgetMs) {
      await yieldToPage();
      sliceStart = performance.now();
    }
  }
}

function lowerBound(sorted: string[], value: string) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Marks `bit` on every stop with a name token starting with `prefix`. */
function markStopsWithPrefix(index: PreparedSurfaceIndex, prefix: string, marks: Uint8Array, bit: number) {
  const { vocabulary, postings } = index;
  for (let i = lowerBound(vocabulary, prefix); i < vocabulary.length && vocabulary[i].startsWith(prefix); i++) {
    const list = postings[i];
    for (let k = 0; k < list.length; k++) marks[list[k]] |= bit;
  }
}

const scratchMarks = new WeakMap<PreparedSurfaceIndex, Uint8Array>();

/** A stop number in the query: "7658", "stop 7658", "#7658". */
export function stopNumberFromQuery(query: string): string | null {
  const trimmed = query.trim().replace(/^(?:stop|#)\s*/i, "");
  return /^\d{1,6}$/.test(trimmed) ? trimmed : null;
}

const withoutLeadingZeros = (code: string) => code.replace(/^0+(?=\d)/, "");

export type StopMatch = "exact-number" | "number-prefix" | "name";

export type SurfaceStopGroup = {
  network: NetworkId;
  key: string;
  /** Shared name without the side of the street. */
  label: string;
  /** Poles at this intersection, best match first. */
  stops: SurfaceSearchStop[];
  /** Every route at the group's poles. */
  routes: string[];
  match: StopMatch;
  score: number;
};

/** `total` counts every matching place; `groups` holds at most the limit asked for. */
export type SurfaceStopSearch = { groups: SurfaceStopGroup[]; total: number; exactNumber: boolean };

// Poles with one intersection key further apart than this are separate places.
const GROUP_RADIUS_METERS = 250;

export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6_371_000;
}

const routeOrder = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

/** Scores a candidate stop's name against the query tokens (lower is better). */
function nameScore(tokens: string[], query: string[]): number {
  let score = 0;
  let used = 0;
  for (let q = 0; q < query.length; q++) {
    const queryToken = query[q];
    let best = -1, bestCost = Infinity;
    for (let t = 0; t < tokens.length; t++) {
      if (t < 31 && used & (1 << t)) continue;
      const token = tokens[t];
      const long = LONG_FORM[token];
      const exact = token === queryToken || long === queryToken;
      const prefix = exact || token.startsWith(queryToken) || (long?.startsWith(queryToken) ?? false);
      if (!prefix) continue;
      // Whole words beat prefixes; a first query word on the stop's first street beats one later.
      const cost = (exact ? 0 : 4) + (q === 0 && t === 0 ? 0 : 2) + t * 0.1;
      if (cost < bestCost) {
        bestCost = cost;
        best = t;
      }
    }
    // The same word twice ("king king") may reuse a token.
    if (best < 0) return Infinity;
    if (best < 31) used |= 1 << best;
    score += bestCost;
  }
  // Fewer unmatched words: "Queen St at Dufferin St" before "Queen St West at Dufferin St North Side".
  return score + (tokens.length - query.length) * 0.5;
}

/**
 * Groups matches (best first) into places. Only the first `limit` places are
 * built; later matches join them or are only counted, so "st" (thousands of
 * stops) costs no more to show than "dufferin".
 */
function groupStops(
  matches: { index: PreparedSurfaceIndex; stop: number; score: number; match: StopMatch }[],
  limit: number,
): { groups: SurfaceStopGroup[]; total: number } {
  const groups: (SurfaceStopGroup & { anchor: SurfaceSearchStop })[] = [];
  const byKey = new Map<string, (SurfaceStopGroup & { anchor: SurfaceSearchStop })[]>();
  const counted = new Set<string>();
  for (const { index, stop: position, score, match } of matches) {
    const stop = index.stops[position];
    // Stop numbers are one pole each; names group the corners of an intersection.
    const key = match === "name"
      ? `${index.network}:${index.groupKeys[position] ??= intersectionKey(stop.name)}`
      : `${index.network}:#${stop.code}`;
    const candidates = byKey.get(key);
    const group = candidates?.find((candidate) => distanceMeters(candidate.anchor, stop) <= GROUP_RADIUS_METERS);
    if (group) {
      group.stops.push(stop);
      continue;
    }
    if (groups.length >= limit) {
      // Counted by intersection, not split by distance: close enough for "Show All".
      if (!candidates) counted.add(key);
      continue;
    }
    const created = {
      network: index.network,
      key: `${key}@${stop.code}`,
      label: match === "name" ? intersectionLabel(stop.name) : stop.name,
      stops: [stop],
      routes: [],
      match,
      score,
      anchor: stop,
    };
    if (candidates) candidates.push(created);
    else byKey.set(key, [created]);
    groups.push(created);
  }
  return {
    groups: groups.map((group) => ({
      network: group.network,
      key: group.key,
      label: group.label,
      stops: group.stops,
      routes: [...new Set(group.stops.flatMap((stop) => stop.routes))].sort(routeOrder),
      match: group.match,
      score: group.score,
    })),
    total: groups.length + counted.size,
  };
}

/**
 * Stops by number (exact, then prefix from 3 digits) or by name, from every
 * loaded network; the current network first. Builds at most `limit` places
 * (the panel's cap, or more for "Show All") and counts the rest.
 */
export function searchSurfaceStops(
  indexes: PreparedSurfaceIndex[],
  query: string,
  currentNetwork: NetworkId,
  limit = 5,
): SurfaceStopSearch {
  const networkRank = (index: PreparedSurfaceIndex) => (index.network === currentNetwork ? 0 : 1);
  const ordered = indexes.slice().sort((a, b) => networkRank(a) - networkRank(b));
  const number = stopNumberFromQuery(query);
  if (number) {
    const exact: { index: PreparedSurfaceIndex; stop: number; score: number; match: StopMatch }[] = [];
    const prefix: typeof exact = [];
    for (const index of ordered) {
      const at = index.stopByCode.get(number);
      if (at !== undefined) exact.push({ index, stop: at, score: networkRank(index), match: "exact-number" });
      else if (!number.startsWith("0")) {
        // GO numbers carry leading zeros ("00005"); "5" finds it.
        const padded = index.network === "regional" ? index.stops.findIndex((stop) => withoutLeadingZeros(stop.code) === number) : -1;
        if (padded >= 0) exact.push({ index, stop: padded, score: networkRank(index), match: "exact-number" });
      }
      if (number.length >= 3) {
        index.stops.forEach((stop, position) => {
          if (stop.code !== number && withoutLeadingZeros(stop.code) !== number
            && (stop.code.startsWith(number) || withoutLeadingZeros(stop.code).startsWith(number))) {
            prefix.push({ index, stop: position, score: 10 + networkRank(index) + stop.code.length * 0.01, match: "number-prefix" });
          }
        });
      }
    }
    prefix.sort((a, b) => a.score - b.score || routeOrder(a.index.stops[a.stop].code, b.index.stops[b.stop].code));
    return { ...groupStops([...exact, ...prefix], limit), exactNumber: exact.length > 0 };
  }

  // One letter finds thousands of stops and helps no one; stations and lines still answer it.
  const queryTokens = stopNameTokens(query).slice(0, 8);
  if (queryTokens.join("").length < 2 || words(query).every((word) => GENERIC.has(word) || JOINERS.has(word))) {
    return { groups: [], total: 0, exactNumber: false };
  }
  const distinct = [...new Set(queryTokens)];
  const all = (1 << distinct.length) - 1;
  const matches: { index: PreparedSurfaceIndex; stop: number; score: number; match: StopMatch; order: number }[] = [];
  let order = 0;
  for (const index of ordered) {
    // Each query word must start a word of the name, in any order.
    let marks = scratchMarks.get(index);
    if (!marks) {
      marks = new Uint8Array(index.stops.length);
      scratchMarks.set(index, marks);
    } else marks.fill(0);
    distinct.forEach((token, bit) => markStopsWithPrefix(index, token, marks, 1 << bit));
    for (let position = 0; position < marks.length; position++) {
      if (marks[position] !== all) continue;
      const score = nameScore(index.stopTokens[position], queryTokens);
      if (score !== Infinity) matches.push({ index, stop: position, score: score + networkRank(index) * 100, match: "name", order: order++ });
    }
  }
  // Ties keep stop-number order: rows are stored that way, and the current network comes first.
  matches.sort((a, b) => a.score - b.score || a.order - b.order);
  return { ...groupStops(matches, limit), exactNumber: false };
}

export type RouteMatch = "exact-number" | "name";

export type SurfaceRouteResult = { route: SurfaceSearchRoute; match: RouteMatch; score: number };

/**
 * A route number as riders type it: "504", "route 29", "52A" (a branch is
 * its route), "GO 40" or "40" for GO; `go` says the query named GO.
 */
export function routeNumberFromQuery(query: string): { number: string; go: boolean } | null {
  const match = /^\s*(go\s*(?:bus\s*)?|route\s*|#)?(\d{1,3})([a-z])?\s*$/i.exec(query);
  if (!match) return null;
  return { number: match[2], go: /^go/i.test(match[1] ?? "") };
}

/** Routes by exact number, then by name words; the current network first. */
export function searchSurfaceRoutes(
  indexes: PreparedSurfaceIndex[],
  query: string,
  currentNetwork: NetworkId,
): SurfaceRouteResult[] {
  const networkRank = (network: NetworkId) => (network === currentNetwork ? 0 : 1);
  const number = routeNumberFromQuery(query);
  const results: SurfaceRouteResult[] = [];
  if (number) {
    for (const index of indexes) {
      if (number.go && index.network !== "regional") continue;
      for (const route of index.routes) {
        if (route.route === number.number) {
          results.push({ route, match: "exact-number", score: number.go ? 0 : networkRank(route.network) });
        }
      }
    }
    return results.sort((a, b) => a.score - b.score);
  }

  const queryTokens = stopNameTokens(query.replace(/^\s*(?:go\s+bus|go|route)\s+/i, ""));
  if (queryTokens.length === 0) return [];
  for (const index of indexes) {
    index.routes.forEach((route, position) => {
      const score = nameScore(index.routeNameTokens[position], queryTokens);
      if (score === Infinity) return;
      // Day routes before their night and express namesakes.
      const kindRank = route.kind === "streetcar" || route.kind === "bus" || route.kind === "go-bus" ? 0 : 1;
      results.push({ route, match: "name", score: score + kindRank + networkRank(route.network) * 100 });
    });
  }
  return results.sort((a, b) => a.score - b.score || routeOrder(a.route.route, b.route.route));
}
