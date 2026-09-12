"use client";

import { ConstellationBackground } from "./ConstellationBackground";

export function DynamicBackground({
  reducedMotion,
  isDark,
  disabled = false,
}: {
  reducedMotion: boolean;
  isDark: boolean;
  disabled?: boolean;
}) {
  const backdropClassName = `linewatch-backdrop fixed inset-0 pointer-events-none z-0 transition-colors duration-500 ${
    disabled
      ? `linewatch-backdrop--plain ${isDark ? "linewatch-backdrop--plain-dark bg-[var(--map-canvas-bg,#0e1622)]" : "linewatch-backdrop--plain-light bg-slate-50"}`
      : isDark
        ? "linewatch-backdrop--dark bg-[var(--map-canvas-bg,#0e1622)]"
        : "linewatch-backdrop--light bg-slate-50"
  }`;

  if (disabled) {
    return <div aria-hidden="true" className={backdropClassName} />;
  }

  return (
    <div aria-hidden="true" className={backdropClassName}>
      <ConstellationBackground interactive={!reducedMotion} isDark={isDark} />
    </div>
  );
}
