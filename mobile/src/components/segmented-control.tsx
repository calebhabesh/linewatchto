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

import { useTheme } from "@/theme/theme-provider";
import type { ThemeMode, Theme } from "@/theme/tokens";

export type SegmentOptionTone =
  | "default"
  | "ttc"
  | "regional"
  | "affected"
  | "clear"
  | "filtered";

export type SegmentOption<T extends string = string> = {
  value: T;
  label: string;
  badge?: number | string;
  tone?: SegmentOptionTone;
  testID?: string;
};

export type SegmentedControlProps<T extends string = string> = {
  options: readonly SegmentOption<T>[] | SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  vertical?: boolean;
  compact?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

function resolveTone(option: SegmentOption): SegmentOptionTone {
  if (option.tone) return option.tone;
  const v = option.value.toLowerCase();
  if (v === "ttc") return "ttc";
  if (v === "regional" || v === "go" || v === "up") return "regional";
  if (v === "affected") return "affected";
  if (v === "clear") return "clear";
  if (v === "filtered") return "filtered";
  return "default";
}

function getToneColors(tone: SegmentOptionTone, theme: Theme, mode: ThemeMode) {
  if (mode === "high-contrast") {
    switch (tone) {
      case "ttc":
        return {
          gliderBg: "#000000",
          gliderBorder: "#ef4444",
          textActive: "#ffffff",
          badgeBg: "#ef4444",
          badgeText: "#000000",
        };
      case "regional":
        return {
          gliderBg: "#000000",
          gliderBorder: "#10b981",
          textActive: "#ffffff",
          badgeBg: "#10b981",
          badgeText: "#000000",
        };
      case "affected":
        return {
          gliderBg: "#000000",
          gliderBorder: "#f59e0b",
          textActive: "#f59e0b",
          badgeBg: "#f59e0b",
          badgeText: "#000000",
        };
      case "clear":
        return {
          gliderBg: "#000000",
          gliderBorder: "#10b981",
          textActive: "#10b981",
          badgeBg: "#10b981",
          badgeText: "#000000",
        };
      case "filtered":
        return {
          gliderBg: "#000000",
          gliderBorder: "#38bdf8",
          textActive: "#38bdf8",
          badgeBg: "#38bdf8",
          badgeText: "#000000",
        };
      default:
        return {
          gliderBg: "#000000",
          gliderBorder: "#ffffff",
          textActive: "#ffffff",
          badgeBg: "#ffffff",
          badgeText: "#000000",
        };
    }
  }

  if (mode === "light") {
    switch (tone) {
      case "ttc":
        return {
          gliderBg: "rgba(225, 29, 72, 0.12)",
          gliderBorder: "rgba(225, 29, 72, 0.35)",
          textActive: "#da291c",
          badgeBg: "#ef4444",
          badgeText: "#ffffff",
        };
      case "regional":
        return {
          gliderBg: "rgba(5, 150, 105, 0.12)",
          gliderBorder: "rgba(5, 150, 105, 0.35)",
          textActive: "#047857",
          badgeBg: "#10b981",
          badgeText: "#ffffff",
        };
      case "affected":
        return {
          gliderBg: "rgba(217, 119, 6, 0.12)",
          gliderBorder: "rgba(217, 119, 6, 0.35)",
          textActive: "#b45309",
          badgeBg: "#d97706",
          badgeText: "#ffffff",
        };
      case "clear":
        return {
          gliderBg: "rgba(5, 150, 105, 0.12)",
          gliderBorder: "rgba(5, 150, 105, 0.35)",
          textActive: "#047857",
          badgeBg: "#10b981",
          badgeText: "#ffffff",
        };
      case "filtered":
        return {
          gliderBg: "rgba(2, 132, 199, 0.12)",
          gliderBorder: "rgba(2, 132, 199, 0.35)",
          textActive: "#0284c7",
          badgeBg: "#0284c7",
          badgeText: "#ffffff",
        };
      default:
        return {
          gliderBg: "#ffffff",
          gliderBorder: "rgba(15, 23, 42, 0.08)",
          textActive: "#0f172a",
          badgeBg: theme.color.focus,
          badgeText: "#ffffff",
        };
    }
  }

  // Dark mode (default)
  switch (tone) {
    case "ttc":
      return {
        gliderBg: "rgba(244, 63, 94, 0.20)",
        gliderBorder: "rgba(244, 63, 94, 0.45)",
        textActive: "#fb7185",
        badgeBg: "#ef4444",
        badgeText: "#ffffff",
      };
    case "regional":
      return {
        gliderBg: "rgba(16, 185, 129, 0.20)",
        gliderBorder: "rgba(16, 185, 129, 0.45)",
        textActive: "#34d399",
        badgeBg: "#10b981",
        badgeText: "#ffffff",
      };
    case "affected":
      return {
        gliderBg: "rgba(245, 158, 11, 0.20)",
        gliderBorder: "rgba(245, 158, 11, 0.45)",
        textActive: "#f59e0b",
        badgeBg: "#f59e0b",
        badgeText: "#000000",
      };
    case "clear":
      return {
        gliderBg: "rgba(16, 185, 129, 0.20)",
        gliderBorder: "rgba(16, 185, 129, 0.45)",
        textActive: "#34d399",
        badgeBg: "#10b981",
        badgeText: "#ffffff",
      };
    case "filtered":
      return {
        gliderBg: "rgba(56, 189, 248, 0.20)",
        gliderBorder: "rgba(56, 189, 248, 0.45)",
        textActive: "#38bdf8",
        badgeBg: "#38bdf8",
        badgeText: "#000000",
      };
    default:
      return {
        gliderBg: "#1e293b",
        gliderBorder: "rgba(255, 255, 255, 0.10)",
        textActive: "#ffffff",
        badgeBg: theme.color.focus,
        badgeText: "#000000",
      };
  }
}

const CONTAINER_PADDING = 3;
const CONTAINER_GAP = 3;
const CONTAINER_RADIUS = 9;
const GLIDER_RADIUS = 6;
const OPTION_MIN_HEIGHT = 34;
const COMPACT_MIN_HEIGHT = 28;

export const SegmentedControl = memo(function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  vertical = false,
  compact = false,
  testID = "segmented-control",
  style,
}: SegmentedControlProps<T>) {
  const { theme, mode } = useTheme();

  const selectedIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value)
  );

  const selectedOption = options[selectedIndex] ?? options[0];
  const selectedTone = selectedOption ? resolveTone(selectedOption) : "default";
  const colors = getToneColors(selectedTone, theme, mode);

  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

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

  const onContainerLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== containerSize.width || height !== containerSize.height) {
      setContainerSize({ width, height });
    }
  };

  const optionCount = Math.max(1, options.length);
  const minHeight = compact ? COMPACT_MIN_HEIGHT : OPTION_MIN_HEIGHT;

  // Glider positioning calculations
  let gliderWidth = 0;
  let gliderHeight = 0;
  let translateX: Animated.AnimatedInterpolation<number> | number = 0;
  let translateY: Animated.AnimatedInterpolation<number> | number = 0;

  if (vertical) {
    const totalGap = (optionCount - 1) * CONTAINER_GAP;
    gliderHeight =
      containerSize.height > 0
        ? (containerSize.height - CONTAINER_PADDING * 2 - totalGap) / optionCount
        : minHeight;
    const stepY = gliderHeight + CONTAINER_GAP;
    translateY = animIndex.interpolate({
      inputRange: [0, Math.max(1, optionCount - 1)],
      outputRange: [0, stepY * Math.max(1, optionCount - 1)],
    });
  } else {
    const totalGap = (optionCount - 1) * CONTAINER_GAP;
    gliderWidth =
      containerSize.width > 0
        ? (containerSize.width - CONTAINER_PADDING * 2 - totalGap) / optionCount
        : 100;
    const stepX = gliderWidth + CONTAINER_GAP;
    translateX = animIndex.interpolate({
      inputRange: [0, Math.max(1, optionCount - 1)],
      outputRange: [0, stepX * Math.max(1, optionCount - 1)],
    });
  }

  // Container styling matching PWA .account-network-filter
  const containerBg =
    mode === "light"
      ? "rgba(241, 245, 249, 0.85)"
      : mode === "high-contrast"
        ? "#000000"
        : "rgba(15, 23, 42, 0.75)";

  const containerBorder =
    mode === "high-contrast"
      ? "#ffffff"
      : mode === "light"
        ? "rgba(148, 163, 184, 0.22)"
        : "rgba(255, 255, 255, 0.10)";

  return (
    <View
      accessibilityRole="radiogroup"
      onLayout={onContainerLayout}
      style={[
        styles.container,
        vertical ? styles.containerVertical : styles.containerHorizontal,
        {
          backgroundColor: containerBg,
          borderColor: containerBorder,
          borderWidth: mode === "high-contrast" ? 2 : 1,
        },
        style,
      ]}
      testID={testID}
    >
      {/* Glider */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glider,
          vertical ? styles.gliderVertical : styles.gliderHorizontal,
          {
            backgroundColor: colors.gliderBg,
            borderColor: colors.gliderBorder,
            borderWidth: mode === "high-contrast" ? 2 : 1,
            ...(vertical
              ? {
                  height: gliderHeight,
                  transform: [{ translateY }],
                }
              : {
                  width: gliderWidth,
                  transform: [{ translateX }],
                }),
          },
        ]}
      />

      {/* Buttons */}
      {options.map((option) => {
        const isSelected = option.value === value;
        const tone = resolveTone(option);
        const optionColors = isSelected ? colors : getToneColors(tone, theme, mode);

        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              compact ? styles.optionCompact : null,
              { opacity: pressed ? 0.75 : 1 },
            ]}
            testID={option.testID ?? `${testID}-${option.value}`}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                compact ? styles.labelCompact : null,
                {
                  color: isSelected ? optionColors.textActive : theme.color.textMuted,
                  fontWeight: isSelected ? "900" : "700",
                },
              ]}
            >
              {option.label}
            </Text>

            {option.badge !== undefined ? (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: isSelected
                      ? optionColors.badgeBg
                      : theme.color.borderStrong,
                  },
                ]}
                testID={`${testID}-${option.value}-badge`}
              >
                <Text
                  style={[
                    styles.badgeText,
                    {
                      color: isSelected ? optionColors.badgeText : theme.color.textMuted,
                    },
                  ]}
                >
                  {option.badge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}) as <T extends string = string>(props: SegmentedControlProps<T>) => React.JSX.Element;

