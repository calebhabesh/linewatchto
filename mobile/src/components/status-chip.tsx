import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/theme-provider";
import { typography } from "@/theme/typography";

export type StatusChipProps = {
  label: string;
  kind?: "normal" | "delay" | "rsz" | "reduced-speed-zone" | "planned" | "planned-closure" | "suspension";
  testID?: string;
};

export const StatusChip = memo(function StatusChip({
  label,
  kind = "normal",
  testID = "status-chip",
}: StatusChipProps) {
  const { theme } = useTheme();

  const colorMap: Record<string, string> = {
    normal: theme.line.normal,
    delay: theme.line.delay,
    rsz: theme.line.rsz,
    "reduced-speed-zone": theme.line.rsz,
    planned: theme.line.planned,
    "planned-closure": theme.line.planned,
    suspension: theme.line.suspension,
  };

  const statusColor = colorMap[kind] ?? theme.line.normal;

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: `${statusColor}22`,
          borderColor: statusColor,
        },
      ]}
      testID={testID}
    >
      <View style={[styles.dot, { backgroundColor: statusColor }]} />
      <Text style={[styles.text, { color: statusColor }]}>{label}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    ...typography.meta,
    fontWeight: "800",
  },
});
