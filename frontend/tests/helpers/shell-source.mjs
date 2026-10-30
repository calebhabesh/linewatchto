import { readFileSync } from "node:fs";

// LineWatchShell and the modules split out of it. Source checks about what the
// shell renders or wires up read all of them, so moving code between these
// files does not hide it from a check. Add new shell modules here.
export const SHELL_SOURCE_FILES = [
  "../../src/components/LineWatchShell.tsx",
  "../../src/components/DesktopNoticeBanner.tsx",
  "../../src/app/shell-service-notices.ts",
  "../../src/hooks/useTtcStationDetail.ts",
  "../../src/hooks/useNetworkServiceFeeds.ts",
  "../../src/hooks/useEstimatedTrains.ts",
  "../../src/hooks/useSavedStations.ts",
];

export function readShellSource() {
  return SHELL_SOURCE_FILES
    .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
    .join("\n");
}
