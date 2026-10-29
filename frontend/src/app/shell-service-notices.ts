import type { DashboardData, NetworkId } from "./dashboard-contract.ts";
import { snapshotNotice } from "./dashboard-snapshot.ts";
import { formatResumeDuration, type SubwayOperatingState } from "./subway-hours.ts";
import type { RegionalRailOperatingState } from "./regional-rail-hours.ts";

// Connection and operating-hours notices shown by the desktop sidebar and the
// mobile status peek. Both surfaces use the same wording and priority.

export type ServiceConnectionNotice = {
  message: string;
  showSpinner: boolean;
  snapshot?: true;
  hasSavedSnapshot?: boolean;
  reason?: "offline" | "reconnecting" | "stale" | "refreshing";
};

export type ServiceOperatingNotice = {
  kind: "closing-soon" | "closed";
  title: string;
  details?: string;
  action?: () => void;
};

type OperatingHours = Pick<
  SubwayOperatingState & RegionalRailOperatingState,
  "status" | "closingSoon" | "minutesUntilClose" | "nextCloseLabel" | "nextResumeLabel"
>;

export function serviceConnectionNotice({
  snapshot,
  availability,
  requestState,
  snapshotClock,
  offline,
}: {
  snapshot: DashboardData["snapshot"];
  availability: DashboardData["availability"];
  requestState: "ready" | "reconnecting";
  snapshotClock: number;
  offline: boolean;
}): ServiceConnectionNotice | null {
  if (snapshot?.reason === "refreshing") return null;
  if (snapshot) {
    return {
      snapshot: true,
      hasSavedSnapshot: snapshot.savedAt !== null,
      message: snapshotNotice(snapshot, snapshotClock),
      showSpinner: !offline,
      reason: snapshot.reason,
    };
  }
  if (requestState === "reconnecting") {
    return {
      message: "Connection issue — Showing cached snapshot",
      showSpinner: true,
      reason: "reconnecting",
    };
  }
  if (availability === "degraded") {
    return { message: "Source refresh issue — Showing last successful update", showSpinner: false };
  }
  if (availability === "unavailable") {
    return { message: "Service unavailable — Showing fallback data", showSpinner: false };
  }
  return null;
}

function resumeDetails(label: string | null) {
  return (label ?? "")
    .replace(/^(Today|Tomorrow)/, (day) => day.toLowerCase())
    .replace(/\.$/, "");
}

/**
 * The closed notice appears only while the rider is looking at the map
 * (`showClosed`); otherwise the closed screen itself explains the closure.
 */
export function serviceOperatingNotice({
  network,
  subway,
  regional,
  showClosed,
  onOpenClosed,
}: {
  network: NetworkId;
  subway: OperatingHours;
  regional: OperatingHours;
  showClosed: boolean;
  onOpenClosed: () => void;
}): ServiceOperatingNotice | null {
  const hours = network === "ttc" ? subway : regional;
  if (hours.status === "closed" && showClosed) {
    return network === "ttc"
      ? { kind: "closed", title: "Subway Closed", details: `Resumes ${resumeDetails(hours.nextResumeLabel)}.`, action: onOpenClosed }
      : { kind: "closed", title: "GO & UP Rail Closed", details: `Trains return ${resumeDetails(hours.nextResumeLabel)}.`, action: onOpenClosed };
  }
  if (!hours.closingSoon || hours.minutesUntilClose === null || !hours.nextCloseLabel) return null;

  const durationText = formatResumeDuration(hours.minutesUntilClose);
  const timeText = hours.nextCloseLabel.replace(/^(Today|Tomorrow) /, "");
  if (network === "ttc") {
    return { kind: "closing-soon", title: "Subway Closing Soon", details: `Closes in ${durationText} · ${timeText}` };
  }
  const formattedTime = timeText.startsWith("at ") ? timeText : `at ${timeText}`;
  return { kind: "closing-soon", title: "GO & UP Closing Soon", details: `Broad close ${formattedTime} (${durationText})` };
}
