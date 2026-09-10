/**
 * Give direct manipulation priority over decorative loops. Preserve animation
 * positions and data updates; never pause finite sheet/navigation transitions.
 */
export function reserveSheetMotionBudget(element: HTMLElement): (settleMs?: number) => void {
  const shell = element.closest<HTMLElement>(".linewatch-shell");
  if (!shell) return () => {};
  const animations = shell.getAnimations({ subtree: true }).filter(animation =>
    animation.playState === "running"
    && animation.effect?.getTiming().iterations === Infinity
  );
  const svgRoots = Array.from(shell.querySelectorAll<SVGSVGElement>("svg"))
    .filter(svg => svg.querySelector("animate, animateMotion, animateTransform")
      && typeof svg.animationsPaused === "function" && !svg.animationsPaused());
  animations.forEach(animation => animation.pause());
  svgRoots.forEach(svg => svg.pauseAnimations());
  let released = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const resume = () => {
    if (released) return;
    released = true;
    animations.forEach(animation => {
      // A cancelled/replaced animation must not be resurrected.
      if (animation.playState === "paused") animation.play();
    });
    svgRoots.forEach(svg => { if (svg.isConnected) svg.unpauseAnimations(); });
  };
  return (settleMs = 0) => {
    if (timer !== undefined) clearTimeout(timer);
    if (settleMs > 0) timer = setTimeout(resume, settleMs);
    else resume();
  };
}
