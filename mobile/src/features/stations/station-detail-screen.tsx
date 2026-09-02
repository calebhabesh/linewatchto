import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useDashboard } from "@/api/dashboard";
import type { NetworkId } from "@/api/dashboard-schema";
import {
  useRegionalStationArrivals,
  useStationSurfaceConnections,
  useTtcStationDetail,
} from "@/api/station-detail";
import type {
  RegionalArrivalItem,
  StationArrivalItem,
  SurfaceArrivalItem,
  SurfaceArrivalSnapshot,
} from "@/api/station-detail-schema";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { Screen } from "@/components/screen";
import {
  formatArrivalClockTime,
  getRegionalLinesForStation,
} from "@/features/stations/regional-station-catalog";
import { useAppActive } from "@/hooks/use-app-active";
import { useScreenFocused } from "@/hooks/use-screen-focused";
import { useTheme } from "@/theme/theme-provider";
import type { Theme } from "@/theme/tokens";

export function StationDetailScreen() {
  const params = useLocalSearchParams<{ network?: string; id?: string }>();
  const network: NetworkId = params.network === "regional" ? "regional" : "ttc";
  const stationId = params.id ?? "";

  const isAppActive = useAppActive();
  const isScreenFocused = useScreenFocused();
  const isPolling = isAppActive && isScreenFocused;

  const { theme } = useTheme();

  // TTC Data Queries
  const ttcQuery = useTtcStationDetail(network === "ttc" ? stationId : "", isPolling);

  // Regional Data Queries (Composed independently)
  const dashboardQuery = useDashboard("regional", isPolling);
  const regionalArrivalsQuery = useRegionalStationArrivals(
    network === "regional" ? stationId : "",
    isPolling,
  );

  // Surface Connections (available for both TTC and Regional)
  const surfaceQuery = useStationSurfaceConnections(network, stationId, isPolling);

  // Regional station metadata from cached dashboard
  const regionalStation = useMemo(() => {
    if (network !== "regional" || !dashboardQuery.data) return null;
    return dashboardQuery.data.map.stations.find((s) => s.id === stationId) ?? null;
  }, [network, dashboardQuery.data, stationId]);

  // Regional impacts affecting this station from dashboard
  const regionalStationImpacts = useMemo(() => {
    if (network !== "regional" || !dashboardQuery.data) return [];
    const alerts = [
      ...dashboardQuery.data.activeAlerts.map((a) => {
        const kind: "suspension" | "planned-closure" | "delay" =
          a.severity === "suspension"
            ? "suspension"
            : a.severity === "planned"
              ? "planned-closure"
              : "delay";
        return { kind, data: a };
      }),
      ...dashboardQuery.data.delays.map((d) => ({
        kind: "delay" as const,
        data: d,
      })),
      ...dashboardQuery.data.plannedClosures.map((c) => ({
        kind: "planned-closure" as const,
        data: c,
      })),
    ];

    // Filter alerts that mention this station
    return alerts.filter(
      (item) =>
        item.data.location.toLowerCase().includes(stationId.replace(/-/g, " ")) ||
        (regionalStation && item.data.location.toLowerCase().includes(regionalStation.name.toLowerCase())),
    );
  }, [network, dashboardQuery.data, stationId, regionalStation]);

  const regionalLines = useMemo(() => {
    return getRegionalLinesForStation(stationId);
  }, [stationId]);

  const isRefetching =
    (network === "ttc" && (ttcQuery.isRefetching || surfaceQuery.isRefetching)) ||
    (network === "regional" &&
      (regionalArrivalsQuery.isRefetching ||
        surfaceQuery.isRefetching ||
        dashboardQuery.isRefetching));

  const handleRefresh = () => {
    if (network === "ttc") {
      void ttcQuery.refetch();
      void surfaceQuery.refetch();
    } else {
      void dashboardQuery.refetch();
      void regionalArrivalsQuery.refetch();
      void surfaceQuery.refetch();
    }
  };

  const stationName =
    network === "ttc"
      ? ttcQuery.data?.name ?? stationId.replace(/-/g, " ")
      : regionalStation?.name ?? stationId.replace(/-/g, " ");

  const isInitialLoading =
    (network === "ttc" && ttcQuery.isPending && !ttcQuery.data) ||
    (network === "regional" &&
      ((dashboardQuery.isPending && !dashboardQuery.data) ||
        (regionalArrivalsQuery.isPending && !regionalArrivalsQuery.data)));

  const error =
    network === "ttc"
      ? ttcQuery.error
      : regionalArrivalsQuery.error ?? dashboardQuery.error;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[theme.color.focus]}
            onRefresh={handleRefresh}
            refreshing={isRefetching}
            tintColor={theme.color.focus}
          />
        }
      >
        {/* Top Navigation Bar */}
        <View style={styles.navBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              {
                backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surface,
                borderColor: theme.color.border,
              },
            ]}
          >
            <Text style={[styles.backArrow, { color: theme.color.text }]}>‹</Text>
            <Text style={[styles.backText, { color: theme.color.text }]}>Back</Text>
          </Pressable>
          <Text
            accessibilityRole="header"
            style={[styles.headerTitle, { color: theme.color.textMuted }]}
          >
            Station details
          </Text>
        </View>

        {isInitialLoading ? (
          <LoadingState message="Loading station details…" />
        ) : error ? (
          <ErrorState message={error.message} onRetry={handleRefresh} />
        ) : network === "ttc" && ttcQuery.data ? (
          /* =========================================================================
             TTC Station Detail View
             ========================================================================= */
          <>
            {/* Header Card */}
            <View
              style={[
                styles.card,
                { backgroundColor: theme.color.surface, borderColor: theme.color.border },
              ]}
            >
              <Text style={[styles.stationTitle, { color: theme.color.text }]}>
                {ttcQuery.data.name}
              </Text>

              {/* Line Badges */}
              <View style={styles.badgeRow}>
                {ttcQuery.data.lines.map((line) => (
                  <View
                    key={line.id}
                    style={[styles.lineBadge, { backgroundColor: line.color }]}
                  >
                    <Text style={styles.lineBadgeText}>Line {line.number}</Text>
                  </View>
                ))}
                {ttcQuery.data.interchange ? (
                  <View
                    style={[
                      styles.interchangeBadge,
                      { borderColor: theme.color.border, backgroundColor: theme.color.surfaceRaised },
                    ]}
                  >
                    <Text style={[styles.interchangeText, { color: theme.color.textMuted }]}>
                      INTERCHANGE
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Station Amenities & Facilities */}
              <View style={styles.facilityGrid}>
                <FacilityPill
                  active={ttcQuery.data.access.status === "normal"}
                  label={
                    ttcQuery.data.access.status === "normal"
                      ? "Wheelchair Accessible"
                      : "Access Advisory"
                  }
                  theme={theme}
                />
                {ttcQuery.data.hasWashroom ? (
                  <FacilityPill active label="Washrooms" theme={theme} />
                ) : null}
                {ttcQuery.data.hasParking ? (
                  <FacilityPill active label="Parking" theme={theme} />
                ) : null}
                {ttcQuery.data.hasBicycleLockup ? (
                  <FacilityPill active label="Bicycle Lockup" theme={theme} />
                ) : null}
                {ttcQuery.data.hasBicycleRepair ? (
                  <FacilityPill active label="Bike Repair Stand" theme={theme} />
                ) : null}
                {ttcQuery.data.hasBikeShare ? (
                  <FacilityPill active label="Bike Share" theme={theme} />
                ) : null}
                {ttcQuery.data.hasPpudo ? (
                  <FacilityPill active label="Passenger Pick-up" theme={theme} />
                ) : null}
              </View>
            </View>

            {/* Subway & LRT Arrivals Card */}
            <View
              style={[
                styles.card,
                { backgroundColor: theme.color.surface, borderColor: theme.color.border },
              ]}
            >
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.sectionHeading, { color: theme.color.text }]}>
                  Subway & LRT Arrivals
                </Text>
                {ttcQuery.data.arrivalsSource ? (
                  <Text style={[styles.sourceBadgeText, { color: theme.color.textMuted }]}>
                    {ttcQuery.data.arrivalsSource}
                  </Text>
                ) : null}
              </View>

              {ttcQuery.data.arrivalContext?.scheduleMayBeDisrupted ? (
                <View
                  style={[
                    styles.disruptionBanner,
                    {
                      borderColor: theme.line.delay,
                      backgroundColor: `${theme.line.delay}20`,
                    },
                  ]}
                >
                  <Text style={[styles.disruptionBannerText, { color: theme.color.text }]}>
                    ⚠️ {ttcQuery.data.arrivalContext.message || "Schedule may be disrupted by active line incidents."}
                  </Text>
                </View>
              ) : null}

              {ttcQuery.data.arrivals.length === 0 ? (
                <Text style={[styles.emptySectionText, { color: theme.color.textMuted }]}>
                  No rapid transit arrivals currently scheduled or predicted.
                </Text>
              ) : (
                <View style={styles.arrivalList}>
                  {ttcQuery.data.arrivals.map((arrival, index) => (
                    <TtcArrivalRow key={`${arrival.lineId}-${arrival.direction}-${index}`} arrival={arrival} theme={theme} />
                  ))}
                </View>
              )}
            </View>

            {/* Active Impacts & Disruptions */}
            {ttcQuery.data.impacts.length > 0 ? (
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.color.surface, borderColor: theme.color.border },
                ]}
              >
                <Text style={[styles.sectionHeading, { color: theme.color.text }]}>
                  Active Station Impacts
                </Text>
                <View style={styles.impactList}>
                  {ttcQuery.data.impacts.map((impact) => (
                    <Pressable
                      key={impact.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Impact: ${impact.title}`}
                      onPress={() => {
                        const kind =
                          impact.severity === "suspension"
                            ? "suspension"
                            : impact.severity === "planned"
                              ? "planned-closure"
                              : "delay";
                        router.push({ pathname: "/impact/[kind]/[id]", params: { kind, id: impact.id } });
                      }}
                      style={({ pressed }) => [
                        styles.impactItem,
                        {
                          backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surface,
                          borderColor:
                            impact.severity === "suspension"
                              ? theme.line.suspension
                              : impact.severity === "planned"
                                ? theme.line.planned
                                : theme.line.delay,
                        },
                      ]}
                    >
                      <View style={styles.impactItemHeader}>
                        <Text style={[styles.impactTitle, { color: theme.color.text }]}>
                          {impact.title}
                        </Text>
                        <Text style={[styles.viewDetailsText, { color: theme.color.focus }]}>
                          View ›
                        </Text>
                      </View>
                      <Text style={[styles.impactSummary, { color: theme.color.textMuted }]}>
                        {impact.summary}
                      </Text>
                      {impact.updatedAgo ? (
                        <Text style={[styles.impactTime, { color: theme.color.textMuted }]}>
                          Updated {impact.updatedAgo}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Accessibility & Outages */}
            <View
              style={[
                styles.card,
                { backgroundColor: theme.color.surface, borderColor: theme.color.border },
              ]}
            >
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.sectionHeading, { color: theme.color.text }]}>
                  Accessibility & Outages
                </Text>
                <View
                  style={[
                    styles.accessStatusBadge,
                    {
                      backgroundColor:
                        ttcQuery.data.access.status === "normal"
                          ? `${theme.line.normal}25`
                          : `${theme.line.delay}25`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.accessStatusText,
                      {
                        color:
                          ttcQuery.data.access.status === "normal"
                            ? theme.line.normal
                            : theme.line.delay,
                      },
                    ]}
                  >
                    {ttcQuery.data.access.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={[styles.accessSummary, { color: theme.color.textMuted }]}>
                {ttcQuery.data.access.summary}
              </Text>

              {ttcQuery.data.access.outages.length > 0 ? (
                <View style={styles.outageList}>
                  {ttcQuery.data.access.outages.map((outage) => (
                    <View
                      key={outage.id}
                      style={[
                        styles.outageItem,
                        { borderColor: theme.color.border, backgroundColor: theme.color.surfaceRaised },
                      ]}
                    >
                      <View style={styles.outageHeader}>
                        <Text style={[styles.outageTypeBadge, { color: theme.line.delay }]}>
                          {outage.assetType.toUpperCase()}
                        </Text>
                        <Text style={[styles.outageTitle, { color: theme.color.text }]}>
                          {outage.title}
                        </Text>
                      </View>
                      <Text style={[styles.outageDesc, { color: theme.color.textMuted }]}>
                        {outage.description}
                      </Text>
                      {outage.cause ? (
                        <Text style={[styles.outageCause, { color: theme.color.textMuted }]}>
                          Cause: {outage.cause}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {/* Station Notices */}
            {ttcQuery.data.notices && ttcQuery.data.notices.length > 0 ? (
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.color.surface, borderColor: theme.color.border },
                ]}
              >
                <Text style={[styles.sectionHeading, { color: theme.color.text }]}>
                  Station Notices
                </Text>
                <View style={styles.noticeList}>
                  {ttcQuery.data.notices.map((notice) => (
                    <View
                      key={notice.id}
                      style={[
                        styles.noticeItem,
                        { borderColor: theme.color.border, backgroundColor: theme.color.surfaceRaised },
                      ]}
                    >
                      <Text style={[styles.noticeCategory, { color: theme.color.focus }]}>
                        {notice.category.toUpperCase()}
                      </Text>
                      <Text style={[styles.noticeTitle, { color: theme.color.text }]}>
                        {notice.title}
                      </Text>
                      <Text style={[styles.noticeSummary, { color: theme.color.textMuted }]}>
                        {notice.summary}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Surface Connections (Bus & Streetcar) */}
            <SurfaceConnectionsBlock surfaceData={surfaceQuery.data} theme={theme} />

            {/* Source Honesty Disclaimer */}
            <Text style={[styles.disclaimer, { color: theme.color.textMuted }]}>
              Source: TTC Live Alerts, TTC GTFS-RT. Unofficial transit reliability dashboard.
            </Text>
          </>
        ) : network === "regional" ? (
          /* =========================================================================
             Regional (GO / UP) Station Detail View (Composed independently)
             ========================================================================= */
          <>
            {/* Header Card */}
            <View
              style={[
                styles.card,
                { backgroundColor: theme.color.surface, borderColor: theme.color.border },
              ]}
            >
              <Text style={[styles.stationTitle, { color: theme.color.text }]}>
                {stationName}
              </Text>

              {/* Corridor Badges */}
              <View style={styles.badgeRow}>
                {regionalLines.map((line) => (
                  <View
                    key={line.id}
                    style={[styles.lineBadge, { backgroundColor: line.color }]}
                  >
                    <Text style={styles.lineBadgeText}>{line.number} · {line.name}</Text>
                  </View>
                ))}
                {regionalStation?.interchange ? (
                  <View
                    style={[
                      styles.interchangeBadge,
                      { borderColor: theme.color.border, backgroundColor: theme.color.surfaceRaised },
                    ]}
                  >
                    <Text style={[styles.interchangeText, { color: theme.color.textMuted }]}>
                      INTERCHANGE
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Amenities / Facilities */}
              <View style={styles.facilityGrid}>
                <FacilityPill active label="Regional Rail Hub" theme={theme} />
                <FacilityPill active label="Wheelchair Accessible" theme={theme} />
                <FacilityPill active label="Elevator Access" theme={theme} />
                <FacilityPill active label="Station Parking" theme={theme} />
              </View>
            </View>

            {/* Regional Train Arrivals Card */}
            <View
              style={[
                styles.card,
                { backgroundColor: theme.color.surface, borderColor: theme.color.border },
              ]}
            >
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.sectionHeading, { color: theme.color.text }]}>
                  GO & UP Train Arrivals
                </Text>
                <Text style={[styles.sourceBadgeText, { color: theme.color.textMuted }]}>
                  {regionalArrivalsQuery.data?.source ?? "Metrolinx"}
                </Text>
              </View>

              {regionalArrivalsQuery.data?.message &&
              regionalArrivalsQuery.data.availability !== "available" ? (
                <View
                  style={[
                    styles.disruptionBanner,
                    {
                      borderColor: theme.color.border,
                      backgroundColor: theme.color.surfaceRaised,
                    },
                  ]}
                >
                  <Text style={[styles.disruptionBannerText, { color: theme.color.textMuted }]}>
                    ℹ️ {regionalArrivalsQuery.data.message}
                  </Text>
                </View>
              ) : null}

              {regionalArrivalsQuery.data?.arrivals &&
              regionalArrivalsQuery.data.arrivals.length > 0 ? (
                <View style={styles.arrivalList}>
                  {regionalArrivalsQuery.data.arrivals.map((arrival, index) => (
                    <RegionalArrivalRow key={`${arrival.lineId}-${arrival.tripNumber}-${index}`} arrival={arrival} theme={theme} />
                  ))}
                </View>
              ) : (
                <Text style={[styles.emptySectionText, { color: theme.color.textMuted }]}>
                  No upcoming regional train departures currently found.
                </Text>
              )}
            </View>

            {/* Active Regional Disruptions at Station */}
            {regionalStationImpacts.length > 0 ? (
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.color.surface, borderColor: theme.color.border },
                ]}
              >
                <Text style={[styles.sectionHeading, { color: theme.color.text }]}>
                  Active Corridor Impacts
                </Text>
                <View style={styles.impactList}>
                  {regionalStationImpacts.map((impact) => (
                    <Pressable
                      key={impact.data.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Impact: ${impact.data.title}`}
                      onPress={() =>
                        router.push({
                          pathname: "/impact/[kind]/[id]",
                          params: { kind: impact.kind, id: impact.data.id },
                        })
                      }
                      style={({ pressed }) => [
                        styles.impactItem,
                        {
                          backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surface,
                          borderColor:
                            impact.kind === "suspension"
                              ? theme.line.suspension
                              : impact.kind === "planned-closure"
                                ? theme.line.planned
                                : theme.line.delay,
                        },
                      ]}
                    >
                      <View style={styles.impactItemHeader}>
                        <Text style={[styles.impactTitle, { color: theme.color.text }]}>
                          {impact.data.title}
                        </Text>
                        <Text style={[styles.viewDetailsText, { color: theme.color.focus }]}>
                          View ›
                        </Text>
                      </View>
                      <Text style={[styles.impactSummary, { color: theme.color.textMuted }]}>
                        {impact.data.description || impact.data.location}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Regional Surface Connections (GO Bus) */}
            <SurfaceConnectionsBlock surfaceData={surfaceQuery.data} theme={theme} />

            {/* Source Honesty Footnote */}
            <Text style={[styles.disclaimer, { color: theme.color.textMuted }]}>
              Source: Metrolinx Open Data, GTFS-RT. Composed from independently available regional endpoints. Unofficial transit reliability dashboard.
            </Text>
          </>
        ) : (
          <EmptyState
            title="Station not found"
            message="This station could not be found in the active catalog."
          />
        )}
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Helper Subcomponents
// ---------------------------------------------------------------------------

