"use client";
/*
 * Renders the drop-in fixture map with the System Map engine, as the shell
 * renders a registered map, and shows what it selects for the browser test
 * (tests/smoke/drop-in-map.spec.ts). Test-only: mounted by the harness route,
 * which exists only in builds with LINEWATCH_TEST_HARNESS=true.
 */
import { useState } from "react";
import { DataProvider } from "../../../src/app/DataContext";
import type { ImpactSelection } from "../../../src/app/linewatch-data";
import { SystemMap } from "../../../src/components/system-map/SystemMap";
import { DROP_IN_STATION_LIST, dropInDashboardData } from "./drop-in-map-data";
import { DROP_IN_SYSTEM_MAP } from "./drop-in-system-map";

export function DropInMapHarness() {
  const [data] = useState(dropInDashboardData);
  const [selection, setSelection] = useState<ImpactSelection>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  return (
    <main style={{ position: "fixed", inset: 0, background: "#f8fafc" }}>
      <output
        data-testid="drop-in-selection"
        data-selection={selection ? `${selection.kind}:${selection.id}` : ""}
        data-station={selectedStationId ?? ""}
        style={{ position: "absolute", left: 8, bottom: 8, zIndex: 50, font: "12px monospace" }}
      >
        {selection ? `${selection.kind}:${selection.id}` : selectedStationId ? `station:${selectedStationId}` : "none"}
      </output>
      <DataProvider data={data}>
        <SystemMap
          map={DROP_IN_SYSTEM_MAP}
          stations={DROP_IN_STATION_LIST}
          selection={selection}
          onSelectImpact={(next) => {
            setSelection(next);
            if (next) setSelectedStationId(null);
          }}
          selectedStationId={selectedStationId}
          onSelectStationId={(next) => {
            setSelectedStationId(next);
            if (next) setSelection(null);
          }}
          isDark={false}
          reducedMotion={false}
          mapChromeVisible
        />
      </DataProvider>
    </main>
  );
}
