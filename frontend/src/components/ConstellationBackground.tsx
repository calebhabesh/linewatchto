"use client";

import { useEffect, useRef } from "react";

type ConstellationBackgroundProps = {
  interactive?: boolean;
  isDark?: boolean;
};

type Node = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};

const NODE_SPACING = 78;
const CONNECTION_DISTANCE = 125;
const POINTER_DISTANCE = 105;
const MOBILE_BREAKPOINT = 768;
const MOBILE_NODE_SPACING = 108;
const MOBILE_CONNECTION_DISTANCE = 104;

export function ConstellationBackground({
  interactive = true,
  isDark = true,
}: ConstellationBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let width = 0;
    let height = 0;
    let frameId = 0;
    let nodes: Node[] = [];
    let isMobile = false;
    const pointer = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY };

    const createNodes = () => {
      const nodeSpacing = isMobile ? MOBILE_NODE_SPACING : NODE_SPACING;
      const count = Math.max(isMobile ? 12 : 24, Math.min(isMobile ? 42 : 110, Math.round((width * height) / (nodeSpacing * nodeSpacing))));
      const drift = isMobile ? 0.07 : 0.12;
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * drift,
        vy: (Math.random() - 0.5) * drift,
        radius: (isMobile ? 0.65 : 0.8) + Math.random() * (isMobile ? 0.7 : 1.25),
      }));
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      isMobile = width < MOBILE_BREAKPOINT;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      createNodes();
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);

      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        const connectionDistance = isMobile ? MOBILE_CONNECTION_DISTANCE : CONNECTION_DISTANCE;

        if (interactive && !isMobile) {
          const pointerX = node.x - pointer.x;
          const pointerY = node.y - pointer.y;
          const pointerDistance = Math.hypot(pointerX, pointerY);
          if (pointerDistance < POINTER_DISTANCE && pointerDistance > 0) {
            const force = (POINTER_DISTANCE - pointerDistance) / POINTER_DISTANCE;
            node.x += (pointerX / pointerDistance) * force * 0.7;
            node.y += (pointerY / pointerDistance) * force * 0.7;
          }

        }

        if (interactive) {
          node.x += node.vx;
          node.y += node.vy;
          if (node.x < -4) node.x = width + 4;
          if (node.x > width + 4) node.x = -4;
          if (node.y < -4) node.y = height + 4;
          if (node.y > height + 4) node.y = -4;
        }

        for (let peerIndex = index + 1; peerIndex < nodes.length; peerIndex += 1) {
          const peer = nodes[peerIndex];
          const distance = Math.hypot(node.x - peer.x, node.y - peer.y);
          if (distance >= connectionDistance) continue;

          const opacity = (1 - distance / connectionDistance)
            * (isMobile ? (isDark ? 0.09 : 0.07) : (isDark ? 0.18 : 0.16));
          context.beginPath();
          context.moveTo(node.x, node.y);
          context.lineTo(peer.x, peer.y);
          context.strokeStyle = isDark
            ? `rgba(129, 201, 255, ${opacity})`
            : `rgba(30, 64, 95, ${opacity})`;
          context.lineWidth = 0.7;
          context.stroke();
        }

        context.beginPath();
        context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        context.fillStyle = isMobile
          ? (isDark ? "rgba(196, 225, 247, 0.32)" : "rgba(30, 64, 95, 0.21)")
          : (isDark ? "rgba(196, 225, 247, 0.6)" : "rgba(30, 64, 95, 0.38)");
        context.fill();
      }

      if (interactive) frameId = window.requestAnimationFrame(draw);
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    const handlePointerLeave = () => {
      pointer.x = Number.POSITIVE_INFINITY;
      pointer.y = Number.POSITIVE_INFINITY;
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    if (interactive) {
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", handlePointerLeave);
    }

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      document.documentElement.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [interactive, isDark]);

  return <canvas ref={canvasRef} className="constellation-background-canvas" />;
}
