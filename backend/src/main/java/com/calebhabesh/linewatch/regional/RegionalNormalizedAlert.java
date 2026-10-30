package com.calebhabesh.linewatch.regional;

import java.time.OffsetDateTime;
import java.util.List;

public record RegionalNormalizedAlert(
    String id,
    String sourceSystem,
    String sourceId,
    String lineId,
    String impactKind,
    String title,
    String description,
    String cause,
    OffsetDateTime activePeriodStart,
    OffsetDateTime activePeriodEnd,
    OffsetDateTime sourceUpdatedAt,
    List<String> stationIds,
    List<String> affectedSegmentIds,
    String activePeriodBasis,
    String rawPayload,
    String replacementService,
    Integer maximumDelayMinutes,
    OffsetDateTime publishedAt
) {
    public RegionalNormalizedAlert(
        String id, String sourceSystem, String sourceId, String lineId, String impactKind,
        String title, String description, String cause, OffsetDateTime activePeriodStart,
        OffsetDateTime activePeriodEnd, OffsetDateTime sourceUpdatedAt, List<String> stationIds,
        List<String> affectedSegmentIds, String activePeriodBasis, String rawPayload,
        String replacementService, Integer maximumDelayMinutes
    ) {
        this(id, sourceSystem, sourceId, lineId, impactKind, title, description, cause,
            activePeriodStart, activePeriodEnd, sourceUpdatedAt, stationIds, affectedSegmentIds,
            activePeriodBasis, rawPayload, replacementService, maximumDelayMinutes, null);
    }

    public RegionalNormalizedAlert(
        String id, String sourceSystem, String sourceId, String lineId, String impactKind,
        String title, String description, String cause, OffsetDateTime activePeriodStart,
        OffsetDateTime activePeriodEnd, OffsetDateTime sourceUpdatedAt, List<String> stationIds,
        List<String> affectedSegmentIds, String activePeriodBasis, String rawPayload
    ) {
        this(id, sourceSystem, sourceId, lineId, impactKind, title, description, cause,
            activePeriodStart, activePeriodEnd, sourceUpdatedAt, stationIds, affectedSegmentIds,
            activePeriodBasis, rawPayload, null, null);
    }

    public RegionalNormalizedAlert(
        String id,
        String sourceSystem,
        String sourceId,
        String lineId,
        String impactKind,
        String title,
        String description,
        String cause,
        OffsetDateTime activePeriodStart,
        OffsetDateTime activePeriodEnd,
        OffsetDateTime sourceUpdatedAt,
        List<String> stationIds,
        List<String> affectedSegmentIds,
        String rawPayload
    ) {
        this(
            id, sourceSystem, sourceId, lineId, impactKind, title, description, cause,
            activePeriodStart, activePeriodEnd, sourceUpdatedAt, stationIds, affectedSegmentIds,
            "source-active-period", rawPayload
        );
    }

    public boolean hasDateOnlyServiceWindow() {
        return "text-date-range".equals(activePeriodBasis)
            && activePeriodStart != null
            && activePeriodEnd != null;
    }

    /** Closures at several listed stops that close no track between them. */
    public boolean listsStationClosures() {
        return !"advisory".equals(impactKind)
            && stationIds != null && stationIds.size() > 1
            && (affectedSegmentIds == null || affectedSegmentIds.isEmpty());
    }

    /**
     * Names each separately closed section ("Union ↔ Mount Dennis and Mount Pleasant ↔ Stratford"),
     * joining each section's end stations with {@code connector}. Null unless the alert's segments
     * form two or more separate stretches of its line.
     */
    public String sectionsLabel(java.util.function.BinaryOperator<String> connector) {
        List<List<String>> sections = RegionalSpans.sections(lineId, affectedSegmentIds);
        if (sections.size() < 2) return null;
        List<String> labels = sections.stream()
            .map(section -> connector.apply(stationName(section.getFirst()), stationName(section.getLast())))
            .toList();
        return String.join(", ", labels.subList(0, labels.size() - 1)) + " and " + labels.getLast();
    }

    private static String stationName(String stationId) {
        return RegionalNetworkCatalog.station(stationId).map(station -> station.name()).orElse(stationId);
    }

    /** Names each listed stop in route order ("Clarkson, Oakville & Burlington"), never as a span. */
    public String stationListLabel() {
        List<String> ordered = RegionalNetworkCatalog.route(lineId)
            .map(route -> route.stationIds().stream().filter(stationIds::contains).toList())
            .filter(ids -> !ids.isEmpty())
            .orElse(stationIds);
        List<String> names = ordered.stream()
            .map(id -> RegionalNetworkCatalog.station(id).map(station -> station.name()).orElse(id))
            .toList();
        if (names.size() < 2) return String.join("", names);
        return String.join(", ", names.subList(0, names.size() - 1)) + " & " + names.getLast();
    }
}
