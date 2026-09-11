import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/theme-provider";
import { typography } from "@/theme/typography";

export type SegmentOption<T extends string = string> = {
  value: T;
  label: string;
  badge?: number | string;
};

export type SegmentedControlProps<T extends string = string> = {
  options: readonly SegmentOption<T>[] | SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  vertical?: boolean;
  testID?: string;
};

export const SegmentedControl = memo(function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  vertical = false,
  testID = "segmented-control",
}: SegmentedControlProps<T>) {
  const { theme } = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      style={[
        styles.container,
        vertical ? styles.vertical : styles.horizontal,
        {
          backgroundColor: theme.color.surfaceRaised,
          borderColor: theme.color.border,
        },
      ]}
      testID={testID}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              isSelected ? [styles.optionSelected, { backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.borderStrong }] : null,
              { opacity: pressed ? 0.75 : 1 },
            ]}
            testID={`${testID}-${option.value}`}
          >
            <Text
              style={[
                styles.label,
                { color: isSelected ? theme.color.text : theme.color.textMuted },
                isSelected ? styles.labelSelected : null,
              ]}
            >
              {option.label}
            </Text>
            {option.badge !== undefined ? (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: isSelected ? theme.color.focus : theme.color.borderStrong,
                  },
                ]}
              >
                <Text style={styles.badgeText}>{option.badge}</Text>
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
    padding: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  horizontal: {
    flexDirection: "row",
    alignItems: "center",
  },
  vertical: {
    flexDirection: "column",
  },
  option: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    gap: 6,
    minHeight: 32,
  },
  optionSelected: {
    borderWidth: 1,
  },
  label: {
    ...typography.meta,
  },
  labelSelected: {
    fontWeight: "800",
  },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#ffffff",
    fontVariant: ["tabular-nums"],
  },
});
