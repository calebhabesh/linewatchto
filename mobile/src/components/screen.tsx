import type { PropsWithChildren } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/theme/theme-provider";

type Props = PropsWithChildren<{
  style?: ViewStyle;
  includeBottomInset?: boolean;
  transparent?: boolean;
}>;

export function Screen({
  children,
  style,
  includeBottomInset = false,
  transparent = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: transparent ? "transparent" : theme.color.background,
          paddingTop: insets.top,
          paddingBottom: includeBottomInset ? insets.bottom : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
