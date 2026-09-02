import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { useTheme } from "@/theme/theme-provider";

export interface EmptyStateProps {
  title: string;
  message?: string;
  compact?: boolean;
  style?: ViewStyle;
}

export function EmptyState({ title, message, compact = false, style }: EmptyStateProps) {
  const { theme } = useTheme();

  if (compact) {
    return (
      <View
        accessible
        accessibilityRole="summary"
        role="summary"
        style={[styles.compactContainer, style]}
      >
        <Text style={[styles.compactTitle, { color: theme.color.textMuted }]}>{title}</Text>
        {message ? (
          <Text style={[styles.compactMessage, { color: theme.color.textMuted }]}>{message}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="summary"
      role="summary"
      style={[
        styles.cardContainer,
        {
          backgroundColor: theme.color.surface,
          borderColor: theme.color.border,
          borderRadius: theme.radius.medium,
        },
        style,
      ]}
    >
      <Text style={[styles.cardTitle, { color: theme.color.text }]}>{title}</Text>
      {message ? (
        <Text style={[styles.cardMessage, { color: theme.color.textMuted }]}>{message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  cardMessage: {
    fontSize: 13,
    lineHeight: 19,
  },
  compactContainer: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  compactTitle: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  compactMessage: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
});
