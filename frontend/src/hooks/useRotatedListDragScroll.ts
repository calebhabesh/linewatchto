"use client";

import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from "react";

export function computeRotatedScrollDelta(dx: number, dy: number): number {
  return Math.abs(dx) >= Math.abs(dy) ? dx : -dy;
}

export function useRotatedListDragScroll(enabled: boolean) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);
  const clickTimeoutRef = useRef<number | null>(null);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startScrollTop: number;
    lastX: number;
    lastY: number;
    lastTime: number;
    velocity: number;
    isDragging: boolean;
    rafId: number | null;
  } | null>(null);

  const stopMomentum = useCallback(() => {
    if (dragRef.current?.rafId) {
      cancelAnimationFrame(dragRef.current.rafId);
      dragRef.current.rafId = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopMomentum();
      if (clickTimeoutRef.current) {
        window.clearTimeout(clickTimeoutRef.current);
      }
    };
  }, [stopMomentum]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      stopMomentum();

      const list = listRef.current;
      if (!list) return;

      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startScrollTop: list.scrollTop,
        lastX: event.clientX,
        lastY: event.clientY,
        lastTime: performance.now(),
        velocity: 0,
        isDragging: false,
        rafId: null,
      };
    },
    [enabled, stopMomentum],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const list = listRef.current;
      if (!list) return;

      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const delta = computeRotatedScrollDelta(dx, dy);

      if (!drag.isDragging) {
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          drag.isDragging = true;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Safe fallback if pointer capture is unsupported
          }
        }
      }

      if (drag.isDragging) {
        list.scrollTop = drag.startScrollTop + delta;

        const now = performance.now();
        const dt = now - drag.lastTime;
        if (dt > 8) {
          const stepDx = event.clientX - drag.lastX;
          const stepDy = event.clientY - drag.lastY;
          const stepDelta = computeRotatedScrollDelta(stepDx, stepDy);
          drag.velocity = stepDelta / dt;
          drag.lastX = event.clientX;
          drag.lastY = event.clientY;
          drag.lastTime = now;
        }
      }
    },
    [enabled],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      if (drag.isDragging) {
        try {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        } catch {
          // Safe fallback
        }

        suppressClickRef.current = true;
        if (clickTimeoutRef.current) {
          window.clearTimeout(clickTimeoutRef.current);
        }
        clickTimeoutRef.current = window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 80);

        const list = listRef.current;
        let velocity = drag.velocity;
        if (Math.abs(velocity) > 2.5) {
          velocity = Math.sign(velocity) * 2.5;
        }

        const timeSinceLastMove = performance.now() - drag.lastTime;
        if (list && timeSinceLastMove < 100 && Math.abs(velocity) > 0.15) {
          let currentVelocity = velocity;
          let lastFrameTime = performance.now();

          const momentumStep = () => {
            const activeList = listRef.current;
            if (!activeList) {
              if (dragRef.current) dragRef.current.rafId = null;
              return;
            }

            const now = performance.now();
            const dt = Math.min(now - lastFrameTime, 32);
            lastFrameTime = now;

            const maxScroll = activeList.scrollHeight - activeList.clientHeight;
            const nextScroll = activeList.scrollTop + currentVelocity * dt;
            activeList.scrollTop = nextScroll;

            if (
              (activeList.scrollTop <= 0 && currentVelocity < 0) ||
              (activeList.scrollTop >= maxScroll && currentVelocity > 0)
            ) {
              if (dragRef.current) dragRef.current.rafId = null;
              return;
            }

            currentVelocity *= Math.pow(0.92, dt / 16);

            if (Math.abs(currentVelocity) > 0.04) {
              if (dragRef.current) {
                dragRef.current.rafId = requestAnimationFrame(momentumStep);
              }
            } else {
              if (dragRef.current) dragRef.current.rafId = null;
            }
          };

          drag.rafId = requestAnimationFrame(momentumStep);
        }
      }

      if (!drag.rafId) {
        dragRef.current = null;
      }
    },
    [enabled],
  );

  const handlePointerCancel = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Safe fallback
      }

      stopMomentum();
      dragRef.current = null;
    },
    [enabled, stopMomentum],
  );

  const handleClickCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current || dragRef.current?.isDragging) {
      event.stopPropagation();
      event.preventDefault();
    }
  }, []);

  return {
    listRef,
    scrollContainerProps: {
      ref: listRef,
      style: { touchAction: enabled ? ("none" as const) : undefined },
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onClickCapture: handleClickCapture,
    },
  };
}
