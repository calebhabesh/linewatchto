import { AlertTriangle, ChevronRight, Clock3, Loader2, Moon } from "lucide-react";
import type { ServiceOperatingNotice } from "../app/shell-service-notices";

export type DesktopNotice =
  | {
      kind: "connection";
      message: string;
      snapshot?: boolean;
      showSpinner?: boolean;
    }
  | ServiceOperatingNotice;

/** The desktop sidebar's connection or operating-hours notice row. */
export function DesktopNoticeBanner({ notice }: { notice: DesktopNotice }) {
  if (notice.kind === "connection") {
    return (
      <div
        className="mobile-service-sheet-notice-row mobile-service-sheet-notice-row--connection"
        data-snapshot={notice.snapshot ? "true" : undefined}
        role="status"
        aria-live="polite"
        onClick={(e) => e.stopPropagation()}
        aria-label={notice.message}
      >
        <AlertTriangle size={13} className="dashboard-availability-notice-icon shrink-0" aria-hidden="true" />
        <span className="mobile-service-sheet-notice-message">{notice.message}</span>
        {notice.showSpinner !== false && (
          <Loader2 size={12} className="dashboard-availability-notice-spinner shrink-0" aria-hidden="true" />
        )}
      </div>
    );
  }

  if (notice.action) {
    return (
      <button
        type="button"
        aria-live="polite"
        className={`mobile-service-sheet-notice-row desktop-operating-notice mobile-service-sheet-notice-row--${notice.kind}`}
        onClick={(event) => {
          event.stopPropagation();
          notice.action?.();
        }}
      >
        <span className="mobile-service-sheet-notice-icon shrink-0" aria-hidden="true">
          <Moon size={13} strokeWidth={1} fill="currentColor" />
        </span>
        <span className="desktop-operating-notice-copy">
          <strong className="mobile-service-sheet-notice-title">{notice.title}</strong>
          {notice.details && <span className="mobile-service-sheet-notice-details">{notice.details}</span>}
        </span>
        {notice.details && (
          <ChevronRight size={12} strokeWidth={2.5} className="mobile-service-sheet-notice-chevron" aria-hidden="true" />
        )}
      </button>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mobile-service-sheet-notice-row desktop-operating-notice mobile-service-sheet-notice-row--${notice.kind}`}
    >
      <span className="mobile-service-sheet-notice-icon shrink-0" aria-hidden="true">
        <Clock3 size={13} strokeWidth={2.5} />
      </span>
      <span className="desktop-operating-notice-copy">
        <strong className="mobile-service-sheet-notice-title">{notice.title}</strong>
        {notice.details && <span className="mobile-service-sheet-notice-details">{notice.details}</span>}
      </span>
    </div>
  );
}
