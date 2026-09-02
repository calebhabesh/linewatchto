import { memo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/theme-provider";
import { typography } from "@/theme/typography";
import { BackIcon, CloseIcon } from "./operations-icons";

export type OperationsSheetHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: ReactNode;
  showDragHandle?: boolean;
  onBack?: () => void;
  onClose?: () => void;
  rightAction?: ReactNode;
  testID?: string;
};

export const OperationsSheetHeader = memo(function OperationsSheetHeader({
  title,
  subtitle,
  eyebrow,
  icon,
  showDragHandle = true,
  onBack,
  onClose,
  rightAction,
  testID = "operations-sheet-header",
}: OperationsSheetHeaderProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { borderBottomColor: theme.color.border }]} testID={testID}>
      {showDragHandle ? (
        <View style={styles.dragHandleContainer}>
          <View style={[styles.dragHandle, { backgroundColor: theme.color.borderStrong }]} />
        </View>
      ) : null}

      <View style={styles.contentRow}>
        {onBack ? (
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [
              styles.navButton,
              {
                backgroundColor: theme.color.surfaceRaised,
                borderColor: theme.color.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            testID="sheet-header-back"
          >
            <BackIcon color={theme.color.text} size={16} />
          </Pressable>
        ) : null}

        {icon ? <View style={styles.iconContainer}>{icon}</View> : null}

        <View style={styles.titleColumn}>
          {eyebrow ? (
            <Text style={[styles.eyebrow, { color: theme.color.focus }]}>{eyebrow}</Text>
          ) : null}
          <Text numberOfLines={1} style={[styles.title, { color: theme.color.text }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={[styles.subtitle, { color: theme.color.textQuiet }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {rightAction ? <View style={styles.rightSlot}>{rightAction}</View> : null}

        {onClose ? (
          <Pressable
            accessibilityLabel="Close sheet"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.navButton,
              {
                backgroundColor: theme.color.surfaceRaised,
                borderColor: theme.color.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            testID="sheet-header-close"
          >
            <CloseIcon color={theme.color.text} size={16} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  dragHandleContainer: {
    alignItems: "center",
    marginBottom: 6,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  iconContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  titleColumn: {
    flex: 1,
    justifyContent: "center",
  },
  eyebrow: {
    ...typography.meta,
    marginBottom: 1,
  },
  title: {
    ...typography.sheetTitle,
  },
  subtitle: {
    ...typography.meta,
    marginTop: 1,
  },
  rightSlot: {
    marginLeft: "auto",
  },
});
