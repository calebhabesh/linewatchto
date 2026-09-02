import { memo, useEffect, type ReactNode } from "react";
import {
  BackHandler,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SHELL_ELEVATION, SHELL_LAYOUT, SHELL_Z_INDEX } from "@/features/shell/shell-layout";
import { useTheme } from "@/theme/theme-provider";

export type SheetVariant = "primary" | "detail" | "tool" | "modal";

export type OperationsSheetProps = {
  children: ReactNode;
  variant?: SheetVariant;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  bottomOffset?: number;
  onDismiss?: () => void;
};

export const OperationsSheet = memo(function OperationsSheet({
  children,
  variant = "primary",
  style,
  testID = "operations-sheet",
  bottomOffset,
  onDismiss,
}: OperationsSheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  // Android hardware back support across all variants
  useEffect(() => {
    if (!onDismiss) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onDismiss();
      return true;
    });
    return () => subscription.remove();
  }, [onDismiss]);

  const computedBottomOffset =
    bottomOffset !== undefined
      ? bottomOffset
      : variant === "modal"
        ? Math.max(16, insets.bottom)
        : variant === "tool"
          ? Math.max(16, insets.bottom)
          : Math.max(84, insets.bottom + 76);

  const isModal = variant === "modal";
  const isTool = variant === "tool";
  const isDetail = variant === "detail";

  const sheetZIndex = isModal
    ? SHELL_Z_INDEX.modal
    : isTool
      ? SHELL_Z_INDEX.sheets + 2
      : SHELL_Z_INDEX.sheets;

  const sheetElevation = isModal
    ? SHELL_ELEVATION.modal
    : isTool
      ? SHELL_ELEVATION.sheets + 2
      : SHELL_ELEVATION.sheets;

  return (
    <View pointerEvents="box-none" style={styles.sheetContainer}>
      {onDismiss ? (
        <Pressable
          accessibilityLabel="Dismiss sheet"
          accessibilityRole="button"
          onPress={onDismiss}
          style={[
            styles.backdrop,
            isModal
              ? styles.modalBackdrop
              : isTool
                ? styles.toolBackdrop
                : styles.transparentBackdrop,
            { zIndex: sheetZIndex - 1 },
          ]}
          testID={`${testID}-backdrop`}
        />
      ) : null}
      <View
        style={[
          styles.base,
          isModal
            ? styles.modal
            : isTool
              ? styles.tool
              : isDetail
                ? styles.detail
                : styles.primary,
          {
            backgroundColor: theme.color.surfaceOverlay,
            borderColor: theme.color.border,
            bottom: isModal ? undefined : computedBottomOffset,
            top: isModal ? Math.max(16, insets.top + 10) : undefined,
            zIndex: sheetZIndex,
            elevation: sheetElevation,
          },
          style,
        ]}
        testID={testID}
      >
        {children}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  sheetContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  transparentBackdrop: {
    backgroundColor: "transparent",
  },
  toolBackdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.40)",
  },
  modalBackdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.70)",
  },
  base: {
    position: "absolute",
    left: SHELL_LAYOUT.sheetHorizontalInset,
    right: SHELL_LAYOUT.sheetHorizontalInset,
    borderRadius: SHELL_LAYOUT.sheetCornerRadius,
    borderWidth: SHELL_LAYOUT.sheetBorderWidth,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
  },
  primary: {
    maxHeight: "78%",
    minHeight: 180,
  },
  detail: {
    height: `${SHELL_LAYOUT.detailSheetInitialHeightPercent * 100}%`,
    maxHeight: "78%",
    minHeight: 220,
  },
  tool: {
    maxHeight: `${SHELL_LAYOUT.toolSheetMaxHeightPercent * 100}%`,
    minHeight: 280,
  },
  modal: {
    top: 24,
    bottom: 24,
  },
});
