import { memo, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/theme/theme-provider";

export type SheetVariant = "primary" | "detail" | "tool" | "modal";

export type OperationsSheetProps = {
  children: ReactNode;
  variant?: SheetVariant;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  bottomOffset?: number;
};

export const OperationsSheet = memo(function OperationsSheet({
  children,
  variant = "primary",
  style,
  testID = "operations-sheet",
  bottomOffset,
}: OperationsSheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const computedBottomOffset =
    bottomOffset !== undefined
      ? bottomOffset
      : variant === "modal"
        ? Math.max(16, insets.bottom)
        : Math.max(84, insets.bottom + 76);

  return (
    <View
      style={[
        styles.base,
        variant === "modal" ? styles.modal : styles.floating,
        {
          backgroundColor: theme.color.surfaceOverlay,
          borderColor: theme.color.border,
          bottom: variant === "modal" ? undefined : computedBottomOffset,
          top: variant === "modal" ? Math.max(16, insets.top + 10) : undefined,
        },
        style,
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  base: {
    position: "absolute",
    left: 8,
    right: 8,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    elevation: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
  },
  floating: {
    maxHeight: "82%",
    minHeight: 180,
  },
  modal: {
    top: 24,
    bottom: 24,
    zIndex: 100,
  },
});