function FacilityPill({
  label,
  active,
  theme,
}: {
  label: string;
  active: boolean;
  theme: Theme;
}) {
  return (
    <View
      style={[
        styles.facilityPill,
        {
          backgroundColor: active ? theme.color.surfaceRaised : theme.color.surface,
          borderColor: theme.color.border,
        },
      ]}
    >
      <Text
        style={[
          styles.facilityPillText,
          { color: active ? theme.color.text : theme.color.textMuted },
        ]}
      >
        ✓ {label}
      </Text>
    </View>
  );
}

function TtcArrivalRow({
  arrival,
  theme,
}: {
  arrival: StationArrivalItem;
  theme: Theme;
}) {
  const isDue = arrival.minutes != null && arrival.minutes <= 0;
  const minuteText = isDue
    ? "Due"
    : arrival.minutes != null
      ? `${arrival.minutes} min`
      : "—";

  const clockTime = formatArrivalClockTime(arrival.predictedAt);

  return (
    <View
      style={[
        styles.arrivalRow,
        { borderColor: theme.color.border, backgroundColor: theme.color.surfaceRaised },
      ]}
    >
      <View style={styles.arrivalInfo}>
        <Text style={[styles.arrivalDirection, { color: theme.color.text }]}>
          {arrival.direction}
        </Text>
        <View style={styles.arrivalMetaRow}>
          <Text style={[styles.arrivalStatusTag, { color: theme.color.focus }]}>
            {arrival.status.toUpperCase()}
          </Text>
          {clockTime ? (
            <Text style={[styles.arrivalClock, { color: theme.color.textMuted }]}>
              · {clockTime}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.arrivalTiming}>
        <Text
          style={[
            styles.arrivalMinutes,
            { color: isDue ? theme.line.normal : theme.color.text },
          ]}
        >
          {minuteText}
        </Text>
      </View>
    </View>
  );
}

function RegionalArrivalRow({
  arrival,
  theme,
}: {
  arrival: RegionalArrivalItem;
  theme: Theme;
}) {
  const isDue = arrival.minutes <= 0;
  const minuteText = isDue ? "Due" : `${arrival.minutes} min`;
  const clockTime = formatArrivalClockTime(arrival.predictedAt || arrival.scheduledAt);

  return (
    <View
      style={[
        styles.arrivalRow,
        { borderColor: theme.color.border, backgroundColor: theme.color.surfaceRaised },
      ]}
    >
      <View style={styles.arrivalInfo}>
        <View style={styles.arrivalRouteRow}>
          <Text style={[styles.regionalLineCode, { color: theme.color.focus }]}>
            {arrival.lineNumber}
          </Text>
          <Text style={[styles.arrivalDirection, { color: theme.color.text }]}>
            {arrival.direction}
          </Text>
        </View>
        <View style={styles.arrivalMetaRow}>
          {arrival.platform ? (
            <Text style={[styles.platformText, { color: theme.color.textMuted }]}>
              {arrival.platform.startsWith("Platform")
                ? arrival.platform
                : `Platform ${arrival.platform}`}
            </Text>
          ) : (
            <Text style={[styles.platformText, { color: theme.color.textMuted }]}>
              Platform not assigned
            </Text>
          )}
          {arrival.coachCount ? (
            <Text style={[styles.coachText, { color: theme.color.textMuted }]}>
              · {arrival.coachCount} coaches
            </Text>
          ) : null}
          {arrival.delayMinutes > 0 ? (
            <Text style={[styles.delayBadgeText, { color: theme.line.delay }]}>
              · {arrival.delayMinutes}m Late
            </Text>
          ) : null}
          {clockTime ? (
            <Text style={[styles.arrivalClock, { color: theme.color.textMuted }]}>
              · {clockTime}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.arrivalTiming}>
        <Text
          style={[
            styles.arrivalMinutes,
            { color: isDue ? theme.line.normal : theme.color.text },
          ]}
        >
          {minuteText}
        </Text>
        <Text style={[styles.arrivalSourceTag, { color: theme.color.textMuted }]}>
          {arrival.status.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

function SurfaceConnectionsBlock({
  surfaceData,
  theme,
}: {
  surfaceData: SurfaceArrivalSnapshot | null | undefined;
  theme: Theme;
}) {
  if (!surfaceData || !surfaceData.arrivals || surfaceData.arrivals.length === 0) {
    return null;
  }

  const arrivals: SurfaceArrivalItem[] = surfaceData.arrivals;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.color.surface, borderColor: theme.color.border },
      ]}
    >
      <View style={styles.cardHeaderRow}>
        <Text style={[styles.sectionHeading, { color: theme.color.text }]}>
          Surface Connections
        </Text>
        <Text style={[styles.sourceBadgeText, { color: theme.color.textMuted }]}>
          {surfaceData.source || "GTFS-RT"}
        </Text>
      </View>

      <View style={styles.surfaceList}>
        {arrivals.map((conn, idx) => {
          const isDue = conn.minutes != null && conn.minutes <= 0;
          const minText = isDue
            ? "Due"
            : conn.minutes != null
              ? `${conn.minutes}m`
              : "—";

          return (
            <View
              key={`${conn.route}-${conn.tripId || idx}`}
              style={[
                styles.surfaceRow,
                { borderColor: theme.color.border, backgroundColor: theme.color.surfaceRaised },
              ]}
            >
              <View style={styles.surfaceRouteBadge}>
                <Text style={styles.surfaceRouteNumber}>{conn.route}</Text>
              </View>
              <View style={styles.surfaceInfo}>
                <Text style={[styles.surfaceDestination, { color: theme.color.text }]}>
                  {conn.destination || conn.routeName}
                </Text>
                <View style={styles.surfaceMetaRow}>
                  <Text style={[styles.surfaceModeText, { color: theme.color.textMuted }]}>
                    {conn.mode === "streetcar" ? "Streetcar" : "Bus"}
                  </Text>
                  {conn.bayPlatform ? (
                    <Text style={[styles.surfaceBayText, { color: theme.color.textMuted }]}>
                      · Bay {conn.bayPlatform}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Text
                style={[
                  styles.surfaceMinutes,
                  { color: isDue ? theme.line.normal : theme.color.text },
                ]}
              >
                {minText}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  backArrow: { fontSize: 20, fontWeight: "700", lineHeight: 20 },
  backText: { fontSize: 13, fontWeight: "700" },
  headerTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  card: { borderWidth: 1, borderRadius: 6, padding: 16, gap: 10 },
  stationTitle: { fontSize: 22, fontWeight: "900", lineHeight: 28 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  lineBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  lineBadgeText: { color: "#090909", fontSize: 12, fontWeight: "800" },
  interchangeBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  interchangeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  facilityGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  facilityPill: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  facilityPillText: { fontSize: 11, fontWeight: "600" },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionHeading: { fontSize: 16, fontWeight: "800" },
  sourceBadgeText: { fontSize: 11, fontWeight: "600" },
  disruptionBanner: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginBottom: 4,
  },
  disruptionBannerText: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  emptySectionText: { fontSize: 13, fontStyle: "italic" },
  arrivalList: { gap: 8 },
  arrivalRow: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  arrivalInfo: { flex: 1, gap: 2 },
  arrivalRouteRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  regionalLineCode: { fontSize: 12, fontWeight: "900" },
  arrivalDirection: { fontSize: 14, fontWeight: "700" },
  arrivalMetaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  arrivalStatusTag: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  arrivalClock: { fontSize: 12 },
  platformText: { fontSize: 12 },
  coachText: { fontSize: 12 },
  delayBadgeText: { fontSize: 12, fontWeight: "700" },
  arrivalTiming: { alignItems: "flex-end", gap: 2 },
  arrivalMinutes: { fontSize: 16, fontWeight: "900" },
  arrivalSourceTag: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  impactList: { gap: 8 },
  impactItem: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 6,
    padding: 12,
    gap: 4,
  },
  impactItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  impactTitle: { fontSize: 14, fontWeight: "800", flex: 1 },
  viewDetailsText: { fontSize: 12, fontWeight: "700" },
  impactSummary: { fontSize: 13, lineHeight: 18 },
  impactTime: { fontSize: 11 },
  accessStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  accessStatusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  accessSummary: { fontSize: 13, lineHeight: 18 },
  outageList: { gap: 6, marginTop: 4 },
  outageItem: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    gap: 2,
  },
  outageHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  outageTypeBadge: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  outageTitle: { fontSize: 13, fontWeight: "700", flex: 1 },
  outageDesc: { fontSize: 12, lineHeight: 16 },
  outageCause: { fontSize: 11, fontStyle: "italic" },
  noticeList: { gap: 6 },
  noticeItem: { borderWidth: 1, borderRadius: 6, padding: 10, gap: 2 },
  noticeCategory: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  noticeTitle: { fontSize: 13, fontWeight: "700" },
  noticeSummary: { fontSize: 12, lineHeight: 16 },
  surfaceList: { gap: 6 },
  surfaceRow: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  surfaceRouteBadge: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    minWidth: 36,
    alignItems: "center",
  },
  surfaceRouteNumber: { color: "#000000", fontSize: 12, fontWeight: "900" },
  surfaceInfo: { flex: 1, gap: 2 },
  surfaceDestination: { fontSize: 13, fontWeight: "700" },
  surfaceMetaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  surfaceModeText: { fontSize: 11 },
  surfaceBayText: { fontSize: 11 },
  surfaceMinutes: { fontSize: 14, fontWeight: "800" },
  disclaimer: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 4,
  },
});
