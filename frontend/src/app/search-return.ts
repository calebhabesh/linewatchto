/**
 * Back to search from a stop or route opened in it (plan 14, U7). The search
 * panel saves where it was (query, scroll, expanded groups, focused row) as a
 * result opens; Back asks for that place once, and the panel puts it back
 * when it shows that query again.
 */

export type SurfaceSearchExpansion = { query: string; stops: boolean; routes: boolean; places: string[] };

export type SearchPlace = {
  query: string;
  scrollTop: number;
  expansion: SurfaceSearchExpansion | null;
  /** The opened row's index among the scroller's buttons, when it had focus. */
  focusIndex: number | null;
};

export function createSearchPlaceStore() {
  let saved: SearchPlace | null = null;
  let restoreRequested = false;
  return {
    save(place: SearchPlace) {
      saved = place;
      restoreRequested = false;
    },
    /** Back to search: the saved place, which the panel restores next time it shows. */
    requestRestore(): SearchPlace | null {
      restoreRequested = saved !== null;
      return saved;
    },
    /** The place waiting for this query, without using it up (effects can run twice). */
    pendingRestore(query: string): SearchPlace | null {
      return restoreRequested && saved && saved.query === query ? saved : null;
    },
    finishRestore() {
      restoreRequested = false;
    },
    clear() {
      saved = null;
      restoreRequested = false;
    },
  };
}

export const searchPlaceStore = createSearchPlaceStore();

export type SurfaceBackStep = "route" | "search" | null;

/**
 * What one Back does while a surface stop or route panel is open: a stop
 * opened from a route panel goes back to that route; a stop or route opened
 * from search goes back to search. Anything else is not ours to handle.
 */
export function surfaceBackStep(state: {
  stopOpen: boolean;
  routeOpen: boolean;
  routeReturn: boolean;
  searchReturn: boolean;
}): SurfaceBackStep {
  if (state.stopOpen && state.routeReturn) return "route";
  if ((state.stopOpen || state.routeOpen) && state.searchReturn) return "search";
  return null;
}

export function searchBackLabel(query: string): { title: string; detail: string; ariaLabel: string } {
  const trimmed = query.trim();
  return trimmed
    ? { title: "Back to Search", detail: `Results for “${trimmed}”`, ariaLabel: `Back to search results for ${trimmed}` }
    : { title: "Back to Search", detail: "Stops Near Me and Recent Stops", ariaLabel: "Back to search" };
}
