import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { AlertFilter, FilterOption } from "@/features/alerts/impact-types";
import { useTheme } from "@/theme/theme-provider";

interface AlertFilterBarProps {
  filters: FilterOption[];
  activeFilter: AlertFilter;
  onSelectFilter: (filter: AlertFilter) => void;
}

export function AlertFilterBar({ filters, activeFilter, onSelectFilter }: AlertFilterBarProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        accessibilityRole="tablist"
      >
        {filters.map((filter) => {
          const isSelected = activeFilter === filter.key;
          return (
            <Pressable
              key={filter.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${filter.label} (${filter.count})`}
              onPress={() => onSelectFilter(filter.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: isSelected ? theme.color.surfaceRaised : theme.color.surface,
                  borderColor: isSelected ? theme.color.focus : theme.color.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.label,
                  {
                    color: isSelected ? theme.color.text : theme.color.textMuted,
                    fontWeight: isSelected ? "800" : "600",
                  },
                ]}
              >
                {filter.label}
              </Text>
              <View
                style={[
                  styles.countBadge,
                  {
                    backgroundColor: isSelected ? theme.color.focus : theme.color.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.countText,
                    {
                      color: isSelected ? "#090909" : theme.color.textMuted,
                    },
                  ]}
                >
                  {filter.count}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  scrollContent: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  label: {
    fontSize: 13,
  },
  countBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  countText: {
    fontSize: 10,
    fontWeight: "800",
  },
});
