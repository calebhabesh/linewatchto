import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { useTheme } from "@/theme/theme-provider";

export interface LoadingStateProps {
  message?: string;
  compact?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

export function LoadingState({
  message = "Loading service status…",
  compact = false,
  style,
  accessibilityLabel,
}: LoadingStateProps) {
  const { theme, mode } = useTheme();

  const indicatorColor = mode === "high-contrast" ? "#ffffff" : theme.color.focus;
  const textColor = mode === "high-contrast" ? "#ffffff" : theme.color.text;

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? message}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      role="progressbar"
      style={[compact ? styles.compactContainer : styles.fullContainer, style]}
      testID="loading-state"
    >
      <ActivityIndicator color={indicatorColor} size={compact ? "small" : "large"} />
      <Text style={[compact ? styles.compactMessage : styles.fullMessage, { color: textColor }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fullContainer: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 16,
  },
  compactContainer: {
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  fullMessage: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  compactMessage: {
    fontSize: 13,
    fontWeight: "600",
  },
});
