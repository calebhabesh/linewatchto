"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { usePageVisibility } from "../../hooks/usePageVisibility";

export interface ElectricBorderProps {
  children?: React.ReactNode;
  color?: string;
  speed?: number;
  reducedMotion?: boolean;
  chaos?: number;
  borderRadius?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function ElectricBorder({
  children,
  color = "#3b82f6",
  speed = 0.2,
  reducedMotion = false,
  chaos = 0.01,
  borderRadius = 8,
  className = "",
  style,
}: ElectricBorderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageVisible = usePageVisibility();

  // Noise functions
  const random = useCallback((x: number) => {
    return (Math.sin(x * 12.9898) * 43758.5453) % 1;
  }, []);

  const noise2D = useCallback(
    (x: number, y: number) => {
      const i = Math.floor(x);
      const j = Math.floor(y);
      const fx = x - i;
      const fy = y - j;

      const a = random(i + j * 57);
      const b = random(i + 1 + j * 57);
      const c = random(i + (j + 1) * 57);
      const d = random(i + 1 + (j + 1) * 57);

      const ux = fx * fx * (3.0 - 2.0 * fx);
      const uy = fy * fy * (3.0 - 2.0 * fy);

      return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
    },
    [random]
  );

  const octavedNoise = useCallback(
    (
      x: number,
      octaves: number,
      lacunarity: number,
      gain: number,
      baseAmplitude: number,
      baseFrequency: number,
      time: number,
      seed: number,
      baseFlatness: number
    ) => {
      let y = 0;
      let amplitude = baseAmplitude;
      let frequency = baseFrequency;

      for (let i = 0; i < octaves; i++) {
        let octaveAmplitude = amplitude;
        if (i === 0) {
          octaveAmplitude *= baseFlatness;
        }
        y += octaveAmplitude * noise2D(frequency * x + seed * 100, time * frequency * 0.3);
        frequency *= lacunarity;
        amplitude *= gain;
      }

      return y;
    },
    [noise2D]
  );

  const getCornerPoint = useCallback(
    (centerX: number, centerY: number, radius: number, startAngle: number, arcLength: number, progress: number) => {
      const angle = startAngle + progress * arcLength;
      return {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      };
    },
    []
  );

  const getRoundedRectPoint = useCallback(
    (t: number, left: number, top: number, width: number, height: number, radius: number) => {
      const straightWidth = width - 2 * radius;
      const straightHeight = height - 2 * radius;
      const cornerArc = (Math.PI * radius) / 2;
      const totalPerimeter = 2 * straightWidth + 2 * straightHeight + 4 * cornerArc;
      const distance = t * totalPerimeter;

      let accumulated = 0;

      // Top edge
      if (straightWidth > 0 && distance <= accumulated + straightWidth) {
        const progress = (distance - accumulated) / straightWidth;
        return { x: left + radius + progress * straightWidth, y: top };
      }
      accumulated += straightWidth;

      // Top-right corner
      if (cornerArc > 0 && distance <= accumulated + cornerArc) {
        const progress = (distance - accumulated) / cornerArc;
        return getCornerPoint(left + width - radius, top + radius, radius, -Math.PI / 2, Math.PI / 2, progress);
      }
      accumulated += cornerArc;

      // Right edge
      if (straightHeight > 0 && distance <= accumulated + straightHeight) {
        const progress = (distance - accumulated) / straightHeight;
        return { x: left + width, y: top + radius + progress * straightHeight };
      }
      accumulated += straightHeight;

      // Bottom-right corner
      if (cornerArc > 0 && distance <= accumulated + cornerArc) {
        const progress = (distance - accumulated) / cornerArc;
        return getCornerPoint(left + width - radius, top + height - radius, radius, 0, Math.PI / 2, progress);
      }
      accumulated += cornerArc;

      // Bottom edge
      if (straightWidth > 0 && distance <= accumulated + straightWidth) {
        const progress = (distance - accumulated) / straightWidth;
        return { x: left + width - radius - progress * straightWidth, y: top + height };
      }
      accumulated += straightWidth;

      // Bottom-left corner
      if (cornerArc > 0 && distance <= accumulated + cornerArc) {
        const progress = (distance - accumulated) / cornerArc;
        return getCornerPoint(left + radius, top + height - radius, radius, Math.PI / 2, Math.PI / 2, progress);
      }
      accumulated += cornerArc;

      // Left edge
      if (straightHeight > 0 && distance <= accumulated + straightHeight) {
        const progress = (distance - accumulated) / straightHeight;
        return { x: left, y: top + height - radius - progress * straightHeight };
      }
      accumulated += straightHeight;

      // Top-left corner
      const progress = (distance - accumulated) / cornerArc;
      return getCornerPoint(left + radius, top + radius, radius, Math.PI, Math.PI / 2, progress);
    },
    [getCornerPoint]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // CSS glow layers keep the incident border visible when motion is disabled.
    if (reducedMotion || !pageVisible) {
      if (reducedMotion) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const frameInterval = 1000 / 24;
    const borderOffset = 12;
    let frameId: number | null = null;
    let timerId: number | null = null;
    let time = 0;
    let lastFrameTime = 0;
    let visible = false;
    let sheetMotionPaused = false;
    let hovered = container.matches(":hover");
    let focused = container.contains(document.activeElement);
    let points: Array<{ x: number; y: number; progress: number }> = [];

    const stop = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      if (timerId !== null) window.clearTimeout(timerId);
      frameId = null;
      timerId = null;
      lastFrameTime = 0;
    };

    const updateSize = () => {
      const { width, height } = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round((width + borderOffset * 2) * dpr));
      canvas.height = Math.max(1, Math.round((height + borderOffset * 2) * dpr));
      canvas.style.width = `${width + borderOffset * 2}px`;
      canvas.style.height = `${height + borderOffset * 2}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (width <= 0 || height <= 0) { points = []; return; }
      const radius = Math.max(0, Math.min(borderRadius, width / 2, height / 2));
      // Cache geometry until the card resizes; bound noise work on wide rows.
      const sampleCount = Math.max(8, Math.min(384, Math.ceil(2 * (width + height) / 4)));
      points = Array.from({ length: sampleCount + 1 }, (_, index) => ({
        ...getRoundedRectPoint(index / sampleCount, borderOffset, borderOffset, width, height, radius),
        progress: index / sampleCount,
      }));
    };

    const canDraw = () => visible && !sheetMotionPaused && !motionQuery.matches;
    const canAnimate = () => canDraw() && (hovered || focused);
    const draw = () => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      points.forEach(({ x, y, progress }, index) => {
        // Fine noise octaves had negligible displacement but dominated CPU.
        const xNoise = octavedNoise(progress * 8, 4, 1.6, 0.7, chaos, 10, time, 0, 0);
        const yNoise = octavedNoise(progress * 8, 4, 1.6, 0.7, chaos, 10, time, 1, 0);
        if (index === 0) ctx.moveTo(x + xNoise * 60, y + yNoise * 60);
        else ctx.lineTo(x + xNoise * 60, y + yNoise * 60);
      });
      ctx.closePath();
      ctx.stroke();
    };

    const schedule = () => {
      timerId = window.setTimeout(() => {
        timerId = null;
        frameId = requestAnimationFrame(tick);
      }, frameInterval);
    };
    const tick = (now: number) => {
      frameId = null;
      if (!canAnimate()) return;
      const delta = lastFrameTime ? Math.min(now - lastFrameTime, 100) : frameInterval;
      time += delta / 1000 * speed;
      lastFrameTime = now;
      draw();
      schedule();
    };
    const synchronize = () => {
      stop();
      if (motionQuery.matches) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      if (!canDraw()) return;
      draw();
      if (canAnimate()) schedule();
    };
    const handlePointerEnter = () => { hovered = true; synchronize(); };
    const handlePointerLeave = () => { hovered = false; synchronize(); };
    const handleFocusIn = () => { focused = true; synchronize(); };
    const handleFocusOut = (event: FocusEvent) => {
      focused = event.relatedTarget instanceof Node && container.contains(event.relatedTarget);
      synchronize();
    };
    const handleSheetMotion = (event: Event) => {
      sheetMotionPaused = Boolean((event as CustomEvent<{ paused?: boolean }>).detail?.paused);
      synchronize();
    };

    const handleResize = () => { updateSize(); synchronize(); };
    updateSize();
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      synchronize();
    });
    intersectionObserver.observe(container);
    motionQuery.addEventListener("change", synchronize);
    container.addEventListener("pointerenter", handlePointerEnter);
    container.addEventListener("pointerleave", handlePointerLeave);
    container.addEventListener("focusin", handleFocusIn);
    container.addEventListener("focusout", handleFocusOut);
    window.addEventListener("linewatch:sheet-motion", handleSheetMotion);
    window.addEventListener("resize", handleResize);

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      motionQuery.removeEventListener("change", synchronize);
      container.removeEventListener("pointerenter", handlePointerEnter);
      container.removeEventListener("pointerleave", handlePointerLeave);
      container.removeEventListener("focusin", handleFocusIn);
      container.removeEventListener("focusout", handleFocusOut);
      window.removeEventListener("linewatch:sheet-motion", handleSheetMotion);
      window.removeEventListener("resize", handleResize);
    };
  }, [color, speed, chaos, borderRadius, reducedMotion, pageVisible, octavedNoise, getRoundedRectPoint]);

  const vars = {
    "--electric-border-color": color,
    borderRadius: `${borderRadius}px`,
  } as React.CSSProperties;

  return (
    <div
      ref={containerRef}
      className={`electric-border ${className}`.trim()}
      style={{ ...vars, ...style }}
    >
      <div className="eb-canvas-container" aria-hidden="true">
        <canvas ref={canvasRef} className="eb-canvas" />
      </div>
      <div className="eb-layers" aria-hidden="true">
        <div className="eb-glow-1" />
        <div className="eb-glow-2" />
        <div className="eb-background-glow" />
      </div>
      <div className="eb-content">{children}</div>
    </div>
  );
}

export default ElectricBorder;
