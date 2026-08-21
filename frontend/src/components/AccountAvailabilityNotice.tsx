"use client";

import { RefreshCcw } from "lucide-react";

type Props = {
  compact?: boolean;
  knownAccountLabel?: string | null;
};

export function AccountAvailabilityNotice({ compact = false, knownAccountLabel = null }: Props) {
  return (
    <div
      className={`account-availability-notice flex items-start gap-2.5 ${compact ? "px-3 py-2" : "p-4"}`}
      role="status"
      aria-live="polite"
    >
      <RefreshCcw className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <div className="min-w-0">
        <strong className="block text-sm text-slate-800 dark:text-slate-100">
          Account connection interrupted
        </strong>
        <span className="block text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          {knownAccountLabel ? `Last known account: ${knownAccountLabel}. This device's sign-in has not been cleared. ` : "Your sign-in has not been cleared. "}
          LineWatchTO is retrying automatically.
        </span>
      </div>
    </div>
  );
}
