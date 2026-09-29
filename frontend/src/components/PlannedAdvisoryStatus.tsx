"use client";

import { useEffect, useState } from "react";
import type { PlannedClosure } from "../app/linewatch-data";
import { plannedAdvisoryStatus } from "../app/planned-advisory-status";

export function PlannedAdvisoryStatus({ closure }: { closure: PlannedClosure }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return <>{plannedAdvisoryStatus(closure, now)}</>;
}
