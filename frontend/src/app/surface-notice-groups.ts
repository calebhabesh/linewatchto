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
    const routeIds = notice.routeIds ?? [];
    const routeIdsLabel = routeIds.length ? routeIds.join(" / ") : "unspecified";
    const key = `${notice.category}:${routeIdsLabel}`;
    const derivedName = deriveRouteName(notice);
    const group = groups.get(key) ?? {
      key,
      category: notice.category,
      routeType: notice.routeType,
      routeIds,
      routeIdsLabel,
      routeName: derivedName,
      notices: [],
    };
    if (!group.routeName && derivedName) {
      group.routeName = derivedName;
    }

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

  return notice.scheduleAnnouncement ? "Schedule announcement" : notice.location?.trim() || "Route-wide Notice";
}

export function surfaceNoticePreviewLocation(notice: SurfaceNoticeDetail, includeStopId: boolean): string {
  const location = notice.location?.trim() || notice.title;
  if (!includeStopId || notice.stops?.length !== 1) return location;
  const stop = notice.stops[0];
  if (!stop.stopId?.trim() || !stop.stopName?.trim()) return location;
  return `${stop.stopName.trim()} (${stop.stopId.trim()})`;
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

export const TTC_SURFACE_ROUTE_NAMES: Record<string, string> = {
  "5": "Eglinton Line",
  "6": "Finch West Line",
  "7": "Bathurst",
  "8": "Broadview",
  "9": "Bellamy",
  "10": "Van Horne",
  "11": "Bayview",
  "12": "Kingston Rd",
  "13": "Avenue Rd",
  "14": "Glencairn",
  "15": "Evans",
  "16": "McCowan",
  "17": "Birchmount",
  "18": "Caledonia",
  "19": "Bay",
  "20": "Cliffside",
  "21": "Brimley",
  "22": "Coxwell",
  "23": "Dawes",
  "24": "Victoria Park",
  "25": "Don Mills",
  "26": "Dupont",
  "27": "Jane South",
  "28": "Bayview South",
  "29": "Dufferin",
  "30": "High Park North",
  "31": "Greenwood",
  "32": "Eglinton West",
  "33": "Forest Hill",
  "34": "Eglinton",
  "35": "Jane",
  "36": "Finch West",
  "37": "Islington",
  "38": "Highland Creek",
  "39": "Finch East",
  "40": "Junction-Dundas West",
  "41": "Keele",
  "42": "Cummer",
  "43": "Kennedy",
  "44": "Kipling South",
  "45": "Kipling",
  "46": "Martin Grove",
  "47": "Lansdowne",
  "48": "Rathburn",
  "49": "Bloor West",
  "50": "Burnhamthorpe",
  "51": "Leslie",
  "52": "Lawrence West",
  "53": "Steeles East",
  "54": "Lawrence East",
  "55": "Warren Park",
  "57": "Midland",
  "59": "Maple Leaf",
  "60": "Steeles West",
  "61": "Avenue Rd North",
  "62": "Mortimer",
  "63": "Ossington",
  "64": "Main",
  "65": "Parliament",
  "66": "Prince Edward",
  "67": "Pharmacy",
  "68": "Warden",
  "69": "Warden South",
  "70": "O'Connor",
  "71": "Runnymede",
  "72": "Pape",
  "73": "Royal York",
  "74": "Mount Pleasant",
  "75": "Sherbourne",
  "76": "Royal York South",
  "77": "Swansea",
  "78": "St Andrews",
  "79": "Scarlett Rd",
  "80": "Queensway",
  "82": "Rosedale",
  "83": "Jones",
  "84": "Sheppard West",
  "85": "Sheppard East",
  "86": "Scarborough",
  "87": "Cosburn",
  "88": "South Leaside",
  "89": "Weston",
  "90": "Vaughan",
  "91": "Woodbine",
  "92": "Woodbine South",
  "93": "Parkview Hills",
  "94": "Wellesley",
  "95": "York Mills",
  "96": "Wilson",
  "97": "Yonge",
  "98": "Willowdale-Senlac",
  "100": "Flemingdon Park",
  "101": "Downsview Park",
  "102": "Markham Rd",
  "103": "Mount Pleasant North",
  "104": "Faywood",
  "105": "Dufferin North",
  "106": "Sentinel",
  "107": "Alness-Chesswood",
  "108": "Driftwood",
  "109": "Ranee",
  "110": "Islington South",
  "111": "East Mall",
  "112": "West Mall",
  "113": "Danforth",
  "114": "Queens Quay East",
  "115": "Silver Hills",
  "116": "Morningside",
  "117": "Birchmount South",
  "118": "Thistle Down",
  "119": "Torbarrie",
  "120": "Calvington",
  "121": "Esplanade-River",
  "122": "Graydon Hall",
  "123": "Sherway",
  "124": "Sunnybrook",
  "125": "Drewry",
  "126": "Christie",
  "127": "Davenport",
  "129": "McCowan North",
  "131": "Nugget",
  "133": "Neilson",
  "135": "Gerrard",
  "149": "Etobicoke-Bloor",
  "151": "Leslie North",
  "154": "Curran Hall",
  "158": "Trethewey",
  "160": "Bathurst North",
  "161": "Rogers Rd",
  "162": "Lawrence-Donway",
  "164": "Castlefield",
  "165": "Weston Rd North",
  "166": "Toryork",
  "167": "Pharmacy North",
  "168": "Symington",
  "169": "Huntingwood",
  "171": "Mount Dennis",
  "184": "Ancaster Park",
  "185": "Sheppard Central",
  "189": "Stockyards",
  "191": "Underhill",
  "201": "Bluffer's Park",
  "202": "Cherry Beach",
  "203": "High Park",
  "300": "Bloor-Danforth",
  "301": "Queen",
  "302": "Kingston Rd-McCowan",
  "304": "King",
  "305": "Dundas",
  "306": "Carlton",
  "307": "Bathurst",
  "310": "Spadina",
  "312": "St Clair",
  "315": "Evans-Brown's Line",
  "320": "Yonge",
  "324": "Victoria Park",
  "325": "Don Mills",
  "329": "Dufferin",
  "334": "Eglinton",
  "335": "Jane",
  "336": "Finch West",
  "339": "Finch East",
  "340": "Junction",
  "341": "Keele",
  "343": "Kennedy",
  "352": "Lawrence West",
  "353": "Steeles",
  "354": "Lawrence East",
  "363": "Ossington",
  "384": "Sheppard West",
  "385": "Sheppard East",
  "386": "Scarborough",
  "396": "Wilson",
  "400": "Lawrence Manor",
  "402": "Parkdale",
  "404": "East York",
  "501": "Queen",
  "503": "Kingston Rd",
  "504": "King",
  "505": "Dundas",
  "506": "Carlton",
  "507": "Long Branch",
  "508": "Lake Shore",
  "509": "Harbourfront",
  "510": "Spadina",
  "511": "Bathurst",
  "512": "St Clair",
  "900": "Airport Express",
  "902": "Markham Rd Express",
  "903": "Kennedy Stn-Scarborough Express",
  "904": "Sheppard-Kennedy Express",
  "905": "Eglinton East Express",
  "924": "Victoria Park Express",
  "925": "Don Mills Express",
  "927": "Highway 27 Express",
  "929": "Dufferin Express",
  "935": "Jane Express",
  "937": "Islington Express",
  "939": "Finch Express",
  "952": "Lawrence West Express",
  "953": "Steeles East Express",
  "954": "Lawrence East Express",
  "960": "Steeles West Express",
  "984": "Sheppard West Express",
  "985": "Sheppard East Express",
  "986": "Scarborough Express",
  "989": "Weston Express",
  "995": "York Mills Express",
  "996": "Wilson Express",
};

export function deriveRouteName(notice: SurfaceNoticeDetail): string | null {
  const routeIds = notice.routeIds?.filter(Boolean) ?? [];
  const textParts = [notice.title, notice.description].filter(Boolean);
  const text = textParts.join(" ");

  // 1. Check for specific branch destination prefix, e.g. "To Leslie Station Via Laird Station"
  for (const part of textParts) {
    const toMatch = part.match(/^\s*(to\s+.+?)(?:\s+[-\u2010-\u2015\u2212]\s+|,?\s+(?:temporary route change|route change|service change|detour|no service|due to)\b|$)/i);
    const candidate = cleanRouteDescriptor(toMatch?.[1], notice);
    if (candidate) {
      return candidate;
    }
  }

  // 2. Check for explicit unified descriptor in title (e.g. "Long Branch Loop")
  const titleDescriptor = cleanRouteDescriptor(notice.title, notice);
  if (titleDescriptor && !isSimpleRouteName(titleDescriptor)) {
    return titleDescriptor;
  }

  // 3. If notice has route IDs, resolve name for each route ID and comma-separate them
  if (routeIds.length > 0) {
    const names: string[] = [];
    for (const routeId of routeIds) {
      const name = deriveSingleRouteName(routeId, text, notice);
      if (name && !names.includes(name)) {
        names.push(name);
      }
    }
    if (names.length > 0) {
      return names.join(", ");
    }
  }

  // 4. Fallback: try title descriptor or other text parts
  if (titleDescriptor) {
    return titleDescriptor;
  }

  for (const part of textParts) {
    const candidate = cleanRouteDescriptor(part, notice);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function isSimpleRouteName(candidate: string): boolean {
  const lower = candidate.trim().toLowerCase();
  for (const name of Object.values(TTC_SURFACE_ROUTE_NAMES)) {
    if (name.toLowerCase() === lower) {
      return true;
    }
  }
  return false;
}

function deriveSingleRouteName(
  routeId: string,
  text: string,
  notice: SurfaceNoticeDetail,
): string | null {
  const trimmedRoute = routeId.trim();
  const baseRoute = trimmedRoute.replace(/[^\d]/g, "") || trimmedRoute;
  const escapedRoute = trimmedRoute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedBaseRoute = baseRoute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (text) {
    const routeNameMatch = text.match(
      new RegExp(`(?:^|[^A-Za-z0-9])(?:${escapedRoute}|${escapedBaseRoute})(?![A-Za-z0-9])\\s+([^:;.!?\\n]+)`, "i")
    );
    const candidate = cleanRouteDescriptor(routeNameMatch?.[1], notice);
    if (candidate) {
      const canonicalMatch = findCanonicalRouteName(candidate);
      return canonicalMatch || candidate;
    }
  }

  return TTC_SURFACE_ROUTE_NAMES[baseRoute] || TTC_SURFACE_ROUTE_NAMES[trimmedRoute] || null;
}

function findCanonicalRouteName(candidate: string): string | null {
  const clean = candidate.trim().replace(/\s+\b(?:streetcars?|buses?|bus|streetcar|routes?|services?)\b.*$/i, "").trim().toLowerCase();
  for (const name of Object.values(TTC_SURFACE_ROUTE_NAMES)) {
    if (name.toLowerCase() === clean || name.toLowerCase() === candidate.trim().toLowerCase()) {
      return name;
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

  // Remove unicode dashes and normalize hyphens
  candidate = candidate.replace(/[\u2010-\u2015\u2212]/g, "-");

  // Strip leading route numbers and separators, e.g. "508 ", "507 508 ", "510 - "
  candidate = candidate.replace(/^(?:\d{1,6}[A-Za-z]?[\s:,-]*)+/i, "");

  // Strip everything after a standalone dash separator (e.g. " - Service change...")
  candidate = candidate.replace(/\s+-\s+.*$/i, "");

  // Strip 'and <route-number>' continuations (e.g. "Cliffside and 113 Danforth..." -> "Cliffside")
  candidate = candidate.replace(/\s+\band\s+\d{1,4}[A-Za-z]?\b.*$/i, "");

  // Strip verb phrases and sentence continuations (e.g. "Spadina will be restored" -> "Spadina")
  candidate = candidate.replace(/\s+\b(?:will be|will|is|are|was|were|has been|have been)\b.*$/i, "");
  candidate = candidate.replace(/\s+\b(?:diverts?|diverting|diverted)\b.*$/i, "");
  candidate = candidate.replace(/\s+\b(?:adjusts?|adjusting|adjusted)\b.*$/i, "");
  candidate = candidate.replace(/\s+\b(?:restores?|restoring|restored)\b.*$/i, "");
  candidate = candidate.replace(/\s+\b(?:operates?|operating|operated)\b.*$/i, "");
  candidate = candidate.replace(/\s+\b(?:terminates?|terminating|terminated)\b.*$/i, "");

  // Strip vehicle/mode continuations and standalone vehicle words (e.g. "Bathurst streetcar", "Spadina streetcars", "Danforth eastbound buses will divert...")
  candidate = candidate.replace(/\s+\b(?:streetcars?|buses?|bus|streetcar)\b.*$/i, "");
  candidate = candidate.replace(/\s+\b(?:eastbound|westbound|northbound|southbound)\s+(?:buses?|streetcars?|service|routes?|will|are)\b.*$/i, "");
  candidate = candidate.replace(/\s+\b(?:eastbound|westbound|northbound|southbound)\b.*$/i, "");

  // Strip standard disruption phrases
  candidate = candidate.replace(/\b(?:temporary route change|route change|service change|track renewal work|renewal work|bridge work|due to|while)\b.*$/i, "");

  // Strip leading and trailing punctuation, spaces, dashes
  candidate = candidate.replace(/^[\s:,-]+|[\s:,-]+$/g, "").trim();

  if (!candidate || candidate === "-" || candidate === "–" || candidate === "—" || /^[\d\s:,-]+$/.test(candidate)) {
    return null;
  }
  if (notice.routeType && candidate.toLowerCase() === notice.routeType.toLowerCase()) {
    return null;
  }
  if (candidate.match(/^(temporary|route|service|streetcars?|buses?|no service|detour|diversion|modified)\b/i)) {
    return null;
  }
  if (candidate.match(/^(road work|construction|security incident|police activity|track work)\b/i)) {
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

// Presentation priority only; this does not create a current service impact.
export function surfaceNoticeEmphasis(notice: SurfaceNoticeDetail): string {
  if (notice.category === "no-service") return "no-service";
  if (notice.scheduleAnnouncement && /\b(?:no (?:GO |UP Express )?(?:train |bus |rail )?service(?! changes?\b| disruptions?\b| interruptions?\b)|(?:trains|buses) will not (?:run|operate))\b/i.test(
    notice.title + " " + notice.description,
  )) return "no-service";
  return notice.scheduleAnnouncement ? "schedule" : notice.category;
}

export function hasExactRouteMatch(notice: SurfaceNoticeDetail, query?: string | null): boolean {
  if (!query) return false;
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return false;
  const normalized = trimmed.replace(/^(?:route\s+|line\s+|#\s*)/i, "");
  if (!normalized) return false;
  return Boolean(notice.routeIds?.some((id) => {
    const cleanId = id.trim().toLowerCase();
    return cleanId === normalized || cleanId === trimmed;
  }));
}

export function compareSurfaceNotices(
  a: SurfaceNoticeDetail,
  b: SurfaceNoticeDetail,
  sort: "importance" | "recent" | "route" | "location" | "start" = "importance",
  query?: string | null,
  preferTtcServiceAlerts = false,
): number {
  if (sort === "route" || sort === "location") {
    const key = (notice: SurfaceNoticeDetail) => sort === "route" ? [...notice.routeIds].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0] ?? "\uffff" : notice.location || notice.stops?.[0]?.stopName || "\uffff";
    const order = key(a).localeCompare(key(b), undefined, { numeric: true });
    if (order) return order;
  }
  if (sort === "start") {
    const time = (value?: string | null) => Number.isFinite(Date.parse(value ?? "")) ? Date.parse(value!) : Infinity;
    const order = time(a.startAt) - time(b.startAt);
    if (order) return order;
  }
  if (query && (sort === "importance" || sort === "recent")) {
    const aMatch = hasExactRouteMatch(a, query);
    const bMatch = hasExactRouteMatch(b, query);
    if (aMatch !== bMatch) {
      return aMatch ? -1 : 1;
    }
  }

  const priorities: Record<string, number> = {
    "no-service": 0, schedule: 1, bypass: 2, detour: 2, "service-change": 3, notice: 4,
  };
  const alertClassPriority = sort === "importance" && preferTtcServiceAlerts
    ? (a.alertClass === "service-alert" ? 0 : 1) - (b.alertClass === "service-alert" ? 0 : 1)
    : 0;
  const priority = sort === "importance"
    ? (priorities[surfaceNoticeEmphasis(a)] ?? 4) - (priorities[surfaceNoticeEmphasis(b)] ?? 4)
    : 0;
  const timestamp = (value: string) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const route = sort === "importance" && preferTtcServiceAlerts
    ? ([...a.routeIds].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))[0] ?? "\uffff")
      .localeCompare([...b.routeIds].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))[0] ?? "\uffff", undefined, { numeric: true })
    : 0;
  return alertClassPriority || priority || route || timestamp(b.updatedAt) - timestamp(a.updatedAt) || a.id.localeCompare(b.id);
}
