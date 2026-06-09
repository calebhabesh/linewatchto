"use client";

import type { ReactNode } from "react";

export function FloatingPanelShell({
  children,
  panel,
  mobileSheetLabel,
}: {
  children: ReactNode;
  panel: string;
  mobileSheetLabel?: string;
}) {
  return (
    <div
      className="floating-panel-shell"
      data-floating-panel={panel}
      data-mobile-sheet-label={mobileSheetLabel ?? panel}
    >
      <div className="mobile-sheet-grabber" aria-hidden="true" />
      <div className="floating-panel-scroll">
        {children}
      </div>
    </div>
  );
}
