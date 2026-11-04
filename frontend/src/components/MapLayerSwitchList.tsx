import type { ComponentPropsWithRef, ReactNode } from "react";
import { Bus, Route, SatelliteDish, TrainFrontTunnel } from "lucide-react";
import {
  mapLayerSwitchRows,
  type MapLayerSwitchHandlers,
  type MapLayerSwitchKey,
  type MapLayerSwitchLayout,
  type MapLayerSwitchRow,
  type MapLayerSwitchState,
} from "../app/map-layer-switches";
import type { NetworkId } from "../app/dashboard-contract";
import SquishSwitch from "./SquishSwitch";

const SWITCH_ICONS: Record<MapLayerSwitchKey, ReactNode> = {
  trainMarkers: <TrainFrontTunnel size={20} aria-hidden="true" />,
  streetcarRoutes: <Route size={20} aria-hidden="true" />,
  buses: <Bus size={20} aria-hidden="true" />,
  vehiclePositions: <SatelliteDish size={20} aria-hidden="true" />,
  goBuses: <Bus size={20} aria-hidden="true" />,
  goBusPositions: <SatelliteDish size={20} aria-hidden="true" />,
};

/**
 * One layer switch, in the Train Markers switch's design: the mode on top, and
 * below it what the switch controls (or why it cannot show anything now). The
 * switch itself carries on or off.
 */
function MapLayerSwitch({ row }: { row: MapLayerSwitchRow }) {
  return (
    <div
      className="map-layer-switch"
      data-checked={row.checked ? "true" : "false"}
      data-disabled={row.disabled ? "true" : undefined}
      data-bus-toggle={row.busToggle ? "" : undefined}
      title={row.title}
    >
      <span className="map-layer-switch-icon">{SWITCH_ICONS[row.key]}</span>
      <label htmlFor={row.id} className="map-layer-switch-copy">
        <span className="map-layer-switch-label">{row.label}</span>
        <span className="map-layer-switch-status">{row.detail}</span>
      </label>
      <SquishSwitch
        id={row.id}
        checked={row.checked}
        disabled={row.disabled}
        ariaBusy={row.pending}
        ariaLabel={row.ariaLabel}
        className="shrink-0"
        trackOnColor="#10b981"
        width={34}
        height={20}
        onChange={row.onToggle}
        title={row.title}
      />
    </div>
  );
}

/**
 * The Map View's layer switches for one network (plan 15, L1): a horizontal
 * deck in the desktop toolbar, or a vertical list for the phone Layers sheet.
 * Other props go to the group element, so the toolbar can animate and place
 * its deck.
 */
export function MapLayerSwitchList({ network, layout, state, handlers, className, ...groupProps }: {
  network: NetworkId;
  layout: MapLayerSwitchLayout;
  state: MapLayerSwitchState;
  handlers: MapLayerSwitchHandlers;
} & ComponentPropsWithRef<"div">) {
  return (
    <div
      {...groupProps}
      className={className ? `map-layer-switch-list ${className}` : "map-layer-switch-list"}
      data-network={network}
      data-layout={layout}
      role="group"
      aria-label="Map layers"
    >
      {mapLayerSwitchRows(network, layout, state, handlers).map((row) => (
        <MapLayerSwitch key={row.key} row={row} />
      ))}
    </div>
  );
}