const styles = StyleSheet.create({
  container: {
    padding: CONTAINER_PADDING,
    borderRadius: CONTAINER_RADIUS,
    position: "relative",
    overflow: "hidden",
  },
  containerHorizontal: {
    flexDirection: "row",
    alignItems: "center",
    gap: CONTAINER_GAP,
  },
  containerVertical: {
    flexDirection: "column",
    gap: CONTAINER_GAP,
  },
  glider: {
    position: "absolute",
    borderRadius: GLIDER_RADIUS,
    zIndex: 0,
    ...Platform.select({
      ios: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.14,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
      default: {},
    }),
  },
  gliderHorizontal: {
    top: CONTAINER_PADDING,
    bottom: CONTAINER_PADDING,
    left: CONTAINER_PADDING,
  },
  gliderVertical: {
    left: CONTAINER_PADDING,
    right: CONTAINER_PADDING,
    top: CONTAINER_PADDING,
  },
  option: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: OPTION_MIN_HEIGHT,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: GLIDER_RADIUS,
    gap: 6,
    zIndex: 1,
  },
  optionCompact: {
    minHeight: COMPACT_MIN_HEIGHT,
    paddingVertical: 4,
    paddingHorizontal: 6,
    gap: 4,
  },
  label: {
    fontSize: 12,
    letterSpacing: 0.2,
  },
  labelCompact: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
  badge: {
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
  },
});
