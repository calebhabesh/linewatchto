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
        <small className="subway-closing-soon-details">
          <span className="subway-closing-duration">Closes in {formatResumeDuration(minutesUntilClose)}</span>
          <span className="subway-closing-separator"> · </span>
          <span className="subway-closing-time">{nextCloseLabel}</span>
        </small>
      </span>
    </div>
  );
}
