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
  const { theme } = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? message}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      role="progressbar"
      style={[compact ? styles.compactContainer : styles.fullContainer, style]}
    >
      <ActivityIndicator color={theme.color.focus} size={compact ? "small" : "large"} />
      <Text style={[compact ? styles.compactMessage : styles.fullMessage, { color: theme.color.text }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fullContainer: {
    minHeight: 240,
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
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  compactMessage: {
    fontSize: 14,
    fontWeight: "700",
  },
});
