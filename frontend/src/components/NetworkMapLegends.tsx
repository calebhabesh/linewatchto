"use client";

import { DataProvider, type DashboardData } from "../app/DataContext";
import type { NetworkId } from "../app/regional-data";
import { LineLegend } from "./LineLegend";
import { MobileLegend } from "./MobileLegend";

type LegendActions = {
  onAlertClick: () => void;
  onDelayClick: () => void;
  onReducedSpeedZoneClick: () => void;
  onClosureClick: () => void;
};

type LegendPaneProps = LegendActions & {
  mode: NetworkId;
  data: DashboardData;
  closingSoon: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
};

function LegendPane({
  mode,
  data,
  closingSoon,
  expanded,
  onToggleExpanded,
  onAlertClick,
  onDelayClick,
  onReducedSpeedZoneClick,
  onClosureClick,
}: LegendPaneProps) {
  return (
    <DataProvider data={data}>
      <aside className="desktop-map-legend fixed bottom-10 right-6 pointer-events-none">
        <LineLegend
          mode={mode}
          onAlertClick={onAlertClick}
          onDelayClick={onDelayClick}
          onReducedSpeedZoneClick={onReducedSpeedZoneClick}
          onClosureClick={onClosureClick}
        />
      </aside>
      <MobileLegend
        mode={mode}
        closingSoon={closingSoon}
        expanded={expanded}
        onToggleExpanded={onToggleExpanded}
      />
    </DataProvider>
  );
}

export function NetworkMapLegends({
  network,
  ttcData,
  regionalData,
  ttcClosingSoon,
  reducedMotion,
  expanded,
  onToggleExpanded,
  onAlertClick,
  onDelayClick,
  onReducedSpeedZoneClick,
  onClosureClick,
}: LegendActions & {
  network: NetworkId;
  ttcData: DashboardData;
  regionalData: DashboardData;
  ttcClosingSoon: boolean;
  reducedMotion: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const regionalSelected = network === "regional";

  return (
    <div className="network-legend-track-viewport" data-camera-direction={regionalSelected ? "right" : "left"}>
      <div className={`network-legend-track ${regionalSelected ? "network-legend-track--regional" : ""} ${reducedMotion ? "network-legend-track--reduced-motion" : ""}`}>
        <div className="network-legend-pane" aria-hidden={regionalSelected} inert={regionalSelected}>
          <LegendPane
            mode="ttc"
            data={ttcData}
            closingSoon={ttcClosingSoon}
            expanded={expanded}
            onToggleExpanded={onToggleExpanded}
            onAlertClick={onAlertClick}
            onDelayClick={onDelayClick}
            onReducedSpeedZoneClick={onReducedSpeedZoneClick}
            onClosureClick={onClosureClick}
          />
        </div>
        <div className="network-legend-pane" aria-hidden={!regionalSelected} inert={!regionalSelected}>
          <LegendPane
            mode="regional"
            data={regionalData}
            closingSoon={false}
            expanded={expanded}
            onToggleExpanded={onToggleExpanded}
            onAlertClick={onAlertClick}
            onDelayClick={onDelayClick}
            onReducedSpeedZoneClick={onReducedSpeedZoneClick}
            onClosureClick={onClosureClick}
          />
        </div>
      </div>
    </div>
  );
}
