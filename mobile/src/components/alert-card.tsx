import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/theme-provider";

type Props = {
  lineNumber: string;
  lineColor: string;
  title: string;
  location: string;
  source: string;
  tone: "suspension" | "delay" | "planned";
  onPress?: () => void;
};

export function AlertCard({ lineNumber, lineColor, title, location, source, tone, onPress }: Props) {
  const { theme } = useTheme();

  const content = (
    <>
      <View style={styles.heading}>
        <View style={[styles.lineBadge, { backgroundColor: lineColor }]}>
          <Text style={styles.lineBadgeText}>{lineNumber}</Text>
        </View>
        <View style={[styles.tone, { backgroundColor: theme.line[tone] }]} />
        <Text style={[styles.title, { color: theme.color.text }]}>{title}</Text>
        {onPress ? <Text style={[styles.chevron, { color: theme.color.textMuted }]}>›</Text> : null}
      </View>
      <Text style={[styles.location, { color: theme.color.textMuted }]}>{location}</Text>
      <Text style={[styles.source, { color: theme.color.textMuted }]}>Source: {source}</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, Line ${lineNumber}, ${location}`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surface,
            borderColor: theme.color.border,
          },
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 6, padding: 12, gap: 7 },
  heading: { flexDirection: "row", alignItems: "center", gap: 8 },
  lineBadge: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 7,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  lineBadgeText: { color: "#090909", fontSize: 12, fontWeight: "900" },
  tone: { width: 4, alignSelf: "stretch", borderRadius: 2 },
  title: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: "800" },
  chevron: { fontSize: 18, fontWeight: "600", paddingLeft: 4 },
  location: { fontSize: 13, lineHeight: 18 },
  source: { fontSize: 11 },
});
