/**
 * The TTC Map View's layer switches (plan 13): streetcar routes, bus routes
 * and live vehicles, each remembered on this device. Streetcars and vehicles
 * are on until a rider turns them off; buses are off until turned on
 * (`BUS_LAYER_STORAGE_KEY`, S5). Anything unreadable falls back to the default.
 */

export const STREETCAR_ROUTES_STORAGE_KEY = "linewatch-map-view-streetcars-v1";
/**
 * The Live GPS switch: live streetcars (S4), and live buses (S8) while bus
 * routes are on. It kept the S4 key when it took over buses, so a rider's
 * setting carried over.
 */
export const STREETCAR_POSITIONS_STORAGE_KEY = "linewatch-map-view-streetcar-positions-v1";

export function readLayerPreference(
  storage: Pick<Storage, "getItem"> | null | undefined,
  key: string,
  fallback: boolean,
): boolean {
  try {
    const value = storage?.getItem(key);
    return value === "on" ? true : value === "off" ? false : fallback;
  } catch {
    return fallback;
  }
}

export function writeLayerPreference(
  storage: Pick<Storage, "setItem"> | null | undefined,
  key: string,
  enabled: boolean,
): void {
  try {
    storage?.setItem(key, enabled ? "on" : "off");
  } catch {
    // Private mode or a full quota: the switch still works for this visit.
  }
}

/**
 * The Live GPS switch's caption: the vehicles it shows ("Streetcars", or
 * "Streetcars & Buses" while bus routes are on), or the sources' state when
 * they cannot show them. `busState` is null while buses are not being read
 * (Bus Routes off, or below the bus zoom); with buses read, a bus source that
 * is off while streetcars are live reads "Streetcars Only".
 */
export function vehiclePositionsDetail(
  shown: boolean,
  streetcarState: string | null,
  busState: string | null = null,
  busesOn = false,
): string {
  const vehicles = busesOn ? "Streetcars & Buses" : "Streetcars";
  if (!shown) return vehicles;
  const states = [streetcarState, busState].filter((state): state is string => state !== null);
  if (states.length === 0) return vehicles;
  if (states.every((state) => state === "disabled")) return "Source Off";
  if (streetcarState === "live" && busState === "disabled") return "Streetcars Only";
  if (states.includes("stale")) return "Stale";
  if (states.includes("unavailable")) return "Unavailable";
  if (states.includes("disabled")) return "Partly Off";
  return vehicles;
}

/**
 * The Train Markers switch's caption: which vehicles, as the Live GPS
 * switch's does. On, "64 Trains" (or "64 Trains Held" while the read is not fresh);
 * off, "Trains". Other marker states (Closed, Connecting, Waiting,
 * Reconnecting, Unavailable) stand in for the count.
 */
export function estimatedTrainsDetail(checked: boolean, status: string): string {
  if (!checked) return "Trains";
  const match = /^(\d+) (shown|held)$/.exec(status.trim());
  if (!match) return status;
  const count = Number(match[1]);
  const trains = `${count} ${count === 1 ? "Train" : "Trains"}`;
  return match[2] === "held" ? `${trains} Held` : trains;
}
