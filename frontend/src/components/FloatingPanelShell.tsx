"use client";

import type { ReactNode } from "react";

export function FloatingPanelShell({
  children,
  panel,
  mobileSheetLabel,
  navDirection = "forward",
  isClosing = false,
  isGoingBack = false,
}: {
  children: ReactNode;
  panel: string;
  mobileSheetLabel?: string;
  navDirection?: "forward" | "back";
  isClosing?: boolean;
  isGoingBack?: boolean;
}) {
  return (
    <div
      className={`floating-panel-shell ${isClosing ? "floating-panel-closing" : ""} ${isGoingBack ? "floating-panel-back-exit" : ""}`}
      data-floating-panel={panel}
      data-mobile-sheet-label={mobileSheetLabel ?? panel}
      data-nav-direction={navDirection}
      data-closing={isClosing ? "true" : undefined}
      data-going-back={isGoingBack ? "true" : undefined}
    >
      <div className="floating-panel-scroll">
        {children}
      </div>
    </div>
  );
}
