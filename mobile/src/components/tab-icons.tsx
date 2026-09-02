import type { ColorValue } from "react-native";
import {
  AlertTriangle,
  Map as LucideMap,
  MoreHorizontal,
  Navigation,
  Search,
} from "lucide-react-native";

interface TabIconProps {
  color: ColorValue | string;
  size?: number;
}

export function MapTabIcon({ color, size = 20 }: TabIconProps) {
  return <LucideMap color={color as string} size={size} strokeWidth={2} />;
}

export function AlertsTabIcon({ color, size = 20 }: TabIconProps) {
  return <AlertTriangle color={color as string} size={size} strokeWidth={2} />;
}

export function StationsTabIcon({ color, size = 20 }: TabIconProps) {
  return <Search color={color as string} size={size} strokeWidth={2} />;
}

export function CommutesTabIcon({ color, size = 20 }: TabIconProps) {
  return <Navigation color={color as string} size={size} strokeWidth={2} />;
}

export function MoreTabIcon({ color, size = 20 }: TabIconProps) {
  return <MoreHorizontal color={color as string} size={size} strokeWidth={2} />;
}
