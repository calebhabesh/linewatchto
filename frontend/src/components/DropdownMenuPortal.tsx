"use client";

import {
  type CSSProperties,
  type ElementType,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export interface DropdownMenuPortalProps {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  anchorRef?: React.RefObject<HTMLElement | null>;
  matchAnchorWidth?: boolean;
  align?: "left" | "right";
  minWidth?: number;
  maxWidth?: number;
  maxHeight?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  as?: ElementType;
  role?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

interface Coords {
  top?: number;
  bottom?: number;
  left?: number | "auto";
  right?: number | "auto";
  minWidth?: number;
  maxWidth?: number;
  maxHeight: number;
}

export function DropdownMenuPortal({
  open,
  onClose,
  triggerRef,
  anchorRef,
  matchAnchorWidth = false,
  align = "left",
  minWidth,
  maxWidth,
  maxHeight,
  className,
  style,
  children,
  as: Component = "div",
  role,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: DropdownMenuPortalProps) {
  const mounted = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
  const [coords, setCoords] = useState<Coords | null>(null);
  const menuRef = useRef<HTMLElement | null>(null);

  const updateCoords = useCallback(() => {
    const trigger = anchorRef?.current ?? triggerRef.current;
    if (!trigger) {
      setCoords(null);
      return;
    }

    const rect = trigger.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return;
    }

    // If trigger scrolled entirely out of the viewport, close the popover.
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      onClose();
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const edgeMargin = 8;
    const gap = 4;

    const spaceBelow = viewportHeight - rect.bottom - gap - edgeMargin;
    const spaceAbove = rect.top - gap - edgeMargin;
    const placeBelow = spaceBelow >= 140 || spaceBelow >= spaceAbove;
    const availableHeight = placeBelow ? spaceBelow : spaceAbove;
    const computedMaxHeight = Math.min(
      maxHeight ?? 540,
      Math.max(120, Math.floor(availableHeight)),
    );

    const resolvedMinWidth = minWidth ?? Math.max(140, Math.round(rect.width));
    const resolvedMaxWidth = Math.min(
      matchAnchorWidth ? rect.width : maxWidth ?? 300,
      viewportWidth - 2 * edgeMargin,
    );

    let left: number | "auto" = "auto";
    let right: number | "auto" = "auto";

    if (align === "right") {
      let r = viewportWidth - rect.right;
      if (r < edgeMargin) r = edgeMargin;
      if (viewportWidth - r < resolvedMinWidth) {
        r = Math.max(edgeMargin, viewportWidth - edgeMargin - resolvedMinWidth);
      }
      right = Math.round(r);
      left = "auto";
    } else {
      let l = rect.left;
      if (l < edgeMargin) l = edgeMargin;
      if (l + resolvedMinWidth > viewportWidth - edgeMargin) {
        l = Math.max(edgeMargin, viewportWidth - edgeMargin - resolvedMinWidth);
      }
      left = Math.round(l);
      right = "auto";
    }

    const newCoords: Coords = {
      top: placeBelow ? Math.round(rect.bottom + gap) : undefined,
      bottom: !placeBelow
        ? Math.round(viewportHeight - rect.top + gap)
        : undefined,
      left,
      right,
      minWidth: resolvedMinWidth,
      maxWidth: resolvedMaxWidth,
      maxHeight: computedMaxHeight,
    };

    setCoords(newCoords);
  }, [align, anchorRef, matchAnchorWidth, maxHeight, maxWidth, minWidth, onClose, triggerRef]);

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updateCoords();
  }, [open, updateCoords]);

  useEffect(() => {
    if (!open) return;

    const onScrollOrResize = () => updateCoords();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    window.visualViewport?.addEventListener("resize", onScrollOrResize);
    window.visualViewport?.addEventListener("scroll", onScrollOrResize);

    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      window.visualViewport?.removeEventListener("resize", onScrollOrResize);
      window.visualViewport?.removeEventListener("scroll", onScrollOrResize);
    };
  }, [open, updateCoords]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent | MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        if (triggerRef.current instanceof HTMLElement) {
          triggerRef.current.focus();
        }
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, triggerRef]);

  if (!open || !mounted) return null;

  const portalTarget =
    document.querySelector(".linewatch-shell") || document.body;

  const mergedStyle: CSSProperties = {
    position: "fixed",
    top: coords?.top !== undefined ? `${coords.top}px` : "auto",
    bottom: coords?.bottom !== undefined ? `${coords.bottom}px` : "auto",
    left: coords?.left !== undefined && coords.left !== "auto" ? `${coords.left}px` : "auto",
    right: coords?.right !== undefined && coords.right !== "auto" ? `${coords.right}px` : "auto",
    minWidth: coords?.minWidth ? `${coords.minWidth}px` : undefined,
    maxWidth: coords?.maxWidth ? `${coords.maxWidth}px` : undefined,
    maxHeight: coords?.maxHeight ? `${coords.maxHeight}px` : undefined,
    zIndex: 9999,
    visibility: coords ? "visible" : "hidden",
    ...style,
  };

  return createPortal(
    <Component
      ref={menuRef}
      id={id}
      role={role}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={className}
      style={mergedStyle}
    >
      {children}
    </Component>,
    portalTarget,
  );
}
