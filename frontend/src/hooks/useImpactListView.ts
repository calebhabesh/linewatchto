"use client";

import { useSyncExternalStore } from "react";

export type ImpactListView = "cards" | "list";

const IMPACT_LIST_VIEW_STORAGE_KEY = "linewatch-impact-list-view-v1";
const IMPACT_LIST_VIEW_EVENT = "linewatch:impact-list-view-change";
let inMemoryView: ImpactListView = "cards";

function readStoredView(): ImpactListView {
  try {
    const storedView = window.localStorage.getItem(IMPACT_LIST_VIEW_STORAGE_KEY);
    if (storedView === "cards" || storedView === "list") return storedView;
    return inMemoryView;
  } catch {
    return inMemoryView;
  }
}

function subscribeToViewPreference(onStoreChange: () => void) {
  const handlePreferenceChange = () => onStoreChange();
  const handleStorage = (event: StorageEvent) => {
    if (event.key === IMPACT_LIST_VIEW_STORAGE_KEY) onStoreChange();
  };

  window.addEventListener(IMPACT_LIST_VIEW_EVENT, handlePreferenceChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(IMPACT_LIST_VIEW_EVENT, handlePreferenceChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useImpactListView() {
  const viewMode = useSyncExternalStore(
    subscribeToViewPreference,
    readStoredView,
    (): ImpactListView => "cards",
  );

  const setViewMode = (nextView: ImpactListView) => {
    inMemoryView = nextView;
    try {
      window.localStorage.setItem(IMPACT_LIST_VIEW_STORAGE_KEY, nextView);
    } catch {
      // Storage may be unavailable; the current panel still retains its in-memory choice.
    }
    window.dispatchEvent(new CustomEvent<ImpactListView>(IMPACT_LIST_VIEW_EVENT, { detail: nextView }));
  };

  return { viewMode, setViewMode };
}
