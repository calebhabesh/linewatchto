import { useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import type { EventTypePreferences } from "@/api/push-schema";
import { LineBadge } from "@/components/line-badge";
import { useAuth } from "@/state/auth-provider";
import { usePushNotifications } from "@/state/push-notifications-provider";
import { useTheme } from "@/theme/theme-provider";

const eventTypeLabels: { key: keyof EventTypePreferences; label: string; desc: string }[] = [
  { key: "suspensions", label: "Suspensions", desc: "Line suspensions and major outages" },
  { key: "delays", label: "Delays", desc: "Signal and operational delays" },
  { key: "tripCancellations", label: "Trip Cancellations", desc: "Regional train cancellations" },
  { key: "reducedSpeedZones", label: "Reduced Speed Zones", desc: "Track speed restrictions" },
  { key: "plannedClosures", label: "Planned Closures", desc: "Weekend and nightly maintenance" },
  { key: "serviceRestored", label: "Service Restored", desc: "Notice when service returns to normal" },
];

const followUpOptions = [
  { id: "smart", label: "Smart" },
  { id: "24h", label: "24h Before" },
  { id: "morning", label: "Day Of" },
  { id: "announcements-only", label: "Announce Only" },
];

export function NotificationsSection() {
  const { theme } = useTheme();
  const { status } = useAuth();
  const {
    preferences,
    loading,
    updating,
    toggleCommuteNotifications,
    togglePlannedClosureNotifications,
    setPlannedClosureFollowUp,
    toggleEventType,
    toggleLineSubscription,
  } = usePushNotifications();

  const handleToggleLine = useCallback(
    (lineId: string, currentSubscribed: boolean) => {
      void toggleLineSubscription(lineId, !currentSubscribed);
    },
    [toggleLineSubscription],
  );

  return (
    <View
      style={[
        styles.section,
        { backgroundColor: theme.color.surface, borderColor: theme.color.border },
      ]}
      testID="notifications-section"
    >
      <View style={styles.titleRow}>
        <Text style={[styles.sectionTitle, { color: theme.color.text }]}>Notifications</Text>
        {updating ? <ActivityIndicator color={theme.color.focus} size="small" /> : null}
      </View>

      <Text style={[styles.copy, { color: theme.color.textMuted }]}>
        Manage alert subscriptions for your commutes, lines, and event types.
      </Text>

      {status === "unauthenticated" ? (
        <View
          style={[
            styles.unauthBanner,
            { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.border },
          ]}
          testID="notifications-unauthenticated-banner"
        >
          <Text style={[styles.unauthText, { color: theme.color.textMuted }]}>
            Sign in or use a demo account in the Account section above to configure push
            notification preferences for your commute routes and transit lines.
          </Text>
        </View>
      ) : loading && !preferences ? (
        <ActivityIndicator color={theme.color.focus} style={{ marginVertical: 12 }} />
      ) : preferences ? (
        <View style={styles.formContainer}>
          {/* Master Commute Switch */}
          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={[styles.switchTitle, { color: theme.color.text }]}>
                Commute Route Alerts
              </Text>
              <Text style={[styles.switchDesc, { color: theme.color.textMuted }]}>
                Notify on disruptions along your saved commutes
              </Text>
            </View>
            <Switch
              accessibilityLabel="Commute Route Alerts"
              onValueChange={(val) => void toggleCommuteNotifications(val)}
              thumbColor={preferences.commuteNotificationsEnabled ? theme.color.focus : "#777777"}
              trackColor={{ false: theme.color.surfaceRaised, true: theme.color.focus }}
              value={preferences.commuteNotificationsEnabled}
              testID="commute-notifications-switch"
            />
          </View>

          {/* Master Planned Closures Switch */}
          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={[styles.switchTitle, { color: theme.color.text }]}>
                Planned Closures
              </Text>
              <Text style={[styles.switchDesc, { color: theme.color.textMuted }]}>
                Notify when weekend or nightly closures are active
              </Text>
            </View>
            <Switch
              accessibilityLabel="Planned Closures"
              onValueChange={(val) => void togglePlannedClosureNotifications(val)}
              thumbColor={preferences.plannedClosureNotificationsEnabled ? theme.color.focus : "#777777"}
              trackColor={{ false: theme.color.surfaceRaised, true: theme.color.focus }}
              value={preferences.plannedClosureNotificationsEnabled}
              testID="planned-closure-notifications-switch"
            />
          </View>

          {/* Closure Timing Policy */}
          <View style={styles.timingGroup}>
            <Text style={[styles.groupLabel, { color: theme.color.textMuted }]}>
              CLOSURE REMINDER TIMING
            </Text>
            <View style={styles.timingRow}>
              {followUpOptions.map((opt) => {
                const selected = preferences.plannedClosureFollowUp === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => void setPlannedClosureFollowUp(opt.id)}
                    style={[
                      styles.timingChip,
                      {
                        backgroundColor: selected
                          ? theme.color.focus
                          : theme.color.surfaceRaised,
                        borderColor: selected
                          ? theme.color.focus
                          : theme.color.border,
                      },
                    ]}
                    testID={`timing-policy-${opt.id}`}
                  >
                    <Text
                      style={[
                        styles.timingChipText,
                        {
                          color: selected ? "#090909" : theme.color.text,
                          fontWeight: selected ? "900" : "600",
                        },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Event Type Filters */}
          <View style={styles.timingGroup}>
            <Text style={[styles.groupLabel, { color: theme.color.textMuted }]}>
              DISRUPTION TYPES
            </Text>
            {eventTypeLabels.map(({ key, label, desc }) => {
              const checked = preferences.savedCommutes.eventTypes[key] ?? true;
              return (
                <View key={key} style={styles.eventRow}>
                  <View style={styles.switchTextCol}>
                    <Text style={[styles.eventTitle, { color: theme.color.text }]}>{label}</Text>
                    <Text style={[styles.eventDesc, { color: theme.color.textMuted }]}>{desc}</Text>
                  </View>
                  <Switch
                    accessibilityLabel={label}
                    onValueChange={(val) => void toggleEventType(key, val)}
                    thumbColor={checked ? theme.color.focus : "#777777"}
                    trackColor={{ false: theme.color.surfaceRaised, true: theme.color.focus }}
                    value={checked}
                    testID={`event-type-switch-${key}`}
                  />
                </View>
              );
            })}
          </View>

          {/* Line Subscriptions Grid */}
          <View style={styles.timingGroup}>
            <Text style={[styles.groupLabel, { color: theme.color.textMuted }]}>
              LINE & CORRIDOR NOTIFICATIONS
            </Text>
            <View style={styles.linesGrid}>
              {preferences.lineSubscriptions.lines.map((line) => {
                return (
                  <Pressable
                    key={line.lineId}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: line.subscribed }}
                    onPress={() => handleToggleLine(line.lineId, line.subscribed)}
                    style={[
                      styles.lineChip,
                      {
                        backgroundColor: line.subscribed
                          ? theme.color.chromeGlow
                          : theme.color.surfaceRaised,
                        borderColor: line.subscribed
                          ? theme.color.focus
                          : theme.color.border,
                      },
                    ]}
                    testID={`line-sub-${line.lineId}`}
                  >
                    <LineBadge lineId={line.lineId} lineNumber={line.lineNumber} size={18} />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.lineChipLabel,
                        {
                          color: line.subscribed ? theme.color.text : theme.color.textMuted,
                          fontWeight: line.subscribed ? "800" : "600",
                        },
                      ]}
                    >
                      {line.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    gap: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
  },
  copy: {
    fontSize: 13,
    lineHeight: 18,
  },
  unauthBanner: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
  },
  unauthText: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  formContainer: {
    gap: 16,
    marginTop: 4,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  switchTextCol: {
    flex: 1,
    paddingRight: 12,
    gap: 2,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  switchDesc: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  timingGroup: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(150, 150, 150, 0.15)",
    paddingTop: 12,
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  timingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  timingChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  timingChipText: {
    fontSize: 11.5,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  eventTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  eventDesc: {
    fontSize: 11,
  },
  linesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  lineChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    minWidth: "47%",
    flex: 1,
  },
  lineChipLabel: {
    fontSize: 11.5,
    flex: 1,
  },
});
