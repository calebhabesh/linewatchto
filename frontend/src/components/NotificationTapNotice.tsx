"use client";

import { useEffect, useRef } from "react";
import { CircleCheck, CloudOff, Info, X } from "lucide-react";
import type { NotificationTapNotice as Notice } from "../app/notification-target";

const COLLAPSE_MS = 160;
const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

/** Keeps keyboard focus in the panel once the dismiss button is removed. */
function focusNextControl(notice: HTMLElement) {
  const scope = notice.closest("section") ?? notice.parentElement;
  const next = Array.from(scope?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    .find((element) => !notice.contains(element)
      && Boolean(notice.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING));
  next?.focus({ preventScroll: true });
}

const TONE_ICONS = {
  ended: CircleCheck,
  unlisted: Info,
  unconfirmed: CloudOff,
} as const;

/** Explains why a notification tap landed somewhere other than the notified item. */
export function NotificationTapNotice({
  notice,
  detail,
  onDismiss,
}: {
  notice: Notice;
  detail?: string | null;
  onDismiss: () => void;
}) {
  const Icon = TONE_ICONS[notice.tone];
  const noticeRef = useRef<HTMLElement>(null);
  const collapseTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (collapseTimerRef.current !== null) window.clearTimeout(collapseTimerRef.current);
  }, []);

  // Collapse to zero height so the panel content glides up instead of jumping.
  const dismiss = () => {
    const notice = noticeRef.current;
    if (!notice || notice.dataset.closing === "true") return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      || Boolean(notice.closest(".motion-paused"));
    if (notice.contains(document.activeElement)) focusNextControl(notice);
    if (reduceMotion) {
      onDismiss();
      return;
    }
    notice.style.height = `${notice.offsetHeight}px`;
    void notice.offsetHeight;
    notice.dataset.closing = "true";
    notice.style.height = "0px";
    collapseTimerRef.current = window.setTimeout(onDismiss, COLLAPSE_MS);
  };

  return (
    <aside
      ref={noticeRef}
      className="notification-tap-notice"
      data-tone={notice.tone}
      role="status"
      aria-live="polite"
    >
      <span className="notification-tap-notice-icon" aria-hidden="true">
        <Icon size={14} strokeWidth={2.4} />
      </span>
      <div className="notification-tap-notice-copy">
        <strong>{notice.title}</strong>
        <p>
          {notice.message}
          {detail ? <> {detail}</> : null}
        </p>
      </div>
      <button
        type="button"
        className="notification-tap-notice-dismiss"
        onClick={dismiss}
        aria-label="Dismiss notice"
      >
        <X size={15} aria-hidden="true" />
      </button>
    </aside>
  );
}
