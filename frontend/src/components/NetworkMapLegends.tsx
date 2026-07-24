import type { NetworkId } from "../app/regional-data";
import { LineLegend } from "./LineLegend";
import { MobileLegend } from "./MobileLegend";

export type NetworkMapLegendProps = {
  mode: NetworkId;
  closingSoon: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onAlertClick: () => void;
  onDelayClick: () => void;
  onReducedSpeedZoneClick: () => void;
  onClosureClick: () => void;
};

export function NetworkMapLegend({
  mode,
  closingSoon,
  expanded,
  onToggleExpanded,
  onAlertClick,
  onDelayClick,
  onReducedSpeedZoneClick,
  onClosureClick,
}: NetworkMapLegendProps) {
  return (
    <>
      <aside className="desktop-map-legend absolute bottom-10 right-6 z-20 pointer-events-none">
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
    </>
  );
}
