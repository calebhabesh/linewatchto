import type { ColorValue } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

export interface IconProps {
  color?: ColorValue | string;
  size?: number;
}

export function CloseIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 6L6 18M6 6l12 12"
        stroke={color as string}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function BackIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 12H5M12 19l-7-7 7-7"
        stroke={color as string}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChevronRightIcon({ color = "#ffffff", size = 16 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 18l6-6-6-6"
        stroke={color as string}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChevronDownIcon({ color = "#ffffff", size = 16 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 9l6 6 6-6"
        stroke={color as string}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChevronUpIcon({ color = "#ffffff", size = 16 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 15l-6-6-6 6"
        stroke={color as string}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function LocateIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="7" stroke={color as string} strokeWidth={2} />
      <Line x1="12" y1="2" x2="12" y2="5" stroke={color as string} strokeWidth={2} strokeLinecap="round" />
      <Line x1="12" y1="19" x2="12" y2="22" stroke={color as string} strokeWidth={2} strokeLinecap="round" />
      <Line x1="2" y1="12" x2="5" y2="12" stroke={color as string} strokeWidth={2} strokeLinecap="round" />
      <Line x1="19" y1="12" x2="22" y2="12" stroke={color as string} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function RefreshIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M23 4v6h-6M1 20v-6h6"
        stroke={color as string}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"
        stroke={color as string}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ThemeToggleIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color as string} strokeWidth={2} />
      <Path d="M12 3a9 9 0 010 18z" fill={color as string} />
    </Svg>
  );
}

export function TrainIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="4" y="3" width="16" height="15" rx="3" stroke={color as string} strokeWidth={2} />
      <Path d="M4 11h16M9 3v8M15 3v8" stroke={color as string} strokeWidth={1.5} />
      <Circle cx="8" cy="15" r="1.5" fill={color as string} />
      <Circle cx="16" cy="15" r="1.5" fill={color as string} />
      <Path d="M6 18l-2 3M18 18l2 3M8 21h8" stroke={color as string} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function AlertTriangleIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        stroke={color as string}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M12 9v4M12 17h.01" stroke={color as string} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function BellIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
        stroke={color as string}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SearchIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="8" stroke={color as string} strokeWidth={2} />
      <Path d="M21 21l-4.35-4.35" stroke={color as string} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function BookmarkIcon({ color = "#ffffff", size = 18, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? (color as string) : "none"}>
      <Path
        d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"
        stroke={color as string}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ConstructionIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="6" width="20" height="8" rx="1" stroke={color as string} strokeWidth={2} />
      <Path d="M17 14v7M7 14v7M14 6l4 8M10 6l4 8M6 6l4 8" stroke={color as string} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

export function InfoIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color as string} strokeWidth={2} />
      <Path d="M12 16v-4M12 8h.01" stroke={color as string} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function CheckIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6L9 17l-5-5" stroke={color as string} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ClockIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color as string} strokeWidth={2} />
      <Path d="M12 6v6l4 2" stroke={color as string} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
