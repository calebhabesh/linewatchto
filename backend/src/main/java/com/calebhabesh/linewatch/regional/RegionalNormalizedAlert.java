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
