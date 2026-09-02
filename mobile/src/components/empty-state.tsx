import type { ReactNode } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { useTheme } from "@/theme/theme-provider";

export interface EmptyStateProps {
  title: string;
  message?: string;
  compact?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
}

export function EmptyState({
  title,
  message,
  compact = false,
  icon,
  style,
}: EmptyStateProps) {
  const { theme, mode } = useTheme();

  const titleColor = mode === "high-contrast" ? "#ffffff" : theme.color.text;
  const messageColor = mode === "high-contrast" ? "#ffffff" : theme.color.textMuted;

  if (compact) {
    return (
      <View
        accessible
        accessibilityRole="summary"
        role="summary"
        style={[styles.compactContainer, style]}
        testID="empty-state"
      >
        {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
        <Text style={[styles.compactTitle, { color: titleColor }]}>{title}</Text>
        {message ? (
          <Text style={[styles.compactMessage, { color: messageColor }]}>
            {message}
          </Text>
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
          backgroundColor:
            mode === "high-contrast" ? "#000000" : theme.color.surface,
          borderColor:
            mode === "high-contrast" ? "#ffffff" : theme.color.border,
          borderRadius: theme.radius.medium,
          borderWidth: mode === "high-contrast" ? 2 : 1,
        },
        style,
      ]}
      testID="empty-state"
    >
      {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
      <Text style={[styles.cardTitle, { color: titleColor }]}>{title}</Text>
      {message ? (
        <Text style={[styles.cardMessage, { color: messageColor }]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    padding: 16,
    gap: 6,
  },
  iconContainer: {
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
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
    fontWeight: "600",
    textAlign: "center",
  },
  compactMessage: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
});
