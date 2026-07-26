import { Clock3 } from "lucide-react";

import { formatResumeDuration } from "../app/subway-hours";

export function GoUpClosingSoonChip({
  minutesUntilClose,
  nextCloseLabel,
}: {
  minutesUntilClose: number;
  nextCloseLabel: string;
}) {
  const durationText = formatResumeDuration(minutesUntilClose);
  const timeText = nextCloseLabel.replace(/^(Today|Tomorrow) /, "");

  return (
    <div
      className="subway-closing-soon-chip go-up-closing-soon-chip"
      role="status"
      aria-live="polite"
    >
      <span className="subway-closing-soon-copy">
        <strong>GO &amp; UP Rail Closing Soon</strong>
        <small className="subway-closing-soon-details">
          <span className="subway-closing-prefix">Broad overnight pause in </span>
          <span className="subway-closing-countdown-badge">
            <Clock3 aria-hidden="true" size={14} strokeWidth={2.8} />
            <span>{durationText}</span>
          </span>
          <span className="subway-closing-time"> {timeText}</span>
        </small>
      </span>
    </div>
  );
}
