import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { useTheme } from "@/theme/theme-provider";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  hint?: string;
  onRetry?: () => void;
  tone?: "delay" | "suspension";
  style?: ViewStyle;
}

export function ErrorState({
  title = "Service data unavailable",
  message = "The LineWatchTO API could not be reached.",
  hint = "Pull down to retry. Mobile release builds do not substitute demo fixtures.",
  onRetry,
  tone = "delay",
  style,
}: ErrorStateProps) {
  const { theme } = useTheme();
  const borderColor = tone === "suspension" ? theme.line.suspension : theme.line.delay;

  return (
    <View
      accessible
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      role="alert"
      style={[
        styles.container,
        {
          backgroundColor: theme.color.surface,
          borderColor,
          borderRadius: theme.radius.medium,
        },
        style,
      ]}
    >
      <Text accessibilityRole="header" style={[styles.title, { color: theme.color.text }]}>
        {title}
      </Text>
      {message ? (
        <Text style={[styles.message, { color: theme.color.textMuted }]}>
          {message}
        </Text>
      ) : null}
      {hint ? (
        <Text style={[styles.hint, { color: theme.color.textMuted }]}>
          {hint}
        </Text>
      ) : null}
      {onRetry ? (
        <Pressable
          accessibilityLabel="Retry request"
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [
            styles.retryButton,
            {
              backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.background,
              borderColor: theme.color.border,
              borderRadius: theme.radius.small,
            },
          ]}
        >
          <Text style={[styles.retryText, { color: theme.color.focus }]}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 160,
    borderWidth: 1,
    padding: 18,
    justifyContent: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
  },
  retryButton: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
