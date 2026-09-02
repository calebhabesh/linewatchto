import { memo, useEffect, useRef, useState } from "react";
import {
  Animated,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

import type { NetworkId } from "@/api/dashboard-schema";
import { useTheme } from "@/theme/theme-provider";

export type NetworkSwitcherProps = {
  value: NetworkId;
  onChange: (network: NetworkId) => void;
  vertical?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

type SwitcherOption = {
  id: NetworkId;
  label: string;
  shortLabel: string;
};

const OPTIONS: SwitcherOption[] = [
  { id: "ttc", label: "TTC", shortLabel: "TTC" },
  { id: "regional", label: "GO & UP", shortLabel: "GO/UP" },
];

export const NetworkSwitcher = memo(function NetworkSwitcher({
  value,
  onChange,
  vertical = false,
  testID = "network-switcher",
  style,
}: NetworkSwitcherProps) {
  const { theme, mode } = useTheme();

  const selectedIndex = value === "regional" ? 1 : 0;
  const animIndex = useRef(new Animated.Value(selectedIndex)).current;
  const prevIndexRef = useRef(selectedIndex);

  useEffect(() => {
    if (prevIndexRef.current === selectedIndex) return;
    prevIndexRef.current = selectedIndex;

    if (process.env.NODE_ENV === "test") {
      return;
    }
    Animated.spring(animIndex, {
      toValue: selectedIndex,
      useNativeDriver: true,
      tension: 280,
      friction: 26,
    }).start();
  }, [selectedIndex, animIndex]);

  const [containerWidth, setContainerWidth] = useState(0);

  const onContainerLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== containerWidth) {
      setContainerWidth(w);
    }
  };

  const isTtc = value === "ttc";

  // Outline/frame color matching PWA
  let frameBorderColor: string;
  let gliderBg: string;
  let gliderBorder: string;

  if (mode === "high-contrast") {
    frameBorderColor = isTtc ? "#ef4444" : "#10b981";
    gliderBg = isTtc ? "#ef4444" : "#10b981";
    gliderBorder = "#ffffff";
  } else if (mode === "light") {
    frameBorderColor = vertical
      ? isTtc
        ? "rgba(239, 68, 68, 0.65)"
        : "rgba(16, 185, 129, 0.65)"
      : isTtc
        ? "rgba(239, 68, 68, 0.40)"
        : "rgba(16, 185, 129, 0.40)";
    gliderBg = isTtc ? "#dc2626" : "#059669";
    gliderBorder = "rgba(255, 255, 255, 0.35)";
  } else {
    // Dark mode (default)
    frameBorderColor = vertical
      ? isTtc
        ? "rgba(239, 68, 68, 0.65)"
        : "rgba(16, 185, 129, 0.65)"
      : isTtc
        ? "rgba(239, 68, 68, 0.35)"
        : "rgba(16, 185, 129, 0.35)";
    gliderBg = isTtc ? "#dc2626" : "#059669";
    gliderBorder = "rgba(255, 255, 255, 0.22)";
  }

  // Vertical mode dimensions: 44 width, 75 height, 33 button height, 2 gap, 3 padding
  if (vertical) {
    const gliderStepY = 33 + 2;
    const translateY = animIndex.interpolate({
      inputRange: [0, 1],
      outputRange: [0, gliderStepY],
    });

    return (
      <View
        accessibilityRole="tablist"
        aria-label="Select transit network"
        style={[
          styles.containerVertical,
          {
            backgroundColor:
              mode === "light"
                ? "rgba(255, 255, 255, 0.94)"
                : mode === "high-contrast"
                  ? "#000000"
                  : "rgba(10, 14, 23, 0.88)",
            borderColor: frameBorderColor,
            borderWidth: mode === "high-contrast" ? 2 : 2,
          },
          style,
        ]}
        testID={testID}
      >
        {/* Animated Glider */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.gliderVertical,
            {
              backgroundColor: gliderBg,
              borderColor: gliderBorder,
              transform: [{ translateY }],
            },
          ]}
        />

        {OPTIONS.map((option) => {
          const selected = option.id === value;

          return (
            <Pressable
              key={option.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.id)}
              style={({ pressed }) => [
                styles.optionVertical,
                { opacity: pressed ? 0.8 : 1 },
              ]}
              testID={`network-${option.id}`}
            >
              {/* Ridges on top */}
              <View style={styles.verticalRidgesContainer}>
                <View
                  style={[
                    styles.verticalRidgeLine,
                    {
                      backgroundColor: selected
                        ? "#ffffff"
                        : theme.color.textQuiet,
                      opacity: selected ? 0.95 : 0.25,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.verticalRidgeLine,
                    {
                      backgroundColor: selected
                        ? "#ffffff"
                        : theme.color.textQuiet,
                      opacity: selected ? 0.95 : 0.25,
                    },
                  ]}
                />
              </View>

              {/* Button text */}
              <Text
                style={[
                  styles.labelVertical,
                  {
                    color: selected ? "#ffffff" : theme.color.textMuted,
                  },
                ]}
              >
                {option.shortLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  // Horizontal mode (default)
  const optionWidth =
    containerWidth > 0 ? (containerWidth - 6 - 4) / 2 : 104;
  const gliderStepX = optionWidth + 4;
  const translateX = animIndex.interpolate({
    inputRange: [0, 1],
    outputRange: [0, gliderStepX],
  });

  return (
    <View
      accessibilityRole="tablist"
      aria-label="Select transit network"
      onLayout={onContainerLayout}
      style={[
        styles.containerHorizontal,
        {
          backgroundColor:
            mode === "light"
              ? "rgba(241, 245, 249, 0.85)"
              : mode === "high-contrast"
                ? "#000000"
                : "rgba(10, 14, 23, 0.88)",
          borderColor: frameBorderColor,
          borderWidth: mode === "high-contrast" ? 2 : 1.5,
        },
        style,
      ]}
      testID={testID}
    >
      {/* Animated Glider */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.gliderHorizontal,
          {
            width: optionWidth,
            backgroundColor: gliderBg,
            borderColor: gliderBorder,
            transform: [{ translateX }],
          },
        ]}
      />

      {OPTIONS.map((option) => {
        const selected = option.id === value;
        const isTtcOption = option.id === "ttc";

        return (
          <Pressable
            key={option.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.id)}
            style={({ pressed }) => [
              styles.optionHorizontal,
              { opacity: pressed ? 0.8 : 1 },
            ]}
            testID={`network-${option.id}`}
          >
            {/* Indicator Dot */}
            <View
              style={[
                styles.horizontalIndicatorDot,
                {
                  backgroundColor: selected
                    ? "#ffffff"
                    : isTtcOption
                      ? "#ef4444"
                      : "#10b981",
                  opacity: selected ? 1 : 0.65,
                },
                selected ? styles.dotGlow : null,
              ]}
            />

            {/* Label */}
            <Text
              style={[
                styles.labelHorizontal,
                {
                  color: selected ? "#ffffff" : theme.color.textMuted,
                },
              ]}
            >
              {option.label}
            </Text>

            {/* Right accent ridges */}
            <View
              style={[
                styles.horizontalRidgesContainer,
                { opacity: selected ? 0.85 : 0 },
              ]}
            >
              <View style={styles.horizontalRidgeLine} />
              <View style={styles.horizontalRidgeLine} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  // Compact Vertical Styles
  containerVertical: {
    width: 44,
    height: 75,
    borderRadius: 10,
    padding: 3,
    gap: 2,
    position: "relative",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "space-between",
    ...Platform.select({
      ios: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  gliderVertical: {
    position: "absolute",
    left: 3,
    right: 3,
    top: 3,
    height: 33,
    borderRadius: 7,
    borderWidth: 1,
    zIndex: 0,
    ...Platform.select({
      ios: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  optionVertical: {
    width: "100%",
    height: 33,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
    borderRadius: 7,
    gap: 2,
  },
  verticalRidgesContainer: {
    flexDirection: "column",
    gap: 1.5,
    alignItems: "center",
  },
  verticalRidgeLine: {
    width: 8,
    height: 1.5,
    borderRadius: 1,
  },
  labelVertical: {
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  // Horizontal Styles
  containerHorizontal: {
    flexDirection: "row",
    alignItems: "center",
    padding: 3,
    gap: 4,
    borderRadius: 12,
    position: "relative",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  gliderHorizontal: {
    position: "absolute",
    left: 3,
    top: 3,
    bottom: 3,
    borderRadius: 8,
    borderWidth: 1,
    zIndex: 0,
    ...Platform.select({
      ios: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  optionHorizontal: {
    flex: 1,
    minHeight: 34,
    minWidth: 96,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderRadius: 8,
    zIndex: 1,
  },
  horizontalIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotGlow: {
    ...Platform.select({
      ios: {
        shadowColor: "#ffffff",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      default: {},
    }),
  },
  labelHorizontal: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  horizontalRidgesContainer: {
    flexDirection: "row",
    gap: 1.5,
    alignItems: "center",
  },
  horizontalRidgeLine: {
    width: 1.5,
    height: 10,
    borderRadius: 0.5,
    backgroundColor: "#ffffff",
  },
});

