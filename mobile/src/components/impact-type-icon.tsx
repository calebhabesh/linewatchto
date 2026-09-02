import type { ColorValue } from "react-native";
import {
  AlertTriangleIcon,
  ConstructionIcon,
  DelayIcon,
  PlannedClosureIcon,
} from "@/components/operations-icons";
import { useTheme } from "@/theme/theme-provider";

export type ImpactKind = "suspension" | "delay" | "reduced-speed-zone" | "planned-closure";

export function ImpactTypeIcon({
  kind,
  size = 18,
  color,
}: {
  kind: ImpactKind;
  size?: number;
  color?: ColorValue | string;
}) {
  const { theme } = useTheme();

  if (kind === "delay") {
    return <DelayIcon color={color ?? theme.line.delay} size={size} />;
  }

  if (kind === "reduced-speed-zone") {
    return <ConstructionIcon color={color ?? theme.line.rsz} size={size} />;
  }

  if (kind === "planned-closure") {
    return <PlannedClosureIcon color={color ?? theme.line.planned} size={size} />;
  }

  return <AlertTriangleIcon color={color ?? theme.line.suspension} size={size} />;
}
