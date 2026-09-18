export type GeographicLifecycleEventType =
  | "constructor"
  | "removal"
  | "setStyle"
  | "loading"
  | "ready"
  | "error"
  | "focus"
  | "moveend"
  | "resize";

export interface GeographicLifecycleEvent {
  type: GeographicLifecycleEventType;
  timestamp: number;
  detail?: string;
}

export interface GeographicMapLifecycleStats {
  constructors: number;
  removals: number;
  styleReplacements: number;
  loadingTransitions: number;
  readyTransitions: number;
  errorTransitions: number;
  resizes: number;
  events: GeographicLifecycleEvent[];
  reset: () => void;
}

declare global {
  interface Window {
    __linewatchGeographicMapLifecycle?: GeographicMapLifecycleStats;
  }
}

export function getGeographicMapLifecycle(): GeographicMapLifecycleStats {
  if (typeof window === "undefined") {
    return {
      constructors: 0,
      removals: 0,
      styleReplacements: 0,
      loadingTransitions: 0,
      readyTransitions: 0,
      errorTransitions: 0,
      resizes: 0,
      events: [],
      reset() {},
    };
  }
  return (window.__linewatchGeographicMapLifecycle ??= {
    constructors: 0,
    removals: 0,
    styleReplacements: 0,
    loadingTransitions: 0,
    readyTransitions: 0,
    errorTransitions: 0,
    resizes: 0,
    events: [],
    reset() {
      this.constructors = 0;
      this.removals = 0;
      this.styleReplacements = 0;
      this.loadingTransitions = 0;
      this.readyTransitions = 0;
      this.errorTransitions = 0;
      this.resizes = 0;
      this.events = [];
    },
  });
}

export function recordGeographicMapLifecycle(
  type: GeographicLifecycleEventType,
  detail?: string,
): void {
  if (typeof window === "undefined") return;
  const store = getGeographicMapLifecycle();

  if (type === "constructor") store.constructors++;
  else if (type === "removal") store.removals++;
  else if (type === "setStyle") store.styleReplacements++;
  else if (type === "loading") store.loadingTransitions++;
  else if (type === "ready") store.readyTransitions++;
  else if (type === "error") store.errorTransitions++;
  else if (type === "resize") store.resizes++;

  store.events.push({
    type,
    timestamp: Date.now(),
    detail,
  });
}
