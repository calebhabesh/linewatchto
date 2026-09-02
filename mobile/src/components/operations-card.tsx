import { memo, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/theme/theme-provider";

export type OperationsCardProps = {
  children: ReactNode;
  accentRailColor?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  selected?: boolean;
};

export const OperationsCard = memo(function OperationsCard({
  children,
  accentRailColor,
  onPress,
  style,
  testID = "operations-card",
  selected = false,
}: OperationsCardProps) {
  const { theme } = useTheme();

  const content = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.color.surfaceRaised,
          borderColor: selected ? theme.color.focus : theme.color.border,
        },
        accentRailColor ? styles.cardWithRail : null,
        style,
      ]}
      testID={testID}
    >
      {accentRailColor ? (
        <View style={[styles.accentRail, { backgroundColor: accentRailColor }]} />
      ) : null}
      <View style={styles.inner}>{children}</View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  cardWithRail: {
    paddingLeft: 4,
  },
  accentRail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  inner: {
    padding: 10,
    gap: 6,
  },
});
