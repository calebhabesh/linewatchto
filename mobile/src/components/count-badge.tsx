import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/theme-provider";

export type CountBadgeProps = {
  count: number | string;
  color?: string;
  size?: "small" | "medium";
  testID?: string;
};

export const CountBadge = memo(function CountBadge({
  count,
  color,
  size = "medium",
  testID = "count-badge",
}: CountBadgeProps) {
  const { theme } = useTheme();
  const bg = color ?? theme.line.suspension;

  return (
    <View
      style={[
        styles.badge,
        size === "small" ? styles.badgeSmall : styles.badgeMedium,
        { backgroundColor: bg },
      ]}
      testID={testID}
    >
      <Text style={[styles.text, size === "small" ? styles.textSmall : styles.textMedium]}>
        {count}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 999,
  },
  badgeSmall: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
  },
  badgeMedium: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
  },
  text: {
    color: "#ffffff",
    fontWeight: "900",
    textAlign: "center",
  },
  textSmall: {
    fontSize: 9,
    lineHeight: 12,
  },
  textMedium: {
    fontSize: 10,
    lineHeight: 14,
  },
});
