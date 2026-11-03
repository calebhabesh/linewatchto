import { useLayoutEffect, useRef, type RefObject } from "react";

const DURATION_MS = 280;
const EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/**
 * Collapses an element to zero width (and back) in its row, so its
 * neighbours close up smoothly instead of jumping. Collapsed, the element is
 * `hidden` and inert. The first render and reduced motion snap without
 * animating. Web Animations only: no stylesheet keyframes.
 *
 * `gap` is the row's gap before the element, pulled in as it collapses.
 */
export function useCollapseWidth(
  ref: RefObject<HTMLElement | null>,
  collapsed: boolean,
  options: {
    reducedMotion: boolean;
    gap?: number;
    /**
     * Before an expand: resolves once the layout this element's width depends
     * on is in place (it stays collapsed until then), then settles that layout
     * so the open width is measured as it will end.
     */
    beforeExpand?: { ready: () => Promise<void>; settle: () => void };
  },
): void {
  const first = useRef(true);
  const { reducedMotion, gap = 8, beforeExpand } = options;
  const beforeExpandRef = useRef(beforeExpand);
  useLayoutEffect(() => {
    beforeExpandRef.current = beforeExpand;
  });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const snap = () => {
      element.hidden = collapsed;
      element.inert = collapsed;
    };
    const prefersReduced = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (first.current || reducedMotion || prefersReduced || typeof element.animate !== "function") {
      first.current = false;
      snap();
      return;
    }
    let animation: Animation | null = null;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      // Measure the open width: shown, as it will be or as it was.
      element.hidden = false;
      if (!collapsed) beforeExpandRef.current?.settle();
      const width = element.getBoundingClientRect().width;
      const style = window.getComputedStyle(element);
      const open: Keyframe = {
        width: `${width}px`,
        opacity: 1,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
        marginLeft: "0px",
        transform: "scale(1)",
      };
      const closed: Keyframe = {
        width: "0px",
        opacity: 0,
        paddingLeft: "0px",
        paddingRight: "0px",
        marginLeft: `${-gap}px`,
        transform: "scale(0.92)",
      };
      element.inert = collapsed;
      element.style.overflow = "hidden";
      element.style.boxSizing = "border-box";
      // Contents keep their size and are clipped, never squeezed over each other.
      element.dataset.collapsing = "true";
      // A collapse holds its last frame until the element is hidden, so it
      // never flashes open for a frame at the end.
      // The content fades in the first half of a collapse (the last half of an
      // expand), so it is gone before the box is narrow enough to squeeze it.
      const keyframes: Keyframe[] = collapsed
        ? [open, { opacity: 0, offset: 0.45 }, closed]
        : [closed, { opacity: 0, offset: 0.55 }, open];
      const current = element.animate(keyframes, {
        duration: DURATION_MS,
        easing: EASING,
        fill: collapsed ? "forwards" : "none",
      });
      animation = current;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        element.hidden = collapsed;
        element.style.overflow = "";
        element.style.boxSizing = "";
        delete element.dataset.collapsing;
        if (current.playState !== "idle") current.cancel();
      };
      current.onfinish = finish;
      current.oncancel = finish;
    };
    const ready = !collapsed ? beforeExpandRef.current?.ready : undefined;
    if (ready) {
      // Stays collapsed (hidden, inert) until the layout it depends on is in place.
      element.hidden = true;
      element.inert = true;
      void ready().then(run);
    } else {
      run();
    }
    return () => {
      cancelled = true;
      animation?.cancel();
    };
  }, [collapsed, gap, reducedMotion, ref]);
}
