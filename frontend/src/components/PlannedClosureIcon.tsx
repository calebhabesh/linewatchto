import type { SVGProps } from "react";

type PlannedClosureIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

export function PlannedClosureIcon({
  size = 24,
  width,
  height,
  strokeWidth = 2,
  ...props
}: PlannedClosureIconProps) {
  return (
    <svg
      {...props}
      aria-hidden={props["aria-hidden"] ?? true}
      fill="none"
      focusable="false"
      height={height ?? size}
      viewBox="0 0 24 24"
      width={width ?? size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="3"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      <path
        d="M3 9H21M12 12V15M12 18H12.01M7 3V5M17 3V5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}
