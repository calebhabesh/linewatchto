import { Clock3 } from "lucide-react";

import { formatResumeDuration } from "../app/subway-hours";

export function SubwayClosingSoonChip({
  minutesUntilClose,
  nextCloseLabel,
}: {
  minutesUntilClose: number;
  nextCloseLabel: string;
}) {
  return (
    <div className="subway-closing-soon-chip" role="status" aria-live="polite">
      <Clock3 aria-hidden="true" size={18} strokeWidth={2.4} />
      <span className="subway-closing-soon-copy">
        <strong>Subway Closing Soon</strong>
        <small>Closes in {formatResumeDuration(minutesUntilClose)} · {nextCloseLabel}</small>
      </span>
    </div>
  );
}
