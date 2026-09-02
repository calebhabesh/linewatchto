import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { AlertTriangleIcon } from "@/components/operations-icons";
import { useTheme } from "@/theme/theme-provider";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  hint?: string;
  onRetry?: () => void;
  tone?: "delay" | "suspension" | "planned";
  showAccentStrip?: boolean;
  style?: ViewStyle;
}

const TRANSIT_COLORS = ["#eab308", "#16a34a", "#9333ea", "#f97316", "#64748b"];

export function ErrorState({
  title = "Service data unavailable",
  message = "The LineWatchTO API could not be reached.",
  hint = "Pull down to retry. Mobile release builds do not substitute demo fixtures.",
  onRetry,
  tone = "delay",
  showAccentStrip = false,
  style,
}: ErrorStateProps) {
  const { theme, mode } = useTheme();

  const borderColor =
    mode === "high-contrast"
      ? "#ffffff"
      : tone === "suspension"
        ? theme.line.suspension
        : tone === "planned"
          ? theme.line.planned
          : theme.line.delay;

  const iconColor =
    mode === "high-contrast"
      ? "#ffffff"
      : tone === "suspension"
        ? theme.line.suspension
        : tone === "planned"
          ? theme.line.planned
          : theme.line.delay;

  return (
    <View
      accessible
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      role="alert"
      style={[
        styles.container,
        {
          backgroundColor: mode === "high-contrast" ? "#000000" : theme.color.surface,
          borderColor,
          borderRadius: theme.radius.medium,
          borderWidth: mode === "high-contrast" ? 2 : 1,
        },
        style,
      ]}
      testID="error-state"
    >
      {showAccentStrip ? (
        <View style={styles.accentStrip}>
          {TRANSIT_COLORS.map((c, i) => (
            <View key={i} style={[styles.accentBlock, { backgroundColor: c }]} />
          ))}
        </View>
      ) : null}

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <AlertTriangleIcon color={iconColor} size={20} />
          <Text
            accessibilityRole="header"
            style={[
              styles.title,
              { color: mode === "high-contrast" ? "#ffffff" : theme.color.text },
            ]}
          >
            {title}
          </Text>
        </View>

        {message ? (
          <Text
            style={[
              styles.message,
              { color: mode === "high-contrast" ? "#ffffff" : theme.color.textMuted },
            ]}
          >
            {message}
          </Text>
        ) : null}

        {hint ? (
          <Text
            style={[
              styles.hint,
              { color: mode === "high-contrast" ? "#ffffff" : theme.color.textQuiet },
            ]}
          >
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
                backgroundColor:
                  mode === "high-contrast"
                    ? pressed
                      ? "#ffffff"
                      : "#000000"
                    : pressed
                      ? theme.color.surfaceRaised
                      : theme.color.surfacePanel,
                borderColor:
                  mode === "high-contrast" ? "#ffffff" : theme.color.borderStrong,
                borderRadius: theme.radius.small,
              },
            ]}
          >
            <Text
              style={[
                styles.retryText,
                {
                  color:
                    mode === "high-contrast"
                      ? "#ffffff"
                      : theme.color.focus,
                },
              ]}
            >
              Retry
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 150,
    overflow: "hidden",
  },
  accentStrip: {
    flexDirection: "row",
    height: 4,
    width: "100%",
  },
  accentBlock: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 8,
    justifyContent: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    flex: 1,
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
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
