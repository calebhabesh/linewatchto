import type { NetworkId } from "../app/regional-data";
import { LineLegend } from "./LineLegend";
import { MobileLegend } from "./MobileLegend";

export type NetworkMapLegendProps = {
  mode: NetworkId;
  closingSoon: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onAlertClick: (lineId: string) => void;
  onDelayClick: (lineId: string) => void;
  onReducedSpeedZoneClick: (lineId: string) => void;
  onClosureClick: (lineId: string) => void;
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
  const isRegional = mode === "regional";
  return (
    <>
      <aside
        className={`desktop-map-legend absolute right-6 z-20 pointer-events-none ${
          isRegional ? "bottom-3" : "bottom-10"
        }`}
      >
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
