package com.calebhabesh.linewatch.regional;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * Deterministic semantic buckets for one canonical Metrolinx rider event.
 *
 * <p>This is deliberately richer than {@link RegionalNormalizedAlert}. A classified event is only
 * projected into the dashboard when its service effect and topology scope are sufficiently clear.
 */
public record RegionalAlertClassification(
    String canonicalEventId,
    List<SourceReference> sources,
    List<String> lineIds,
    List<String> tripNumbers,
    String timing,
    String serviceEffect,
    String operatingChange,
    String scope,
    String cause,
    String replacementService,
    Integer maximumDelayMinutes,
    String title,
    String description,
    OffsetDateTime activePeriodStart,
    OffsetDateTime activePeriodEnd,
    String activePeriodBasis,
    OffsetDateTime sourceActivePeriodStart,
    OffsetDateTime sourceActivePeriodEnd,
    OffsetDateTime publishedAt,
    List<String> stationIds,
    List<String> spanStationIds,
    Map<String, String> stationRoles,
    Map<String, List<String>> fieldSources,
    @JsonIgnore String primaryRawPayload,
    List<Impact> impacts
) {
    public RegionalAlertClassification {
        tripNumbers = tripNumbers == null ? List.of() : List.copyOf(tripNumbers);
        impacts = impacts == null ? List.of() : List.copyOf(impacts);
    }

    public RegionalAlertClassification(
        String canonicalEventId, List<SourceReference> sources, List<String> lineIds,
        List<String> tripNumbers, String timing, String serviceEffect, String operatingChange,
        String scope, String cause, String replacementService, Integer maximumDelayMinutes,
        String title, String description, OffsetDateTime activePeriodStart,
        OffsetDateTime activePeriodEnd, String activePeriodBasis,
        OffsetDateTime sourceActivePeriodStart, OffsetDateTime sourceActivePeriodEnd,
        OffsetDateTime publishedAt, List<String> stationIds, List<String> spanStationIds,
        Map<String, String> stationRoles, Map<String, List<String>> fieldSources,
        String primaryRawPayload
    ) {
        this(canonicalEventId, sources, lineIds, tripNumbers, timing, serviceEffect,
            operatingChange, scope, cause, replacementService, maximumDelayMinutes, title,
            description, activePeriodStart, activePeriodEnd, activePeriodBasis,
            sourceActivePeriodStart, sourceActivePeriodEnd, publishedAt, stationIds,
            spanStationIds, stationRoles, fieldSources, primaryRawPayload, List.of());
    }

    /** Returns this event unchanged except that it also references the given source records. */
    public RegionalAlertClassification withAdditionalSources(List<SourceReference> additional) {
        List<SourceReference> combined = new java.util.ArrayList<>(sources);
        additional.stream().filter(source -> !combined.contains(source)).forEach(combined::add);
        return new RegionalAlertClassification(canonicalEventId, List.copyOf(combined), lineIds, tripNumbers,
            timing, serviceEffect, operatingChange, scope, cause, replacementService, maximumDelayMinutes,
            title, description, activePeriodStart, activePeriodEnd, activePeriodBasis,
            sourceActivePeriodStart, sourceActivePeriodEnd, publishedAt, stationIds, spanStationIds,
            stationRoles, fieldSources, primaryRawPayload, impacts);
    }

    /** Returns this event unchanged except for its canonical event ID. */
    public RegionalAlertClassification withCanonicalEventId(String eventId) {
        return new RegionalAlertClassification(eventId, sources, lineIds, tripNumbers,
            timing, serviceEffect, operatingChange, scope, cause, replacementService, maximumDelayMinutes,
            title, description, activePeriodStart, activePeriodEnd, activePeriodBasis,
            sourceActivePeriodStart, sourceActivePeriodEnd, publishedAt, stationIds, spanStationIds,
            stationRoles, fieldSources, primaryRawPayload, impacts);
    }

    public record Impact(
        String id, String serviceEffect, String scope, List<String> stationIds,
        OffsetDateTime start, OffsetDateTime endExclusive, String basis,
        String evidence, String uncertainty
    ) {
        public Impact {
            stationIds = stationIds == null ? List.of() : List.copyOf(stationIds);
        }
    }

    public record SourceReference(String sourceSystem, String sourceId) {
        public String key() {
            return sourceSystem + ":" + sourceId;
        }
    }
}
