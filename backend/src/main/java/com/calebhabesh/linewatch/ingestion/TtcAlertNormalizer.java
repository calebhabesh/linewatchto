package com.calebhabesh.linewatch.ingestion;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public class TtcAlertNormalizer {
    private static final Set<String> RAPID_TRANSIT_TYPES =
        Set.of("subway", "lrt", "rapid transit");
    private static final Set<String> ACCESSIBILITY_TYPES = Set.of("elevator", "escalator");
    private static final Map<String, String> LINE_IDS = Map.of(
        "1", "line-1",
        "2", "line-2",
        "4", "line-4",
        "5", "line-5",
        "6", "line-6"
    );
    private static final Pattern ACCESSIBILITY_STATION =
        Pattern.compile("^\\s*([^:]+):\\s+.+$");

    private final StationAliasResolver stationAliasResolver;
    private final AlertDirectionParser directionParser;
    private final GtfsRtRapidTransitStationResolver gtfsRtStationResolver;

    public TtcAlertNormalizer(
        StationAliasResolver stationAliasResolver,
        AlertDirectionParser directionParser,
        GtfsRtRapidTransitStationResolver gtfsRtStationResolver
    ) {
        this.stationAliasResolver = stationAliasResolver;
        this.directionParser = directionParser;
        this.gtfsRtStationResolver = gtfsRtStationResolver;
    }

    public NormalizationResult<NormalizedRouteAlert> normalizeRoute(TtcFetchedRecord fetched) {
        if (fetched == null || fetched.record() == null) {
            return NormalizationResult.unmatched();
        }

        TtcAlertRecord record = fetched.record();
        String routeType = lowercase(record.routeType());
        if (!RAPID_TRANSIT_TYPES.contains(routeType)) {
            return NormalizationResult.ignored();
        }

        String route = trimmed(record.route());
        if (isBlank(record.id()) || route == null || !LINE_IDS.containsKey(route)) {
            return NormalizationResult.unmatched();
        }

        String lineId = LINE_IDS.get(route);
        RouteStations stations = resolveRouteStations(record, lineId);
        Classification classification = classifyRoute(record);
        if (classification == null) {
            return NormalizationResult.unmatched();
        }

        List<NormalizedAlertPeriod> periods = normalizePeriods(record);
        OffsetDateTime activePeriodStart = activePeriodStart(record);
        OffsetDateTime activePeriodEnd = activePeriodEnd(record);
        String title = requiredTitle(record, "TTC service alert");
        String description = nullToEmpty(record.description());
        AlertDirection direction = directionParser.parse(
            record.direction(),
            record.title(),
            record.headerText(),
            record.description()
        );
        String fingerprint = fingerprint(
            classification,
            record,
            lineId,
            stations.stationIds(),
            periods,
            title,
            description,
            direction
        );
        NormalizedRouteAlert projection = new NormalizedRouteAlert(
            "ttc-route-" + record.id(),
            record.id(),
            lineId,
            classification.type(),
            classification.severity(),
            title,
            description,
            record.alertType(),
            record.effect(),
            record.effectDesc(),
            direction,
            record.cause(),
            record.causeDescription(),
            record.targetRemoval(),
            classification.impactKind(),
            record.rszLength(),
            record.distance(),
            record.trackPercent(),
            record.reducedSpeed(),
            record.averageSpeed(),
            stations.startStationId(),
            stations.endStationId(),
            activePeriodStart,
            activePeriodEnd,
            sourceTime(record, record.lastUpdated()),
            record.shuttleType(),
            record.shuttleStart(),
            record.shuttleEnd(),
            fetched.rawPayload(),
            stations.stationIds(),
            periods,
            fingerprint
        );

        return stations.unresolved()
            ? NormalizationResult.matchedWithUnresolved(projection)
            : NormalizationResult.matched(projection);
    }

    public NormalizationResult<NormalizedAccessibilityOutage> normalizeAccessibility(
        TtcFetchedRecord fetched
    ) {
        if (fetched == null || fetched.record() == null) {
            return NormalizationResult.unmatched();
        }

        TtcAlertRecord record = fetched.record();
        String assetType = lowercase(record.routeType());
        if (!ACCESSIBILITY_TYPES.contains(assetType)) {
            return NormalizationResult.ignored();
        }
        if (isBlank(record.id())) {
            return NormalizationResult.unmatched();
        }

        Matcher matcher = ACCESSIBILITY_STATION.matcher(nullToEmpty(record.headerText()));
        if (!matcher.matches()) {
            return NormalizationResult.unmatched();
        }
        Optional<String> stationId = stationAliasResolver.resolve(matcher.group(1));
        if (stationId.isEmpty()) {
            return NormalizationResult.unmatched();
        }

        String cause = record.causeDescription() != null && !record.causeDescription().isBlank()
            ? record.causeDescription()
            : "Technical issue";

        return NormalizationResult.matched(new NormalizedAccessibilityOutage(
            "ttc-accessibility-" + record.id(),
            record.id(),
            assetType,
            requiredTitle(record, "TTC accessibility outage"),
            nullToEmpty(record.description()),
            record.effect(),
            record.effectDesc(),
            cause,
            activePeriodStart(record),
            activePeriodEnd(record),
            sourceTime(record, record.lastUpdated()),
            fetched.rawPayload(),
            List.of(stationId.orElseThrow())
        ));
    }

    private Classification classifyRoute(TtcAlertRecord record) {
        if (isPlannedClosure(record)) {
            return new Classification(
                "planned-closure",
                "planned",
                AlertImpactKind.PLANNED_CLOSURE
            );
        }

        if (isSuspension(record)) {
            return new Classification("active-alert", "suspension", AlertImpactKind.SUSPENSION);
        }

        if (isReducedSpeedZone(record)) {
            return new Classification("active-alert", "delay", AlertImpactKind.REDUCED_SPEED_ZONE);
        }

        if (isDegradedService(record)) {
            return new Classification("active-alert", "delay", AlertImpactKind.DELAY);
        }

        return null;
    }

    private boolean isReducedSpeedZone(TtcAlertRecord record) {
        return equalsIgnoreCase(record.effectDesc(), "Reduced Speed Zone")
            || (isDegradedService(record) && hasRszMetadata(record));
    }

    private boolean isDegradedService(TtcAlertRecord record) {
        return equalsIgnoreCase(record.effect(), "SIGNIFICANT_DELAYS");
    }

    private boolean hasRszMetadata(TtcAlertRecord record) {
        return hasText(record.rszLength())
            || hasText(record.distance())
            || hasText(record.trackPercent())
            || hasText(record.reducedSpeed())
            || hasText(record.averageSpeed());
    }

    private boolean isPlannedClosure(TtcAlertRecord record) {
        boolean hasChildPeriods = record.childAlerts() != null && !record.childAlerts().isEmpty();
        boolean plannedClosureEvidence = hasChildPeriods
            || hasPlannedClosureEvidence(record)
            || (equalsIgnoreCase(record.cause(), "MAINTENANCE") && hasClosureText(record));
        return (equalsIgnoreCase(record.alertType(), "Planned") || isGtfsRt(record))
            && !hasOperationalIncidentCause(record)
            && plannedClosureEvidence;
    }

    private boolean isSuspension(TtcAlertRecord record) {
        return equalsIgnoreCase(record.effect(), "NO_SERVICE") || hasClosureText(record);
    }

    private boolean hasPlannedClosureEvidence(TtcAlertRecord record) {
        String text = sourceText(record);
        return text.contains("planned track work")
            || text.contains("planned closure")
            || text.contains("subway closure")
            || text.contains("lrt closure")
            || text.contains("early access")
            || text.contains("nightly")
            || text.contains("weekend closure");
    }

    private boolean hasOperationalIncidentCause(TtcAlertRecord record) {
        String text = sourceText(record);
        return text.contains("medical emergency")
            || text.contains("medical_emergency")
            || text.contains("security incident")
            || text.contains("security_incident")
            || text.contains("police")
            || text.contains("fire")
            || text.contains("collision")
            || text.contains("unauthorized")
            || text.contains("trespasser");
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private boolean hasClosureText(TtcAlertRecord record) {
        String text = sourceText(record);
        return text.contains("closure")
            || text.contains("no service")
            || text.contains("no subway service")
            || text.contains("no lrt service");
    }

    private String sourceText(TtcAlertRecord record) {
        return String.join(" ",
            nullToEmpty(record.title()),
            nullToEmpty(record.description()),
            nullToEmpty(record.headerText()),
            nullToEmpty(record.effectDesc()),
            nullToEmpty(record.cause()),
            nullToEmpty(record.causeDescription())
        ).toLowerCase(Locale.ROOT);
    }

    private ResolvedStation resolveStation(String stationName) {
        if (isBlank(stationName)) {
            return new ResolvedStation(Optional.empty(), false);
        }

        Optional<String> stationId = stationAliasResolver.resolve(stationName);
        return new ResolvedStation(stationId, stationId.isEmpty());
    }

    private RouteStations resolveRouteStations(TtcAlertRecord record, String lineId) {
        if (isGtfsRt(record)) {
            GtfsRtRapidTransitStationResolver.Resolution resolution =
                gtfsRtStationResolver.resolve(
                    lineId,
                    record.stopIDList() == null ? List.of() : record.stopIDList(),
                    sourceText(record)
                );
            return new RouteStations(
                resolution.startStationId(),
                resolution.endStationId(),
                resolution.stationIds(),
                resolution.unresolved()
            );
        }

        ResolvedStation startStation = resolveStation(record.stopStart());
        ResolvedStation endStation = resolveStation(record.stopEnd());
        ResolvedStations stations = resolveStations(
            record.stopIDList(),
            startStation,
            endStation
        );
        return new RouteStations(
            startStation.stationId().orElse(null),
            endStation.stationId().orElse(null),
            stations.stationIds(),
            startStation.unresolved() || endStation.unresolved() || stations.unresolved()
        );
    }

    private ResolvedStations resolveStations(
        List<String> stationNames,
        ResolvedStation startStation,
        ResolvedStation endStation
    ) {
        if (stationNames == null || stationNames.isEmpty()) {
            Set<String> routeBounds = new LinkedHashSet<>();
            startStation.stationId().ifPresent(routeBounds::add);
            endStation.stationId().ifPresent(routeBounds::add);
            return new ResolvedStations(List.copyOf(routeBounds), false);
        }

        Set<String> stationIds = new LinkedHashSet<>();
        boolean unresolved = false;
        for (String stationName : stationNames) {
            ResolvedStation station = resolveStation(stationName);
            station.stationId().ifPresent(stationIds::add);
            unresolved |= station.unresolved();
        }
        return new ResolvedStations(List.copyOf(stationIds), unresolved);
    }

    private List<NormalizedAlertPeriod> normalizePeriods(TtcAlertRecord record) {
        if (record.childAlerts() == null || record.childAlerts().isEmpty()) {
            return List.of(new NormalizedAlertPeriod(
                "parent",
                activePeriodStart(record),
                activePeriodEnd(record),
                0
            ));
        }

        List<NormalizedAlertPeriod> periods = new ArrayList<>();
        for (int index = 0; index < record.childAlerts().size(); index++) {
            TtcAlertChildPeriod child = record.childAlerts().get(index);
            if (child != null) {
                periods.add(new NormalizedAlertPeriod(
                    isBlank(child.id()) ? "child-" + index : child.id(),
                    sourceTime(record, child.startTime()),
                    sourceTime(record, child.endTime()),
                    index
                ));
            }
        }
        return List.copyOf(periods);
    }

    private OffsetDateTime sourceTime(TtcAlertRecord record, OffsetDateTime value) {
        if (isGtfsRt(record)) {
            OffsetDateTime normalized = TtcAlertTimes.nullIfSentinel(value);
            return normalized == null
                ? null
                : normalized.withOffsetSameInstant(ZoneOffset.UTC);
        }
        return TtcAlertTimes.sourceWallTimeToInstant(value);
    }

    private OffsetDateTime activePeriodStart(TtcAlertRecord record) {
        return record.activePeriod() == null
            ? null
            : sourceTime(record, record.activePeriod().start());
    }

    private OffsetDateTime activePeriodEnd(TtcAlertRecord record) {
        return record.activePeriod() == null
            ? null
            : sourceTime(record, record.activePeriod().end());
    }

    private boolean isGtfsRt(TtcAlertRecord record) {
        return equalsIgnoreCase(record.alertType(), "GTFS-RT");
    }

    private String fingerprint(
        Classification classification,
        TtcAlertRecord record,
        String lineId,
        List<String> stationIds,
        List<NormalizedAlertPeriod> periods,
        String title,
        String description,
        AlertDirection direction
    ) {
        return AlertFingerprint.sha256(String.join("|",
            classification.type(),
            classification.severity(),
            classification.impactKind().wireValue(),
            title,
            description,
            lineId,
            direction.wireValue(),
            String.join(",", stationIds),
            periods.toString(),
            nullToEmpty(record.shuttleType()),
            nullToEmpty(record.shuttleStart()),
            nullToEmpty(record.shuttleEnd()),
            nullToEmpty(record.targetRemoval()),
            nullToEmpty(record.rszLength()),
            nullToEmpty(record.distance()),
            nullToEmpty(record.trackPercent()),
            nullToEmpty(record.reducedSpeed()),
            nullToEmpty(record.averageSpeed())
        ));
    }

    private String lowercase(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private String trimmed(String value) {
        return value == null ? null : value.trim();
    }

    private boolean equalsIgnoreCase(String value, String expected) {
        return value != null && value.trim().equalsIgnoreCase(expected);
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private String requiredTitle(TtcAlertRecord record, String fallback) {
        if (!isBlank(record.title())) {
            return record.title();
        }
        return isBlank(record.headerText()) ? fallback : record.headerText();
    }

    private record Classification(String type, String severity, AlertImpactKind impactKind) {}

    private record ResolvedStation(Optional<String> stationId, boolean unresolved) {}

    private record ResolvedStations(List<String> stationIds, boolean unresolved) {}

    private record RouteStations(
        String startStationId,
        String endStationId,
        List<String> stationIds,
        boolean unresolved
    ) {}
}
