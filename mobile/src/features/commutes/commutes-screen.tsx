import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDashboard } from "@/api/dashboard";
import type { SavedCommute } from "@/api/commutes-schema";
import { EmptyState } from "@/components/empty-state";
import { LineBadge } from "@/components/line-badge";
import { ProductHeader } from "@/components/product-header";
import { Screen } from "@/components/screen";
import { useAppActive } from "@/hooks/use-app-active";
import { useAuth } from "@/state/auth-provider";
import { useCommutes } from "@/state/commutes-provider";
import { useNetwork } from "@/state/network-provider";
import { useTheme } from "@/theme/theme-provider";
import type { Theme } from "@/theme/tokens";

export function CommutesScreen() {
  const { network, setNetwork } = useNetwork();
  const { status, demoLogin } = useAuth();
  const { commutes, loading, deleteCommute, createCommute, refetch } = useCommutes();
  const dashboardQuery = useDashboard(network, useAppActive());
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [fromStationId, setFromStationId] = useState("");
  const [toStationId, setToStationId] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [includeReturnTrip, setIncludeReturnTrip] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const stations = useMemo(() => {
    return dashboardQuery.data?.map.stations ?? [];
  }, [dashboardQuery.data?.map.stations]);

  const networkCommutes = useMemo(() => {
    return commutes.filter((c) => (c.networkId ?? "ttc") === network);
  }, [commutes, network]);

  const handleOpenCreateModal = useCallback(() => {
    if (stations.length >= 2) {
      setFromStationId(stations[0]?.id ?? "");
      setToStationId(stations[1]?.id ?? "");
    }
    setCustomLabel("");
    setIncludeReturnTrip(true);
    setCreateError(null);
    setShowCreateModal(true);
  }, [stations]);

  const handleCreateSubmit = useCallback(async () => {
    if (!fromStationId || !toStationId) {
      setCreateError("Please select both an origin and destination station.");
      return;
    }
    if (fromStationId === toStationId) {
      setCreateError("Origin and destination must be different stations.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await createCommute({
        networkId: network,
        fromStationId,
        toStationId,
        customLabel: customLabel.trim() || undefined,
        includeReturnTrip,
      });
      setShowCreateModal(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create commute.");
    } finally {
      setCreating(false);
    }
  }, [fromStationId, toStationId, network, customLabel, includeReturnTrip, createCommute]);

  const handleDelete = useCallback(
    (commute: SavedCommute) => {
      Alert.alert(
        "Delete Commute",
        `Are you sure you want to remove "${commute.label}" from your saved commutes?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              void deleteCommute(commute.id);
            },
          },
        ],
      );
    },
    [deleteCommute],
  );

  const bottomPadding = Math.max(100, insets.bottom + 80);

  return (
    <Screen>
      <FlatList
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        data={status === "authenticated" ? networkCommutes : []}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            colors={[theme.color.focus]}
            onRefresh={() => void refetch()}
            refreshing={loading}
            tintColor={theme.color.focus}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <ProductHeader
              eyebrow="COMMUTE MONITORING"
              network={network}
              onNetworkChange={setNetwork}
              subtitle="Monitor your daily rapid transit routes and impacts."
              title="My Commutes"
            />

            {status === "unauthenticated" ? (
              <View
                style={[
                  styles.unauthenticatedCard,
                  { backgroundColor: theme.color.surface, borderColor: theme.color.border },
                ]}
                testID="commutes-unauthenticated-card"
              >
                <Text style={[styles.unauthTitle, { color: theme.color.text }]}>
                  Track Your Daily Commute
                </Text>
                <Text style={[styles.unauthCopy, { color: theme.color.textMuted }]}>
                  Save rapid transit routes to monitor active delays, suspensions, Reduced
                  Speed Zones, and planned closures along your exact travel path.
                </Text>

                <View style={styles.unauthActionRow}>
                  <Pressable
                    accessibilityLabel="Try Demo Account"
                    accessibilityRole="button"
                    onPress={() => void demoLogin()}
                    style={({ pressed }) => [
                      styles.unauthDemoButton,
                      {
                        backgroundColor: pressed
                          ? theme.color.surfaceRaised
                          : theme.color.surface,
                        borderColor: theme.color.focus,
                      },
                    ]}
                    testID="commutes-demo-button"
                  >
                    <Text style={[styles.unauthDemoText, { color: theme.color.focus }]}>
                      Try Demo Account
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityLabel="Sign In in More Tab"
                    accessibilityRole="button"
                    onPress={() => router.push("/more")}
                    style={({ pressed }) => [
                      styles.unauthSignInButton,
                      {
                        backgroundColor: pressed
                          ? theme.color.surfaceRaised
                          : theme.color.focus,
                        borderColor: theme.color.focus,
                      },
                    ]}
                    testID="commutes-signin-button"
                  >
                    <Text style={[styles.unauthSignInText, { color: "#090909" }]}>
                      Sign In
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.authenticatedHeaderRow}>
                <Text style={[styles.commuteCountText, { color: theme.color.textMuted }]}>
                  {networkCommutes.length}{" "}
                  {networkCommutes.length === 1 ? "commute" : "commutes"} monitored
                </Text>
                <Pressable
                  accessibilityLabel="Add New Commute"
                  accessibilityRole="button"
                  onPress={handleOpenCreateModal}
                  style={({ pressed }) => [
                    styles.addCommuteButton,
                    {
                      backgroundColor: pressed
                        ? theme.color.surfaceRaised
                        : theme.color.focus,
                      borderColor: theme.color.focus,
                    },
                  ]}
                  testID="add-commute-button"
                >
                  <Text style={[styles.addCommuteButtonText, { color: "#090909" }]}>
                    + Add Commute
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          status === "authenticated" ? (
            <EmptyState
              compact
              title="No saved commutes for this network."
              message="Tap '+ Add Commute' above to save your first rapid transit route."
            />
          ) : null
        }
        renderItem={({ item }) => (
          <CommuteCard
            commute={item}
            onDelete={() => handleDelete(item)}
            theme={theme}
          />
        )}
      />

      {/* Add Commute Modal */}
      <Modal
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
        transparent
        visible={showCreateModal}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: theme.color.surface, borderColor: theme.color.border },
            ]}
          >
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: theme.color.text }]}>
                Add Commute Route
              </Text>
              <Pressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={[styles.modalCloseText, { color: theme.color.textMuted }]}>✕</Text>
              </Pressable>
            </View>

            {createError ? (
              <View style={[styles.errorBox, { borderColor: theme.line.suspension }]}>
                <Text style={[styles.errorText, { color: theme.line.suspension }]}>
                  {createError}
                </Text>
              </View>
            ) : null}

            <ScrollView contentContainerStyle={styles.modalFormContent}>
              {/* Origin Station Picker */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.color.textMuted }]}>
                  ORIGIN STATION
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.stationChipScroll}
                >
                  {stations.map((station) => {
                    const isSelected = fromStationId === station.id;
                    return (
                      <Pressable
                        key={station.id}
                        accessibilityRole="button"
                        onPress={() => setFromStationId(station.id)}
                        style={[
                          styles.stationPickerChip,
                          {
                            backgroundColor: isSelected
                              ? theme.color.focus
                              : theme.color.surfaceRaised,
                            borderColor: isSelected
                              ? theme.color.focus
                              : theme.color.border,
                          },
                        ]}
                        testID={`picker-from-${station.id}`}
                      >
                        <Text
                          style={[
                            styles.stationPickerText,
                            {
                              color: isSelected ? "#090909" : theme.color.text,
                              fontWeight: isSelected ? "900" : "600",
                            },
                          ]}
                        >
                          {station.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Destination Station Picker */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.color.textMuted }]}>
                  DESTINATION STATION
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.stationChipScroll}
                >
                  {stations.map((station) => {
                    const isSelected = toStationId === station.id;
                    return (
                      <Pressable
                        key={station.id}
                        accessibilityRole="button"
                        onPress={() => setToStationId(station.id)}
                        style={[
                          styles.stationPickerChip,
                          {
                            backgroundColor: isSelected
                              ? theme.color.focus
                              : theme.color.surfaceRaised,
                            borderColor: isSelected
                              ? theme.color.focus
                              : theme.color.border,
                          },
                        ]}
                        testID={`picker-to-${station.id}`}
                      >
                        <Text
                          style={[
                            styles.stationPickerText,
                            {
                              color: isSelected ? "#090909" : theme.color.text,
                              fontWeight: isSelected ? "900" : "600",
                            },
                          ]}
                        >
                          {station.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Custom Label */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.color.textMuted }]}>
                  CUSTOM LABEL (OPTIONAL)
                </Text>
                <TextInput
                  accessibilityLabel="Custom commute label"
                  onChangeText={setCustomLabel}
                  placeholder="e.g. Work, Campus, Gym"
                  placeholderTextColor={theme.color.textMuted}
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: theme.color.surfaceRaised,
                      borderColor: theme.color.border,
                      color: theme.color.text,
                    },
                  ]}
                  value={customLabel}
                />
              </View>

              {/* Return Leg Switch */}
              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: theme.color.text }]}>
                  Monitor return trip
                </Text>
                <Switch
                  onValueChange={setIncludeReturnTrip}
                  thumbColor={includeReturnTrip ? theme.color.focus : "#777777"}
                  trackColor={{ false: theme.color.surfaceRaised, true: theme.color.focus }}
                  value={includeReturnTrip}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <Pressable
                accessibilityLabel="Cancel"
                accessibilityRole="button"
                onPress={() => setShowCreateModal(false)}
                style={[
                  styles.modalCancelButton,
                  { borderColor: theme.color.border },
                ]}
              >
                <Text style={[styles.modalCancelText, { color: theme.color.text }]}>
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                accessibilityLabel="Save Commute"
                accessibilityRole="button"
                disabled={creating}
                onPress={() => void handleCreateSubmit()}
                style={[
                  styles.modalSubmitButton,
                  { backgroundColor: theme.color.focus, borderColor: theme.color.focus },
                ]}
                testID="commute-submit-button"
              >
                {creating ? (
                  <ActivityIndicator color="#090909" size="small" />
                ) : (
                  <Text style={[styles.modalSubmitText, { color: "#090909" }]}>
                    Save Commute
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Commute Card Component
// ---------------------------------------------------------------------------

function CommuteCard({
  commute,
  onDelete,
  theme,
}: {
  commute: SavedCommute;
  onDelete: () => void;
  theme: Theme;
}) {
  const [selectedLeg, setSelectedLeg] = useState<"outbound" | "return">("outbound");
  const leg =
    selectedLeg === "return" && commute.returnLeg ? commute.returnLeg : commute.outboundLeg;
  const impact = leg?.impact ?? commute.impact;
  const path = leg?.path ?? commute.path;
  const travelTimeEstimate =
    impact?.travelTimeEstimate ?? commute.impact?.travelTimeEstimate;
  const matchedImpacts =
    impact?.matchedImpacts && impact.matchedImpacts.length > 0
      ? impact.matchedImpacts
      : commute.impact?.matchedImpacts ?? [];

  const severity = impact?.severity ?? "normal";
  const statusColor =
    severity === "suspension"
      ? theme.line.suspension
      : severity === "delay"
        ? theme.line.delay
        : severity === "reduced-speed-zone"
          ? theme.color.focus
          : severity === "planned-closure"
            ? theme.line.planned
            : theme.line.normal;

  const baselineMinutes = Math.round((path?.estimatedTravelSeconds ?? 0) / 60);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.color.surface, borderColor: theme.color.border },
      ]}
      testID={`commute-card-${commute.id}`}
    >
      {/* Card Header */}
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardTitleBlock}>
          <Text style={[styles.commuteLabel, { color: theme.color.text }]}>
            {commute.label}
          </Text>
          <Text style={[styles.commuteRouteEndpoints, { color: theme.color.textMuted }]}>
            {commute.originStationName} › {commute.destinationStationName}
          </Text>
        </View>

        <View style={[styles.statusBadge, { borderColor: statusColor, backgroundColor: "transparent" }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>
            {impact?.statusLabel ?? (severity === "normal" ? "Normal Service" : severity.toUpperCase())}
          </Text>
        </View>
      </View>

      {/* Leg Switcher if Return Leg watched */}
      {commute.watchReturnTrip && commute.returnLeg ? (
        <View style={[styles.legSwitcher, { borderColor: theme.color.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: selectedLeg === "outbound" }}
            onPress={() => setSelectedLeg("outbound")}
            style={[
              styles.legButton,
              selectedLeg === "outbound"
                ? { backgroundColor: theme.color.surfaceRaised }
                : null,
            ]}
          >
            <Text
              style={[
                styles.legButtonText,
                {
                  color: selectedLeg === "outbound" ? theme.color.text : theme.color.textMuted,
                  fontWeight: selectedLeg === "outbound" ? "800" : "600",
                },
              ]}
            >
              Outbound ({commute.originStationName} › {commute.destinationStationName})
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: selectedLeg === "return" }}
            onPress={() => setSelectedLeg("return")}
            style={[
              styles.legButton,
              selectedLeg === "return"
                ? { backgroundColor: theme.color.surfaceRaised }
                : null,
            ]}
          >
            <Text
              style={[
                styles.legButtonText,
                {
                  color: selectedLeg === "return" ? theme.color.text : theme.color.textMuted,
                  fontWeight: selectedLeg === "return" ? "800" : "600",
                },
              ]}
            >
              Return ({commute.destinationStationName} › {commute.originStationName})
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Travel Time Estimate */}
      <View
        style={[
          styles.travelTimeRow,
          { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.border },
        ]}
      >
        <Text style={[styles.travelTimeLabel, { color: theme.color.textMuted }]}>
          ESTIMATED TRAVEL TIME
        </Text>
        <Text style={[styles.travelTimeValue, { color: theme.color.text }]}>
          {baselineMinutes > 0 ? `${baselineMinutes} min` : "Calculating…"}
          {travelTimeEstimate?.summary ? ` · ${travelTimeEstimate.summary}` : ""}
        </Text>
      </View>

      {/* Matched Impacts List */}
      {matchedImpacts.length > 0 ? (
        <View style={styles.matchedImpactList}>
          {matchedImpacts.map((matched) => (
            <View
              key={matched.id}
              style={[
                styles.matchedImpactItem,
                { borderColor: theme.color.border, backgroundColor: theme.color.surfaceRaised },
              ]}
            >
              <View style={styles.matchedHeaderRow}>
                {matched.lineNumber ? (
                  <LineBadge lineId={matched.lineId} lineNumber={matched.lineNumber} size={18} />
                ) : null}
                <Text style={[styles.matchedTitle, { color: theme.color.text }]}>
                  {matched.title}
                </Text>
              </View>
              {matched.description ? (
                <Text style={[styles.matchedDesc, { color: theme.color.textMuted }]}>
                  {matched.description}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {/* Card Actions */}
      <View style={styles.cardActionRow}>
        <Pressable
          accessibilityLabel={`Delete commute ${commute.label}`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onDelete}
          style={styles.deleteButton}
          testID={`delete-commute-${commute.id}`}
        >
          <Text style={[styles.deleteButtonText, { color: theme.line.suspension }]}>
            Delete
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  header: { gap: 12, marginBottom: 4 },
  unauthenticatedCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    gap: 10,
  },
  unauthTitle: {
    fontSize: 16,
    fontWeight: "900",
  },
  unauthCopy: {
    fontSize: 13,
    lineHeight: 18,
  },
  unauthActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  unauthDemoButton: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  unauthDemoText: {
    fontSize: 13,
    fontWeight: "800",
  },
  unauthSignInButton: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  unauthSignInText: {
    fontSize: 13,
    fontWeight: "800",
  },
  authenticatedHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  commuteCountText: {
    fontSize: 12,
    fontWeight: "600",
  },
  addCommuteButton: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  addCommuteButtonText: {
    fontSize: 12,
    fontWeight: "800",
  },
  card: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitleBlock: {
    flex: 1,
    gap: 2,
  },
  commuteLabel: {
    fontSize: 16,
    fontWeight: "900",
  },
  commuteRouteEndpoints: {
    fontSize: 12,
    fontWeight: "600",
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  legSwitcher: {
    borderWidth: 1,
    borderRadius: 6,
    overflow: "hidden",
    gap: 1,
  },
  legButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  legButtonText: {
    fontSize: 11,
  },
  travelTimeRow: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  travelTimeLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  travelTimeValue: {
    fontSize: 13,
    fontWeight: "800",
  },
  matchedImpactList: {
    gap: 6,
  },
  matchedImpactItem: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    gap: 4,
  },
  matchedHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  matchedTitle: {
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  matchedDesc: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  cardActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 4,
  },
  deleteButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  deleteButtonText: {
    fontSize: 12,
    fontWeight: "800",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 14,
    maxHeight: "85%",
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: "700",
    padding: 4,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
  },
  errorText: {
    fontSize: 12,
    fontWeight: "700",
  },
  modalFormContent: {
    gap: 14,
    paddingBottom: 10,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  stationChipScroll: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 2,
  },
  stationPickerChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 38,
    justifyContent: "center",
  },
  stationPickerText: {
    fontSize: 12,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 42,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  modalFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  modalCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: "700",
  },
  modalSubmitButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  modalSubmitText: {
    fontSize: 13,
    fontWeight: "900",
  },
});
