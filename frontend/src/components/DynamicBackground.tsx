"use client";

import { useEffect, useRef } from "react";

interface VantaEffect {
  destroy: () => void;
}

export function DynamicBackground({ 
  reducedMotion,
  isDark 
}: { 
  reducedMotion: boolean;
  isDark: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vantaEffectRef = useRef<VantaEffect | null>(null);

  useEffect(() => {
    // If the effect is already initialized, destroy it first to update the colors
    if (vantaEffectRef.current) {
      vantaEffectRef.current.destroy();
      vantaEffectRef.current = null;
    }

    if (reducedMotion) {
      return;
    }

    const initVanta = async () => {
      try {
        const THREE = await import("three");
        if (typeof window !== "undefined") {
          (window as unknown as { THREE: unknown }).THREE = THREE;
        }

        // @ts-expect-error vanta net module does not have default type definitions
        const NET = (await import("vanta/dist/vanta.net.min")).default;

        const netColor = isDark ? 0x1b354f : 0xe8ecf0;           // steel blue (dark) vs soft grey (light)
        const bgColor = isDark ? 0x0d0808 : 0xf8fafc;            // very dark charcoal-red (dark) vs slate-50 (light)

        if (containerRef.current && !vantaEffectRef.current) {
          vantaEffectRef.current = NET({
            el: containerRef.current,
            THREE: THREE,
            mouseControls: true,
            touchControls: true,
            gyroControls: false,
            minHeight: 200.0,
            minWidth: 200.0,
            scale: 1.0,
            scaleMobile: 1.0,
            color: netColor,
            backgroundColor: bgColor,
            maxDistance: 15.0,
            spacing: 18.0,
            points: 8.0
          }) as VantaEffect;
        }
      } catch (err) {
        console.error("Vanta initialization failed:", err);
      }
    };

    initVanta();

    return () => {
      if (vantaEffectRef.current) {
        vantaEffectRef.current.destroy();
        vantaEffectRef.current = null;
      }
    };
  }, [reducedMotion, isDark]);

  if (reducedMotion) {
    return (
      <div className="fixed inset-0 pointer-events-none z-0 bg-slate-50 dark:bg-[#0d0808] transition-colors duration-500" />
    );
  }

  return (
    <div 
      ref={containerRef} 
      className={`fixed inset-0 pointer-events-none z-0 transition-opacity duration-500 ${isDark ? "bg-[#0d0808]" : "bg-slate-50"}`} 
    />
  );
}


