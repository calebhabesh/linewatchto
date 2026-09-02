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
  backTestID?: string;
  closeTestID?: string;
  rightAction?: ReactNode;
  children?: ReactNode;
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
  backTestID,
  closeTestID,
  rightAction,
  children,
  testID = "operations-sheet-header",
}: OperationsSheetHeaderProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { borderBottomColor: theme.color.border }]} testID={testID}>
      {showDragHandle ? (
        <View style={styles.dragHandleContainer} testID={`${testID}-drag-handle`}>
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
                backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surfaceOverlay,
                borderColor: theme.color.border,
              },
            ]}
            testID={backTestID ?? (testID !== "operations-sheet-header" ? `${testID}-back` : "sheet-header-back")}
          >
            <BackIcon color={theme.color.text} size={16} />
          </Pressable>
        ) : null}

        {icon ? <View style={styles.iconContainer}>{icon}</View> : null}

        <View style={styles.titleColumn}>
          {eyebrow ? (
            <Text
              numberOfLines={1}
              style={[styles.eyebrow, { color: theme.color.focus }]}
              testID={`${testID}-eyebrow`}
            >
              {eyebrow}
            </Text>
          ) : null}
          <Text
            numberOfLines={1}
            style={[styles.title, { color: theme.color.text }]}
            testID={`${testID}-title`}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              numberOfLines={1}
              style={[styles.subtitle, { color: theme.color.textQuiet }]}
              testID={`${testID}-subtitle`}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {rightAction ? (
          <View style={styles.rightSlot} testID={`${testID}-right-action`}>
            {rightAction}
          </View>
        ) : null}

        {onClose ? (
          <Pressable
            accessibilityLabel="Close sheet"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.navButton,
              {
                backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surfaceOverlay,
                borderColor: theme.color.border,
              },
            ]}
            testID={closeTestID ?? (testID !== "operations-sheet-header" ? `${testID}-close` : "sheet-header-close")}
          >
            <CloseIcon color={theme.color.text} size={16} />
          </Pressable>
        ) : null}
      </View>

      {children ? <View style={styles.bottomSlot}>{children}</View> : null}
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
    minWidth: 0,
  },
  eyebrow: {
    ...typography.meta,
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "800",
  },
  title: {
    ...typography.sheetTitle,
    fontWeight: "900",
    fontSize: 18,
    lineHeight: 22,
  },
  subtitle: {
    ...typography.meta,
    marginTop: 2,
  },
  rightSlot: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bottomSlot: {
    marginTop: 8,
  },
});
