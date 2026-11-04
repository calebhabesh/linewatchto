/**
 * The Map View's layer switches as rows (plan 15, L1): one source for what the
 * desktop deck and the phone Layers sheet show, so their labels, captions,
 * order and accessible names cannot drift apart. Each row reads its value from
 * the state given here; the per-device memory stays with the handlers.
 *
 * Separate from `map-view-layers.ts`, which the catalog and position modules
 * import: the captions and titles here import those modules back.
 */

import { BUS_VEHICLE_MIN_ZOOM } from "./bus-positions.ts";
import type { NetworkId } from "./dashboard-contract.ts";
import { GO_BUS_VEHICLE_MIN_ZOOM, goBusPositionsDetail } from "./go-bus-positions.ts";
import { estimatedTrainsDetail, vehiclePositionsDetail } from "./map-view-layers.ts";
import type { StreetcarPositionsState } from "./streetcar-positions.ts";
import { defaultVisualPreferences } from "./visual-preferences.ts";

export type MapLayerSwitchKey =
  | "trainMarkers"
  | "streetcarRoutes"
  | "buses"
  | "vehiclePositions"
  | "goBuses"
  | "goBusPositions";

/** "deck" is the desktop toolbar's horizontal row, "sheet" a vertical list. */
export type MapLayerSwitchLayout = "deck" | "sheet";

/** The shell's estimated train markers switch (one setting, on both networks). */
export type MapLayerTrainMarkersControl = {
  checked: boolean;
  disabled: boolean;
  pending: boolean;
  status: string;
  ariaLabel: string;
  onToggle: () => void;
};

export type MapLayerSwitchState = {
  trainMarkers?: MapLayerTrainMarkersControl;
  streetcarRoutes: boolean;
  buses: boolean;
  /** The TTC Live GPS switch: live streetcars, and live buses while buses are on. */
  vehiclePositions: boolean;
  streetcarPositionsState: StreetcarPositionsState | null;
  /** Null while bus positions are not being read (see `vehiclePositionsDetail`). */
  busPositionsState: StreetcarPositionsState | null;
  goBuses: boolean;
  goBusPositions: boolean;
  /** Null while GO bus positions are not being read. */
  goBusPositionsState: StreetcarPositionsState | null;
};

/** Without `buses` there is no Buses switch; without `goBuses`, neither GO switch. */
export type MapLayerSwitchHandlers = {
  streetcarRoutes: () => void;
  buses?: () => void;
  vehiclePositions: () => void;
  goBuses?: () => void;
  goBusPositions: () => void;
};

export type MapLayerSwitchRow = {
  key: MapLayerSwitchKey;
  /** Differs per layout, because the sheet can share a page with the deck. */
  id: string;
  label: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  pending: boolean;
  ariaLabel: string;
  title: string;
  /** Marks the bus switch of either network (`data-bus-toggle`). */
  busToggle: boolean;
  onToggle: () => void;
};

type RowInput = Omit<MapLayerSwitchRow, "id" | "disabled" | "pending" | "busToggle">
  & Partial<Pick<MapLayerSwitchRow, "disabled" | "pending" | "busToggle">>
  & { idSuffix: string };

export function mapLayerSwitchRows(
  network: NetworkId,
  layout: MapLayerSwitchLayout,
  state: MapLayerSwitchState,
  handlers: MapLayerSwitchHandlers,
): MapLayerSwitchRow[] {
  const prefix = layout === "sheet" ? "map-layer-sheet-" : "map-layer-";
  const rows: MapLayerSwitchRow[] = [];
  const add = ({ idSuffix, ...row }: RowInput) => {
    rows.push({ disabled: false, pending: false, busToggle: false, ...row, id: `${prefix}${idSuffix}` });
  };

  if (state.trainMarkers) {
    add({
      key: "trainMarkers",
      idSuffix: "train-markers",
      label: "Train Markers",
      detail: estimatedTrainsDetail(state.trainMarkers.checked, state.trainMarkers.status),
      checked: state.trainMarkers.checked,
      disabled: state.trainMarkers.disabled,
      pending: state.trainMarkers.pending,
      ariaLabel: state.trainMarkers.ariaLabel,
      title: "Estimated Train Markers",
      onToggle: state.trainMarkers.onToggle,
    });
  }

  if (network === "regional") {
    if (handlers.goBuses) {
      add({
        key: "goBuses",
        idSuffix: "go-bus-routes",
        label: "GO Buses",
        detail: "Routes",
        checked: state.goBuses,
        ariaLabel: "Show GO bus routes and stops",
        title: "GO Bus Routes",
        busToggle: true,
        onToggle: handlers.goBuses,
      });
      add({
        key: "goBusPositions",
        idSuffix: "go-bus-positions",
        label: "Live GPS",
        detail: goBusPositionsDetail(state.goBuses, state.goBusPositions, state.goBusPositionsState),
        checked: state.goBusPositions,
        ariaLabel: "Show live GO bus GPS positions",
        title: state.goBuses
          ? `Live GO Buses (from zoom ${GO_BUS_VEHICLE_MIN_ZOOM})`
          : "Live GO Buses (with GO Buses on)",
        onToggle: handlers.goBusPositions,
      });
    }
    return rows;
  }

  add({
    key: "streetcarRoutes",
    idSuffix: "streetcar-routes",
    label: "Streetcars",
    detail: "Routes",
    checked: state.streetcarRoutes,
    ariaLabel: "Show TTC streetcar routes and stops",
    title: "Streetcar Routes",
    onToggle: handlers.streetcarRoutes,
  });
  if (handlers.buses) {
    add({
      key: "buses",
      idSuffix: "bus-routes",
      label: "Buses",
      detail: "Routes",
      checked: state.buses,
      ariaLabel: "Show TTC bus routes and stops",
      title: "Bus Routes",
      busToggle: true,
      onToggle: handlers.buses,
    });
  }
  add({
    key: "vehiclePositions",
    idSuffix: "streetcar-positions",
    label: "Live GPS",
    detail: vehiclePositionsDetail(
      state.vehiclePositions,
      state.streetcarPositionsState,
      state.busPositionsState,
      state.buses,
    ),
    checked: state.vehiclePositions,
    ariaLabel: "Show live streetcar and bus GPS positions",
    title: state.buses ? `Live Vehicles (buses from zoom ${BUS_VEHICLE_MIN_ZOOM})` : "Live Vehicles",
    onToggle: handlers.vehiclePositions,
  });
  return rows;
}

/** What each switch is before a rider touches it. */
const MAP_LAYER_DEFAULTS: Record<MapLayerSwitchKey, boolean> = {
  trainMarkers: defaultVisualPreferences.estimatedTrainsEnabled,
  streetcarRoutes: true,
  buses: false,
  vehiclePositions: true,
  goBuses: false,
  goBusPositions: true,
};

/** Whether the phone's Layers button shows its dot: any listed switch is off its default. */
export function mapLayersDifferFromDefaults(rows: readonly MapLayerSwitchRow[]): boolean {
  return rows.some((row) => row.checked !== MAP_LAYER_DEFAULTS[row.key]);
}
