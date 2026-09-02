import { memo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/theme-provider";
import { typography } from "@/theme/typography";
import { ChevronRightIcon } from "./operations-icons";

export type OperationsRowProps = {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
  testID?: string;
};

export const OperationsRow = memo(function OperationsRow({
  icon,
  title,
  subtitle,
  right,
  showChevron = false,
  onPress,
  testID = "operations-row",
}: OperationsRowProps) {
  const { theme } = useTheme();

  const content = (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.color.surfaceRaised,
          borderColor: theme.color.border,
        },
      ]}
      testID={testID}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <View style={styles.content}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.color.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.subtitle, { color: theme.color.textMuted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
      {showChevron ? (
        <View style={styles.chevron}>
          <ChevronRightIcon color={theme.color.textQuiet} size={16} />
        </View>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    minHeight: 46,
  },
  icon: {
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    ...typography.bodyBold,
  },
  subtitle: {
    ...typography.meta,
    marginTop: 1,
  },
  right: {
    alignItems: "flex-end",
    justifyContent: "center",
  },
  chevron: {
    marginLeft: 2,
    justifyContent: "center",
    alignItems: "center",
  },
});
