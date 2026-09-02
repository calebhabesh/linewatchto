import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/screen";
import { useTheme } from "@/theme/theme-provider";

const foundations = [
  "Expo Router with generated native projects",
  "Runtime-validated Spring dashboard contract",
  "Foreground-only polling and persisted query cache",
  "Secure native session-token storage seam",
  "Dark and high-contrast design tokens",
];

export function MoreScreen() {
  const { mode, setMode, theme } = useTheme();
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.color.text }]}>More</Text>
        <View style={[styles.section, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.color.text }]}>Display</Text>
          <Text style={[styles.copy, { color: theme.color.textMuted }]}>High contrast increases borders and foreground separation across the app.</Text>
          <View style={styles.row}>
            {(["dark", "high-contrast"] as const).map((option) => {
              const selected = mode === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setMode(option)}
                  style={[
                    styles.choice,
                    { borderColor: selected ? theme.color.focus : theme.color.border },
                    selected && { backgroundColor: theme.color.surfaceRaised },
                  ]}
                >
                  <Text style={[styles.choiceLabel, { color: theme.color.text }]}>{option === "dark" ? "Dark" : "High contrast"}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.color.text }]}>Prototype foundation</Text>
          {foundations.map((item) => (
            <View key={item} style={styles.foundationRow}>
              <Text style={[styles.check, { color: theme.line.normal }]}>✓</Text>
              <Text style={[styles.copy, { color: theme.color.textMuted }]}>{item}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.disclaimer, { color: theme.color.textMuted }]}>LineWatchTO is unofficial and is not affiliated with TTC or Metrolinx.</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 36, gap: 12 },
  title: { fontSize: 26, fontWeight: "900" },
  section: { borderWidth: 1, borderRadius: 6, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: "800" },
  copy: { flex: 1, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: "row", gap: 8 },
  choice: { minHeight: 44, flex: 1, borderWidth: 1, borderRadius: 6, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  choiceLabel: { fontSize: 13, fontWeight: "700" },
  foundationRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  check: { fontSize: 15, fontWeight: "900" },
  disclaimer: { fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 8 },
});
