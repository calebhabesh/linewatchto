import { useCallback, useEffect, useRef } from "react";

export const MAP_RECENTER_FADE_DURATION_MS = 180;

export function useMapRecenterFade({
  animationId,
  reducedMotion,
  direction = "in",
}: {
  animationId: string;
  reducedMotion: boolean;
  direction?: "in" | "out";
}) {
  const animationRef = useRef<Animation | null>(null);

  const clearRecenterFade = useCallback(() => {
    const animation = animationRef.current;
    if (!animation) return;
    animationRef.current = null;
    animation.cancel();
  }, []);

  const playRecenterFade = useCallback((target: HTMLElement | null) => {
    if (!target || reducedMotion) return;

    clearRecenterFade();
    const animation = target.animate(
      direction === "in"
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ opacity: 1 }, { opacity: 0 }],
      {
        duration: MAP_RECENTER_FADE_DURATION_MS,
        easing: "ease-out",
      },
    );
    animation.id = animationId;
    target.dataset.mapRecenterEffect = animationId;
    animationRef.current = animation;

    const clearFadeReference = () => {
      if (animationRef.current === animation) {
        animationRef.current = null;
      }
    };
    animation.onfinish = clearFadeReference;
    animation.oncancel = clearFadeReference;
  }, [animationId, clearRecenterFade, direction, reducedMotion]);

  useEffect(() => clearRecenterFade, [clearRecenterFade]);

  return { clearRecenterFade, playRecenterFade };
}
