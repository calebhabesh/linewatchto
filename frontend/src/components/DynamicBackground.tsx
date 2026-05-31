"use client";

import { useEffect, useRef } from "react";

interface VantaEffect {
  destroy: () => void;
  setOptions: (options: object) => void;
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
  const backdropClassName = `linewatch-backdrop fixed inset-0 pointer-events-none z-0 transition-colors duration-500 ${
    isDark ? "linewatch-backdrop--dark bg-[#0d0808]" : "linewatch-backdrop--light bg-slate-50"
  }`;

  // Initialize Vanta effect
  useEffect(() => {
    if (reducedMotion) {
      if (vantaEffectRef.current) {
        vantaEffectRef.current.destroy();
        vantaEffectRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const initVanta = async () => {
      try {
        const THREE = await import("three");
        if (cancelled) return;

        if (typeof window !== "undefined") {
          (window as unknown as { THREE: unknown }).THREE = THREE;
        }

        // @ts-expect-error vanta net module does not have default type definitions
        const NET = (await import("vanta/dist/vanta.net.min")).default;
        if (cancelled) return;

        // Use current isDark state for initial load
        const netColor = isDark ? 0x1b354f : 0xe8ecf0;
        const bgColor = isDark ? 0x0d0808 : 0xf8fafc;

        if (containerRef.current && !vantaEffectRef.current) {
          vantaEffectRef.current = NET({
            el: containerRef.current,
            THREE,
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
            points: 8.0,
          }) as VantaEffect;
        }
      } catch (err) {
        console.error("Vanta initialization failed:", err);
      }
    };

    initVanta();

    return () => {
      cancelled = true;
      if (vantaEffectRef.current) {
        vantaEffectRef.current.destroy();
        vantaEffectRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  // Smoothly update colors on theme change
  useEffect(() => {
    if (vantaEffectRef.current) {
      const netColor = isDark ? 0x1b354f : 0xe8ecf0;
      const bgColor = isDark ? 0x0d0808 : 0xf8fafc;
      vantaEffectRef.current.setOptions({
        color: netColor,
        backgroundColor: bgColor,
      });
    }
  }, [isDark]);

  return <div ref={containerRef} className={backdropClassName} />;
}
