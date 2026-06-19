package com.calebhabesh.linewatch.ingestion;

import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleReadRepository;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleReadRepository.StationMapping;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public class GtfsRtRapidTransitStationResolver {
    private static final Pattern BETWEEN_BOUNDS = Pattern.compile(
        "\\bbetween\\s+(.+?)\\s+and\\s+(.+?)(?=\\s+stations?\\b|[.;]|$)",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern FROM_TO_BOUNDS = Pattern.compile(
        "\\bfrom\\s+(.+?)\\s+to\\s+(.+?)(?=\\s+stations?\\b|[.;]|$)",
        Pattern.CASE_INSENSITIVE
    );

    private final GtfsScheduleReadRepository scheduleRepository;
    private final StationAliasResolver stationAliasResolver;

    public GtfsRtRapidTransitStationResolver(
        GtfsScheduleReadRepository scheduleRepository,
        StationAliasResolver stationAliasResolver
    ) {
        this.scheduleRepository = scheduleRepository;
        this.stationAliasResolver = stationAliasResolver;
    }

    public Resolution resolve(String lineId, List<String> stopIds, String sourceText) {
        List<String> requestedStopIds = normalizedStopIds(stopIds);
        List<StationMapping> mappings = scheduleRepository.findActiveImportId()
            .filter(ignored -> !requestedStopIds.isEmpty())
            .map(importId -> scheduleRepository.findStationMappings(
                importId,
                lineId,
                requestedStopIds
            ))
            .orElseGet(List::of);

        List<StationMapping> orderedMappings = mappings.stream()
            .sorted(Comparator.comparingInt(StationMapping::sortOrder))
            .toList();
        Set<String> mappedStopIds = orderedMappings.stream()
            .map(StationMapping::stopId)
            .collect(java.util.stream.Collectors.toSet());
        boolean unresolvedStops = !mappedStopIds.containsAll(requestedStopIds);

        LinkedHashSet<String> mappedStationIds = new LinkedHashSet<>();
        orderedMappings.stream()
            .map(StationMapping::stationId)
            .forEach(mappedStationIds::add);

        String startStationId = mappedStationIds.isEmpty()
            ? null
            : mappedStationIds.getFirst();
        String endStationId = mappedStationIds.isEmpty()
            ? null
            : mappedStationIds.getLast();

        TextBounds textBounds = parseTextBounds(sourceText);
        if (textBounds != null) {
            if ((startStationId == null || unresolvedStops)
                && textBounds.startStationId() != null) {
                startStationId = textBounds.startStationId();
            }
            if ((endStationId == null || unresolvedStops)
                && textBounds.endStationId() != null) {
                endStationId = textBounds.endStationId();
            }
        }

        LinkedHashSet<String> stationIds = new LinkedHashSet<>();
        if (textBounds != null && (mappedStationIds.isEmpty() || unresolvedStops)) {
            addIfPresent(stationIds, startStationId);
            stationIds.addAll(mappedStationIds);
            addIfPresent(stationIds, endStationId);
        } else {
            stationIds.addAll(mappedStationIds);
        }

        boolean unresolved = unresolvedStops
            || startStationId == null
            || endStationId == null;
        return new Resolution(
            List.copyOf(stationIds),
            startStationId,
            endStationId,
            unresolved
        );
    }

    private List<String> normalizedStopIds(List<String> stopIds) {
        if (stopIds == null) {
            return List.of();
        }
        return stopIds.stream()
            .filter(value -> value != null && !value.isBlank())
            .map(String::trim)
            .distinct()
            .toList();
    }

    private TextBounds parseTextBounds(String sourceText) {
        if (sourceText == null || sourceText.isBlank()) {
            return null;
        }
        TextBounds bounds = matchBounds(BETWEEN_BOUNDS, sourceText);
        return bounds == null ? matchBounds(FROM_TO_BOUNDS, sourceText) : bounds;
    }

    private TextBounds matchBounds(Pattern pattern, String sourceText) {
        Matcher matcher = pattern.matcher(sourceText);
        if (!matcher.find()) {
            return null;
        }
        Optional<String> startStationId = stationAliasResolver.resolve(matcher.group(1).trim());
        Optional<String> endStationId = stationAliasResolver.resolve(matcher.group(2).trim());
        if (startStationId.isEmpty() && endStationId.isEmpty()) {
            return null;
        }
        return new TextBounds(startStationId.orElse(null), endStationId.orElse(null));
    }

    private void addIfPresent(Set<String> stationIds, String stationId) {
        if (stationId != null) {
            stationIds.add(stationId);
        }
    }

    private record TextBounds(String startStationId, String endStationId) {}

    public record Resolution(
        List<String> stationIds,
        String startStationId,
        String endStationId,
        boolean unresolved
    ) {}
}
