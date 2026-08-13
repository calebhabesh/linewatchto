import { useCallback, useEffect, useRef } from "react";

export const MAP_RECENTER_FADE_DURATION_MS = 180;

type RecenterFadeEffect = {
  animation: Animation;
  target: HTMLElement;
};

export function useMapRecenterFade({
  animationId,
  reducedMotion,
  direction = "in",
}: {
  animationId: string;
  reducedMotion: boolean;
  direction?: "in" | "out";
}) {
  const effectRef = useRef<RecenterFadeEffect | null>(null);

  const releaseRecenterFade = useCallback((effect: RecenterFadeEffect, cancel: boolean) => {
    if (effectRef.current !== effect) return;

    effectRef.current = null;
    effect.animation.onfinish = null;
    effect.animation.oncancel = null;
    if (cancel) effect.animation.cancel();
    if (effect.target.dataset.mapRecenterEffect === animationId) {
      delete effect.target.dataset.mapRecenterEffect;
    }
  }, [animationId]);

  const clearRecenterFade = useCallback(() => {
    const effect = effectRef.current;
    if (!effect) return;
    releaseRecenterFade(effect, true);
  }, [releaseRecenterFade]);

  const playRecenterFade = useCallback((target: HTMLElement | null) => {
    clearRecenterFade();
    if (!target || reducedMotion) return;

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
    const effect = { animation, target };
    effectRef.current = effect;

    const releaseFinishedFade = () => releaseRecenterFade(effect, false);
    animation.onfinish = releaseFinishedFade;
    animation.oncancel = releaseFinishedFade;
  }, [animationId, clearRecenterFade, direction, reducedMotion, releaseRecenterFade]);

  useEffect(() => clearRecenterFade, [clearRecenterFade]);

  return { clearRecenterFade, playRecenterFade };
}
