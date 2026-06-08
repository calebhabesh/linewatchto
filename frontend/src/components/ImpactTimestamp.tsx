"use client";

import { useEffect, useState } from "react";
import { formatRelativeImpactTime } from "../app/impact-time";

export function ImpactTimestamp({ timestamp }: { timestamp?: string | null }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!timestamp) return <>Not reported</>;

  return (
    <time dateTime={timestamp} title={new Date(timestamp).toLocaleString()} suppressHydrationWarning>
      {formatRelativeImpactTime(timestamp)}
    </time>
  );
}
