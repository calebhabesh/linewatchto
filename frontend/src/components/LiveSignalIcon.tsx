import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & {
  size?: number;
};

/**
 * Animated Radio broadcast signal icon accompanying the LIVE arrival badges.
 * Recreates the Lucide Radio icon geometry with concentric wave arcs that
 * animate an outward-propagating signal wave.
 */
export function LiveSignalIcon({
  size = 14,
  className = "",
  ...props
}: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`live-signal-icon ${className}`}
      data-testid="live-signal-icon"
      aria-hidden="true"
      {...props}
    >
      {/* Outer broadcast wave arcs */}
      <path
        d="M4.925 19.067a10 10 0 0 1 0-14.134"
        className="live-signal-arc-outer"
      />
      <path
        d="M19.075 4.933a10 10 0 0 1 0 14.134"
        className="live-signal-arc-outer"
      />
      {/* Inner broadcast wave arcs */}
      <path
        d="M7.753 16.239a6 6 0 0 1 0-8.478"
        className="live-signal-arc-inner"
      />
      <path
        d="M16.247 7.761a6 6 0 0 1 0 8.478"
        className="live-signal-arc-inner"
      />
      {/* Center transmitter beacon */}
      <circle
        cx="12"
        cy="12"
        r="2"
        className="live-signal-dot"
        fill="currentColor"
      />
    </svg>
  );
}
