/**
 * Links to a surface stop (plan 14, U7): `?stop=7658` opens a TTC stop's
 * departures and `?network=regional&stop=00008` a GO bus stop's, following
 * the `network` + `station` form station links already use. While a stop is
 * open the address carries its link, so the browser's Share and Add to Home
 * Screen keep that stop. A link never asks for location.
 */
import type { NetworkId } from "./dashboard-contract.ts";

export const STOP_LINK_PARAM = "stop";

export type SurfaceStopLink = {
  network: NetworkId;
  code: string;
  /** False for a value that cannot be a stop number; the panel says so without a request. */
  wellFormed: boolean;
};

const MAX_DISPLAYED_LENGTH = 16;
const GO_STOP_CODE_LENGTH = 5;

/** Stop numbers are digits: TTC up to 5 today, GO always 5 with leading zeros. */
export function isWellFormedStopCode(code: string): boolean {
  return /^\d{1,8}$/.test(code);
}

export function parseSurfaceStopLink(params: URLSearchParams): SurfaceStopLink | null {
  const raw = params.get(STOP_LINK_PARAM);
  if (raw === null) return null;
  const value = raw.trim();
  if (!value) return null;
  const network: NetworkId = params.get("network") === "regional" ? "regional" : "ttc";
  if (!isWellFormedStopCode(value)) {
    return { network, code: value.slice(0, MAX_DISPLAYED_LENGTH), wellFormed: false };
  }
  // GO numbers carry leading zeros ("00008"); a link may drop them, as search allows.
  const code = network === "regional" && value.length < GO_STOP_CODE_LENGTH
    ? value.padStart(GO_STOP_CODE_LENGTH, "0")
    : value;
  return { network, code, wellFormed: true };
}

/**
 * The query string with the open stop's link, or without one when no stop is
 * open. A stop replaces a station link; a TTC stop drops `network=regional`.
 */
export function searchWithStopLink(search: string, stop: { network: NetworkId; code: string } | null): string {
  const params = new URLSearchParams(search);
  if (!stop) {
    params.delete(STOP_LINK_PARAM);
  } else {
    params.delete("station");
    if (stop.network === "regional") {
      params.set("network", "regional");
    } else if (params.get("network") === "regional") {
      params.delete("network");
    }
    params.delete(STOP_LINK_PARAM);
    params.set(STOP_LINK_PARAM, stop.code);
  }
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function stopLinkPath(stop: { network: NetworkId; code: string }): string {
  return `/${searchWithStopLink("", stop)}`;
}
