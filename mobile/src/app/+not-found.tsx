import { Link } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { Screen } from "@/components/screen";
import { useTheme } from "@/theme/theme-provider";

export default function NotFoundScreen() {
  const { theme } = useTheme();
  return (
    <Screen style={styles.screen}>
      <Text style={[styles.title, { color: theme.color.text }]}>This screen is not built yet.</Text>
      <Link href="/" style={[styles.link, { color: theme.color.focus }]}>Return to the map</Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { alignItems: "center", justifyContent: "center", gap: 12, padding: 20 },
  title: { fontSize: 18, fontWeight: "800" },
  link: { fontSize: 15, fontWeight: "700" },
});
