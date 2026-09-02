import type { ColorValue } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

interface TabIconProps {
  color: ColorValue | string;
  size?: number;
}

export function MapTabIcon({ color, size = 20 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z"
        stroke={color as string}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M9 3v15M15 6v15" stroke={color as string} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function AlertsTabIcon({ color, size = 20 }: TabIconProps) {
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

export function StationsTabIcon({ color, size = 20 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8" stroke={color as string} strokeWidth={2} />
      <Circle cx="12" cy="12" r="3" fill={color as string} />
      <Path d="M12 2v2M12 20v2M2 12h2M20 12h2" stroke={color as string} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function CommutesTabIcon({ color, size = 20 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="6" cy="19" r="3" stroke={color as string} strokeWidth={2} />
      <Circle cx="18" cy="5" r="3" stroke={color as string} strokeWidth={2} />
      <Path
        d="M18 8a9 9 0 01-9 9H6"
        stroke={color as string}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function MoreTabIcon({ color, size = 20 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="2" fill={color as string} />
      <Circle cx="19" cy="12" r="2" fill={color as string} />
      <Circle cx="5" cy="12" r="2" fill={color as string} />
    </Svg>
  );
}
