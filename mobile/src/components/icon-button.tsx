import { memo, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/theme/theme-provider";

export type IconButtonProps = {
  icon: ReactNode;
  accessibilityLabel: string;
  onPress: () => void;
  active?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export const IconButton = memo(function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  active = false,
  size = 36,
  style,
  testID = "icon-button",
}: IconButtonProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: active
            ? `${theme.line.normal}26`
            : pressed
              ? theme.color.surfaceRaised
              : theme.color.surfaceOverlay,
          borderColor: active ? theme.line.normal : theme.color.border,
          opacity: pressed ? 0.75 : 1,
        },
        style,
      ]}
      testID={testID}
    >
      {icon}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  button: {
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
});
