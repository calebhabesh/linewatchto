import { Pressable, StyleSheet, Text, View } from "react-native";

import type { NetworkId } from "@/api/dashboard-schema";
import { useTheme } from "@/theme/theme-provider";

type Props = {
  value: NetworkId;
  onChange: (network: NetworkId) => void;
};

const options: { id: NetworkId; label: string }[] = [
  { id: "ttc", label: "TTC" },
  { id: "regional", label: "GO & UP" },
];

export function NetworkSwitcher({ value, onChange }: Props) {
  const { theme } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.container, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.id)}
            testID={`network-${option.id}`}
            style={({ pressed }) => [
              styles.option,
              selected && { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.focus },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.label, { color: selected ? theme.color.text : theme.color.textMuted }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: "row",
    padding: 3,
  },
  option: {
    minWidth: 76,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 5,
    paddingHorizontal: 14,
  },
  label: { fontSize: 14, fontWeight: "700" },
  pressed: { opacity: 0.72 },
});
