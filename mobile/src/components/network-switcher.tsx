import { Pressable, StyleSheet, Text, View } from "react-native";

import type { NetworkId } from "@/api/dashboard-schema";
import { useTheme } from "@/theme/theme-provider";

type Props = {
  value: NetworkId;
  onChange: (network: NetworkId) => void;
  vertical?: boolean;
};

const options: { id: NetworkId; label: string }[] = [
  { id: "ttc", label: "TTC" },
  { id: "regional", label: "GO & UP" },
];

export function NetworkSwitcher({ value, onChange, vertical = false }: Props) {
  const { theme } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.container,
        vertical && styles.containerVertical,
        {
          backgroundColor: theme.color.surfaceOverlay,
          borderColor: value === "ttc" ? "rgba(239, 68, 68, 0.72)" : "rgba(16, 185, 129, 0.72)",
        },
      ]}
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
              vertical && styles.optionVertical,
              selected && {
                backgroundColor: option.id === "ttc" ? "rgba(185, 28, 28, 0.82)" : "rgba(4, 120, 87, 0.82)",
                borderColor: option.id === "ttc" ? "#ef4444" : "#10b981",
              },
              pressed && styles.pressed,
            ]}
          >
            {vertical ? <View style={[styles.ridges, { backgroundColor: selected ? theme.color.text : theme.color.textQuiet }]} /> : null}
            <Text style={[styles.label, { color: selected ? theme.color.text : theme.color.textMuted }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    borderWidth: 2,
    borderRadius: 8,
    flexDirection: "row",
    padding: 3,
  },
  containerVertical: { flexDirection: "column", gap: 4, padding: 4, borderRadius: 12 },
  option: {
    minWidth: 76,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 5,
    paddingHorizontal: 14,
  },
  optionVertical: { minWidth: 62, minHeight: 48, paddingHorizontal: 8 },
  ridges: { width: 12, height: 2, borderRadius: 1, marginBottom: 5 },
  label: { fontSize: 13, fontWeight: "900", letterSpacing: 0.15 },
  pressed: { opacity: 0.72 },
});
