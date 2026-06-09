"use client";

import DotGrid from "./DotGrid";

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
    isDark ? "linewatch-backdrop--dark bg-[#0d0808]" : "linewatch-backdrop--light bg-slate-50"
  }`;

  if (reducedMotion || disabled) {
    return <div aria-hidden="true" className={backdropClassName} />;
  }

  return (
    <div aria-hidden="true" className={backdropClassName}>
      <DotGrid
        dotSize={2}
        gap={38}
        baseColor="#1b2a36"
        activeColor="#9E2F2F"
        proximity={100}
        shockRadius={90}
        shockStrength={1}
        resistance={1900}
        returnDuration={1.2}
      />
    </div>
  );
}
