import { memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/theme-provider";
import { typography } from "@/theme/typography";

export type OperationsSectionHeadingProps = {
  title: string;
  count?: number;
  rightAction?: ReactNode;
  accentColor?: string;
  testID?: string;
};

export const OperationsSectionHeading = memo(function OperationsSectionHeading({
  title,
  count,
  rightAction,
  accentColor,
  testID = "operations-section-heading",
}: OperationsSectionHeadingProps) {
  const { theme } = useTheme();
  const railColor = accentColor ?? theme.color.focus;

  return (
    <View style={styles.container} testID={testID}>
      <View style={[styles.rail, { backgroundColor: railColor }]} />
      <Text style={[styles.title, { color: theme.color.textMuted }]}>{title}</Text>
      {count !== undefined ? (
        <View style={[styles.countBadge, { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.border }]}>
          <Text style={[styles.countText, { color: theme.color.text }]}>{count}</Text>
        </View>
      ) : null}
      {rightAction ? <View style={styles.rightAction}>{rightAction}</View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginVertical: 4,
  },
  rail: {
    width: 3,
    height: 12,
    borderRadius: 1.5,
  },
  title: {
    ...typography.sectionTitle,
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: 1,
  },
  countText: {
    ...typography.meta,
  },
  rightAction: {
    marginLeft: "auto",
  },
});
