"use client";

import type { ReactNode } from "react";

export function FloatingPanelShell({
  children,
  panel,
}: {
  children: ReactNode;
  panel: string;
}) {
  return (
    <div className="floating-panel-shell" data-floating-panel={panel}>
      <div className="floating-panel-scroll">
        {children}
      </div>
    </div>
  );
}
