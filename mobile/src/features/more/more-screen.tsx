import { router } from "expo-router";
import { useCallback } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { ChevronRightIcon } from "@/components/operations-icons";
import { ProductHeader } from "@/components/product-header";
import { Screen } from "@/components/screen";
import { aboutSections, externalResourceLinks } from "@/features/more/about-data";
import { AccountSection } from "@/features/more/account-section";
import { NotificationsSection } from "@/features/more/notifications-section";
import { useTheme } from "@/theme/theme-provider";

export function MoreScreen() {
  const { mode, setMode, theme } = useTheme();

  const handleOpenLink = useCallback(async (url: string, label: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Unable to open link", `Could not open ${label} in browser.`);
      }
    } catch {
      Alert.alert("Unable to open link", `Could not open ${label} in browser.`);
    }
  }, []);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <ProductHeader
          eyebrow="LINEWATCHTO"
          subtitle="Account, display, data sources, and project documentation."
          title="More"
        />

        {/* Account Management */}
        <AccountSection />

        {/* Notifications Management */}
        <NotificationsSection />

        {/* Display Settings */}
        <View style={[styles.section, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.color.text }]}>Display</Text>
          <Text style={[styles.copy, { color: theme.color.textMuted }]}>
            High contrast increases borders and foreground separation across the app.
          </Text>
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
                  testID={`theme-option-${option}`}
                >
                  <Text style={[styles.choiceLabel, { color: theme.color.text }]}>
                    {option === "dark" ? "Dark" : "High contrast"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Transit Monitors & Outages */}
        <View style={[styles.section, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.color.text }]}>Transit Monitors</Text>
          <Text style={[styles.copy, { color: theme.color.textMuted }]}>
            Specialized reliability dashboards and facility outage feeds.
          </Text>
          <View style={styles.linkList}>
            <Pressable
              accessibilityHint="Opens elevator and escalator outage monitor"
              accessibilityLabel="Accessibility Outages: Live elevator and escalator disruptions"
              accessibilityRole="button"
              onPress={() => router.push("/accessibility")}
              style={({ pressed }) => [
                styles.linkCard,
                {
                  backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surfaceOverlay,
                  borderColor: theme.color.border,
                },
              ]}
              testID="tool-link-accessibility"
            >
              <View style={styles.linkContent}>
                <Text style={[styles.linkLabel, { color: theme.color.text }]}>Accessibility Outages</Text>
                <Text style={[styles.linkDesc, { color: theme.color.textQuiet }]}>
                  Live elevator & escalator disruptions grouped by line and station.
                </Text>
              </View>
              <ChevronRightIcon color={theme.color.textQuiet} size={16} />
            </Pressable>

            <Pressable
              accessibilityHint="Opens surface detours and regional trip changes"
              accessibilityLabel="Service Notices: Surface detours and regional trip changes"
              accessibilityRole="button"
              onPress={() => router.push("/notices")}
              style={({ pressed }) => [
                styles.linkCard,
                {
                  backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surfaceOverlay,
                  borderColor: theme.color.border,
                },
              ]}
              testID="tool-link-notices"
            >
              <View style={styles.linkContent}>
                <Text style={[styles.linkLabel, { color: theme.color.text }]}>Service Notices & Changes</Text>
                <Text style={[styles.linkDesc, { color: theme.color.textQuiet }]}>
                  Surface detours, bus/streetcar notices, and GO trip changes.
                </Text>
              </View>
              <ChevronRightIcon color={theme.color.textQuiet} size={16} />
            </Pressable>

            <Pressable
              accessibilityHint="Opens 30-day reliability metrics and incident durations"
              accessibilityLabel="Reliability Summaries: 30-day disruption metrics and median durations"
              accessibilityRole="button"
              onPress={() => router.push("/reliability")}
              style={({ pressed }) => [
                styles.linkCard,
                {
                  backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surfaceOverlay,
                  borderColor: theme.color.border,
                },
              ]}
              testID="tool-link-reliability"
            >
              <View style={styles.linkContent}>
                <Text style={[styles.linkLabel, { color: theme.color.text }]}>Reliability Summaries</Text>
                <Text style={[styles.linkDesc, { color: theme.color.textQuiet }]}>
                  30-day incident counts, median durations, and service impact time.
                </Text>
              </View>
              <ChevronRightIcon color={theme.color.textQuiet} size={16} />
            </Pressable>
          </View>
        </View>

        {/* Documentation & Disclaimers */}
        {aboutSections.map((section) => (
          <View
            key={section.title}
            style={[styles.section, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}
          >
            <Text style={[styles.sectionTitle, { color: theme.color.text }]}>{section.title}</Text>
            <Text style={[styles.copy, { color: theme.color.textMuted }]}>{section.body}</Text>
            {section.bullets && section.bullets.length > 0 ? (
              <View style={styles.bulletList}>
                {section.bullets.map((bullet, idx) => (
                  <View key={idx} style={styles.bulletItem}>
                    <Text style={[styles.bulletDot, { color: theme.color.focus }]}>•</Text>
                    <Text style={[styles.bulletText, { color: theme.color.textMuted }]}>{bullet}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}

        {/* External Data Sources & References */}
        <View style={[styles.section, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.color.text }]}>External Resources</Text>
          <Text style={[styles.copy, { color: theme.color.textMuted }]}>
            Official open data datasets, map references, and policy terms.
          </Text>
          <View style={styles.linkList}>
            {externalResourceLinks.map((link) => (
              <Pressable
                key={link.label}
                accessibilityHint="Opens external webpage in browser"
                accessibilityLabel={`${link.label}: ${link.description}`}
                accessibilityRole="link"
                onPress={() => handleOpenLink(link.href, link.label)}
                style={({ pressed }) => [
                  styles.linkCard,
                  {
                    backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surfaceOverlay,
                    borderColor: theme.color.border,
                  },
                ]}
                testID={`resource-link-${link.label}`}
              >
                <View style={styles.linkContent}>
                  <Text style={[styles.linkLabel, { color: theme.color.text }]}>{link.label}</Text>
                  <Text style={[styles.linkDesc, { color: theme.color.textQuiet }]}>{link.description}</Text>
                </View>
                <ExternalLinkIcon color={theme.color.textQuiet} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* App Metadata */}
        <View style={[styles.section, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.color.text }]}>Application Info</Text>
          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: theme.color.textQuiet }]}>VERSION</Text>
            <Text style={[styles.metaValue, { color: theme.color.text }]}>0.1.0</Text>
          </View>
          <View style={[styles.rule, { backgroundColor: theme.color.border }]} />
          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: theme.color.textQuiet }]}>FRAMEWORK</Text>
            <Text style={[styles.metaValue, { color: theme.color.text }]}>Expo SDK 57 / React Native</Text>
          </View>
          <View style={[styles.rule, { backgroundColor: theme.color.border }]} />
          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: theme.color.textQuiet }]}>DATA POLICY</Text>
            <Text style={[styles.metaValue, { color: theme.color.text }]}>Source-labeled · Local cache</Text>
          </View>
        </View>

        <Text style={[styles.disclaimer, { color: theme.color.textMuted }]}>
          LineWatchTO is unofficial transit software and is not affiliated with TTC or Metrolinx.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function ExternalLinkIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 120, gap: 12 },
  section: { borderWidth: 1, borderRadius: 6, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  copy: { fontSize: 13, lineHeight: 19 },
  row: { flexDirection: "row", gap: 8 },
  choice: {
    minHeight: 44,
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  choiceLabel: { fontSize: 13, fontWeight: "700" },
  bulletList: { gap: 6, paddingTop: 2 },
  bulletItem: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  bulletDot: { fontSize: 14, lineHeight: 18 },
  bulletText: { flex: 1, fontSize: 12, lineHeight: 17 },
  linkList: { gap: 8, paddingTop: 4 },
  linkCard: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  linkContent: { flex: 1, gap: 2 },
  linkLabel: { fontSize: 13, fontWeight: "800" },
  linkDesc: { fontSize: 11, lineHeight: 15 },
  navArrow: { fontSize: 20, fontWeight: "700" },
  rule: { height: 1 },
  metaRow: { minHeight: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  metaLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  metaValue: { flex: 1, fontSize: 12, fontWeight: "700", textAlign: "right" },
  disclaimer: { fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 8, marginBottom: 12 },
});
