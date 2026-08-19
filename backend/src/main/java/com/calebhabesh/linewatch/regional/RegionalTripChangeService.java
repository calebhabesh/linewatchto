package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.regional.RegionalGtfsScheduleRepository.MatchedDeparture;
import com.calebhabesh.linewatch.regional.RegionalAlertStore.StoredClassification;
import com.calebhabesh.linewatch.regional.RegionalTripChangeOperationalRepository.OperationalRecord;
import com.calebhabesh.linewatch.regional.RegionalTripChangeResponses.AffectedStop;
import com.calebhabesh.linewatch.regional.RegionalTripChangeResponses.TripChange;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.calebhabesh.linewatch.station.StationResponses;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class RegionalTripChangeService {
    private static final String SOURCE = "Metrolinx GO trip-change feeds";
    private static final ZoneId TORONTO = ZoneId.of("America/Toronto");
    private static final Duration PAST_TOLERANCE = Duration.ofHours(1);
    private static final Duration FUTURE_HORIZON = Duration.ofHours(48);

    private final RegionalTripChangeOperationalRepository operationalRepository;
    private final RegionalAlertStore alertStore;
    private final RegionalGtfsScheduleRepository scheduleRepository;
    private final RegionalIngestionFreshness freshness;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final MetrolinxProperties properties;

    public RegionalTripChangeService(
        RegionalTripChangeOperationalRepository operationalRepository,
        RegionalAlertStore alertStore,
        RegionalGtfsScheduleRepository scheduleRepository,
        RegionalIngestionFreshness freshness,
        ObjectMapper objectMapper,
        Clock clock,
        MetrolinxProperties properties
    ) {
        this.operationalRepository = operationalRepository;
        this.alertStore = alertStore;
        this.scheduleRepository = scheduleRepository;
        this.freshness = freshness;
        this.objectMapper = objectMapper;
        this.clock = clock;
        this.properties = properties;
    }

    public RegionalTripChangeResponses.Response get(String stationId, String query, Integer limit) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (!freshness.isFresh()) {
            return new RegionalTripChangeResponses.Response(now, false, SOURCE, null, 0, List.of());
        }

        List<OperationalRecord> records = operationalRepository.findActiveRecords(now.minus(properties.getMaxDashboardAge()));
        List<StoredClassification> cancellationNotices = alertStore.findActiveClassifications(
            "trip-cancellation", now.minus(properties.getMaxDashboardAge())
        );
        Map<String, Accumulator> changes = new LinkedHashMap<>();
        for (OperationalRecord record : records) {
            parse(record, now).forEach(candidate -> merge(changes, candidate));
        }
        for (StoredClassification notice : cancellationNotices) {
            parseCancellationNotice(notice, now).forEach(candidate -> merge(changes, candidate));
        }
        suppressChangesDuplicatedByCancellation(changes);

        String stationFilter = normalize(stationId);
        String search = normalize(query);
        int resultLimit = limit == null ? 100 : Math.max(0, Math.min(limit, 250));
        List<TripChange> matching = changes.values().stream()
            .map(Accumulator::response)
            .filter(change -> stationFilter.isBlank() || change.affectedStops().stream()
                .anyMatch(stop -> normalize(stop.stationId()).equals(stationFilter)))
            .filter(change -> search.isBlank() || searchable(change).contains(search))
            .filter(change -> inDisplayWindow(change, now))
            .sorted(Comparator.comparing(TripChange::scheduledStartAt, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(TripChange::tripNumber))
            .toList();
        List<TripChange> visible = matching.stream()
            .limit(resultLimit)
            .toList();
        OffsetDateTime operationalUpdatedAt = records.stream().map(OperationalRecord::lastSeenAt)
            .filter(java.util.Objects::nonNull).max(OffsetDateTime::compareTo).orElse(null);
        OffsetDateTime noticeUpdatedAt = cancellationNotices.stream().map(StoredClassification::lastSeenAt)
            .filter(java.util.Objects::nonNull).max(OffsetDateTime::compareTo).orElse(null);
        OffsetDateTime updatedAt = latest(operationalUpdatedAt, noticeUpdatedAt);
        return new RegionalTripChangeResponses.Response(now, true, SOURCE, updatedAt, matching.size(), visible);
    }

    private List<Candidate> parseCancellationNotice(StoredClassification stored, OffsetDateTime now) {
        RegionalAlertClassification classification = stored.classification();
        LocalDate serviceDate = serviceDate(classification, now);
        List<String> identities = classification.tripNumbers().isEmpty()
            ? List.of(classification.canonicalEventId())
            : classification.tripNumbers();
        List<Candidate> candidates = new ArrayList<>();
        for (String identity : identities) {
            List<MatchedDeparture> schedule = confidentSchedule(identity, serviceDate);
            if (!schedule.isEmpty() && classification.lineIds().contains(schedule.getFirst().lineId())) {
                MatchedDeparture first = schedule.getFirst();
                MatchedDeparture last = schedule.getLast();
                String destination = RegionalNetworkCatalog.station(last.stationId())
                    .map(StationResponses.StationSummaryResponse::name)
                    .orElseGet(() -> cleanDestination(first.direction()));
                candidates.add(new Candidate(
                    "cancellation", first.tripId(), firstNonBlank(first.tripShortName(), identity),
                    first.lineId(), destination, first.serviceDate(), scheduledAt(first), stored.lastSeenAt(),
                    true, classification.title(), classification.description(), classification.cause(),
                    classification.sources().stream().map(RegionalAlertClassification.SourceReference::sourceSystem)
                        .distinct().toList(),
                    scheduleStops(schedule, "cancellation")
                ));
                continue;
            }
            for (String lineId : classification.lineIds()) {
                String destination = sourceDestination(classification, lineId);
                candidates.add(new Candidate(
                    "cancellation", "notice-" + classification.canonicalEventId() + "-" + identity, identity,
                    lineId, destination, serviceDate, null, stored.lastSeenAt(), false,
                    classification.title(), classification.description(), classification.cause(),
                    classification.sources().stream().map(RegionalAlertClassification.SourceReference::sourceSystem)
                        .distinct().toList(),
                    sourceStops(classification, lineId)
                ));
            }
        }
        return List.copyOf(candidates);
    }

    private List<Candidate> parse(OperationalRecord record, OffsetDateTime now) {
        try {
            JsonNode payload = objectMapper.readTree(record.rawPayload());
            if (MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES.equals(record.sourceSystem())) {
                return parseTripUpdate(record, payload, now);
            }
            if (MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS.equals(record.sourceSystem())) {
                return parseTrainException(record, payload, now);
            }
        } catch (Exception ignored) {
            // Operational rows that cannot be interpreted remain available for backend audit only.
        }
        return List.of();
    }

    private List<Candidate> parseTripUpdate(OperationalRecord record, JsonNode entity, OffsetDateTime now) {
        JsonNode update = entity.path("trip_update");
        JsonNode trip = update.path("trip");
        String tripId = text(trip, "trip_id");
        LocalDate serviceDate = serviceDate(text(trip, "start_date"), now);
        List<MatchedDeparture> schedule = confidentSchedule(tripId, serviceDate);
        if (schedule.isEmpty()) return List.of();

        List<Candidate> result = new ArrayList<>();
        String relationship = text(trip, "schedule_relationship").toUpperCase(Locale.CANADA);
        if (Set.of("CANCELED", "CANCELLED", "DELETED").contains(relationship)) {
            result.add(candidate("cancellation", record, schedule, scheduleStops(schedule, "cancellation")));
        }

        List<AffectedStop> skipped = new ArrayList<>();
        List<AffectedStop> added = new ArrayList<>();
        for (JsonNode stopUpdate : elements(update.path("stop_time_update"))) {
            String stopRelationship = text(stopUpdate, "schedule_relationship").toUpperCase(Locale.CANADA);
            Integer sequence = integer(stopUpdate.get("stop_sequence"));
            if ("SKIPPED".equals(stopRelationship)) {
                schedule.stream().filter(row -> sequence != null && sequence.equals(row.stopSequence()))
                    .findFirst().map(row -> affected(row, "skipped-stop")).ifPresent(skipped::add);
            } else if (Set.of("UNSCHEDULED", "ADDED").contains(stopRelationship)) {
                mappedAddedStop(stopUpdate, schedule, serviceDate).ifPresent(added::add);
            }
        }
        if (!skipped.isEmpty()) result.add(candidate("skipped-stop", record, schedule, skipped));
        if (!added.isEmpty()) result.add(candidate("added-stop", record, schedule, added));
        return result;
    }

    private List<Candidate> parseTrainException(OperationalRecord record, JsonNode trip, OffsetDateTime now) {
        String tripNumber = firstNonBlank(text(trip, "TripNumber"), record.sourceId());
        LocalDate serviceDate = serviceDate(firstNonBlank(
            text(trip, "ServiceDate"), firstNonBlank(text(trip, "TripDate"), text(trip, "StartDate"))
        ), now);
        List<MatchedDeparture> schedule = confidentSchedule(tripNumber, serviceDate);
        if (schedule.isEmpty()) return List.of();
        List<Candidate> result = new ArrayList<>();
        if (bool(trip, "IsCancelled") || bool(trip, "TripCancelled")) {
            result.add(candidate("cancellation", record, schedule, scheduleStops(schedule, "cancellation")));
        }

        List<AffectedStop> skipped = new ArrayList<>();
        List<AffectedStop> added = new ArrayList<>();
        for (JsonNode stop : exceptionStops(trip)) {
            String code = firstNonBlank(text(stop, "StopCode"), text(stop, "Code"));
            RegionalNetworkCatalog.stationIdForStopCode(code).ifPresent(stationId -> {
                schedule.stream().filter(row -> row.stationId().equals(stationId)).findFirst().ifPresent(row -> {
                    if (bool(stop, "IsCancelled") || bool(stop, "IsSkipped")) {
                        skipped.add(affected(row, "skipped-stop"));
                    }
                });
                if (bool(stop, "IsAdded") || bool(stop, "IsAdditional")) {
                    RegionalNetworkCatalog.station(stationId).ifPresent(station -> added.add(new AffectedStop(
                        station.id(), station.name(), "added-stop", null, ""
                    )));
                }
            });
        }
        if (!skipped.isEmpty()) result.add(candidate("skipped-stop", record, schedule, skipped));
        if (!added.isEmpty()) result.add(candidate("added-stop", record, schedule, added));
        return result;
    }

    private List<MatchedDeparture> confidentSchedule(String identity, LocalDate serviceDate) {
        List<MatchedDeparture> rows = scheduleRepository.findActiveTrip(identity, serviceDate);
        return rows.stream().map(MatchedDeparture::tripId).distinct().count() == 1 ? rows : List.of();
    }

    private Candidate candidate(
        String kind,
        OperationalRecord record,
        List<MatchedDeparture> schedule,
        List<AffectedStop> affectedStops
    ) {
        MatchedDeparture first = schedule.getFirst();
        MatchedDeparture last = schedule.getLast();
        String destination = RegionalNetworkCatalog.station(last.stationId())
            .map(StationResponses.StationSummaryResponse::name)
            .orElseGet(() -> cleanDestination(first.direction()));
        return new Candidate(
            kind, first.tripId(), firstNonBlank(first.tripShortName(), first.tripId()), first.lineId(),
            destination, first.serviceDate(), scheduledAt(schedule.getFirst()), record.lastSeenAt(),
            true, "", "", "", List.of(record.sourceSystem()), affectedStops
        );
    }

    private List<AffectedStop> sourceStops(RegionalAlertClassification classification, String lineId) {
        RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(lineId).orElse(null);
        if (route == null) return List.of();
        return classification.stationIds().stream()
            .filter(route.stationIds()::contains)
            .distinct()
            .map(stationId -> new AffectedStop(
                stationId,
                RegionalNetworkCatalog.station(stationId).map(StationResponses.StationSummaryResponse::name).orElse(stationId),
                "cancellation",
                null,
                ""
            ))
            .toList();
    }

    private String sourceDestination(RegionalAlertClassification classification, String lineId) {
        List<AffectedStop> stops = sourceStops(classification, lineId);
        return stops.isEmpty() ? "" : cleanDestination(stops.getLast().stationName());
    }

    private List<AffectedStop> scheduleStops(List<MatchedDeparture> schedule, String kind) {
        return schedule.stream().map(row -> affected(row, kind)).toList();
    }

    private AffectedStop affected(MatchedDeparture row, String kind) {
        String name = RegionalNetworkCatalog.station(row.stationId()).map(station -> station.name())
            .orElse(row.stationId());
        return new AffectedStop(row.stationId(), name, kind, scheduledAt(row), row.platform());
    }

    private java.util.Optional<AffectedStop> mappedAddedStop(
        JsonNode stopUpdate,
        List<MatchedDeparture> schedule,
        LocalDate serviceDate
    ) {
        String stopCode = text(stopUpdate, "stop_id");
        return RegionalNetworkCatalog.stationIdForStopCode(stopCode).flatMap(RegionalNetworkCatalog::station)
            .map(station -> new AffectedStop(
                station.id(), station.name(), "added-stop", eventTime(stopUpdate), ""
            ));
    }

    private OffsetDateTime eventTime(JsonNode stopUpdate) {
        for (String eventName : List.of("departure", "arrival")) {
            JsonNode event = stopUpdate.path(eventName);
            JsonNode epoch = event.get("time");
            if (epoch != null && epoch.canConvertToLong() && epoch.asLong() > 0) {
                return OffsetDateTime.ofInstant(Instant.ofEpochSecond(epoch.asLong()), ZoneOffset.UTC);
            }
        }
        return null;
    }

    private OffsetDateTime scheduledAt(MatchedDeparture row) {
        return row.serviceDate().atStartOfDay(TORONTO).plusSeconds(row.departureSeconds()).toOffsetDateTime();
    }

    private void merge(Map<String, Accumulator> changes, Candidate candidate) {
        String key = candidate.serviceDate() + ":" + candidate.tripId() + ":" + candidate.kind();
        changes.computeIfAbsent(key, ignored -> new Accumulator(candidate)).merge(candidate);
    }

    private void suppressChangesDuplicatedByCancellation(Map<String, Accumulator> changes) {
        Set<String> cancelledTrips = new LinkedHashSet<>();
        changes.values().stream().filter(value -> "cancellation".equals(value.kind))
            .forEach(value -> cancelledTrips.add(value.serviceDate + ":" + value.tripId));
        changes.entrySet().removeIf(entry -> {
            Accumulator value = entry.getValue();
            return !"cancellation".equals(value.kind)
                && cancelledTrips.contains(value.serviceDate + ":" + value.tripId);
        });
    }

    private boolean inDisplayWindow(TripChange change, OffsetDateTime now) {
        if (!change.scheduleMatched()) return true;
        OffsetDateTime first = change.affectedStops().stream().map(AffectedStop::scheduledAt)
            .filter(java.util.Objects::nonNull).min(OffsetDateTime::compareTo).orElse(change.scheduledStartAt());
        OffsetDateTime last = change.affectedStops().stream().map(AffectedStop::scheduledAt)
            .filter(java.util.Objects::nonNull).max(OffsetDateTime::compareTo).orElse(change.scheduledStartAt());
        return first != null && last != null
            && last.isAfter(now.minus(PAST_TOLERANCE))
            && first.isBefore(now.plus(FUTURE_HORIZON));
    }

    private LocalDate serviceDate(RegionalAlertClassification classification, OffsetDateTime now) {
        OffsetDateTime source = classification.activePeriodStart() != null
            ? classification.activePeriodStart()
            : classification.publishedAt();
        return (source == null ? now : source).atZoneSameInstant(TORONTO).toLocalDate();
    }

    private OffsetDateTime latest(OffsetDateTime first, OffsetDateTime second) {
        if (first == null) return second;
        if (second == null) return first;
        return first.isAfter(second) ? first : second;
    }

    private String searchable(TripChange change) {
        List<String> values = new ArrayList<>(List.of(
            change.tripId(), change.tripNumber(), change.lineId(), change.lineNumber(),
            change.lineName(), change.destination(), change.kind()
        ));
        change.affectedStops().forEach(stop -> {
            values.add(stop.stationId());
            values.add(stop.stationName());
        });
        return normalize(String.join(" ", values));
    }

    private List<JsonNode> exceptionStops(JsonNode trip) {
        JsonNode direct = trip.path("Stop");
        if (direct.isMissingNode() || direct.isNull()) direct = trip.path("Stops").path("Stop");
        return elements(direct);
    }

    private List<JsonNode> elements(JsonNode value) {
        if (value == null || value.isMissingNode() || value.isNull()) return List.of();
        if (!value.isArray()) return List.of(value);
        List<JsonNode> result = new ArrayList<>();
        value.forEach(result::add);
        return result;
    }

    private LocalDate serviceDate(String value, OffsetDateTime now) {
        if (value != null && !value.isBlank()) {
            String candidate = value.trim();
            for (DateTimeFormatter format : List.of(DateTimeFormatter.BASIC_ISO_DATE, DateTimeFormatter.ISO_LOCAL_DATE)) {
                try {
                    return LocalDate.parse(candidate, format);
                } catch (DateTimeParseException ignored) {
                    // Try the next source format.
                }
            }
            if (candidate.length() >= 10) {
                try {
                    return LocalDate.parse(candidate.substring(0, 10), DateTimeFormatter.ISO_LOCAL_DATE);
                } catch (DateTimeParseException ignored) {
                    // Fall through to the current Toronto service date.
                }
            }
        }
        return now.atZoneSameInstant(TORONTO).toLocalDate();
    }

    private boolean bool(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && (value.asBoolean(false) || "true".equalsIgnoreCase(value.asText("")));
    }

    private Integer integer(JsonNode value) {
        return value != null && value.canConvertToInt() ? value.asInt() : null;
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? "" : value.asText("").trim();
    }

    private String firstNonBlank(String first, String fallback) {
        return first == null || first.isBlank() ? fallback == null ? "" : fallback : first;
    }

    private String normalize(String value) {
        return value == null ? "" : value.toLowerCase(Locale.CANADA).trim();
    }

    private String cleanDestination(String raw) {
        if (raw == null || raw.isBlank()) return "";
        String cleaned = raw.replaceAll("(?i)^[A-Za-z]{1,4}\\s*-\\s*", "").trim();
        for (StationResponses.StationSummaryResponse station : RegionalNetworkCatalog.stations()) {
            if (station.name().equalsIgnoreCase(cleaned)
                || cleaned.equalsIgnoreCase(station.name() + " GO")
                || cleaned.equalsIgnoreCase(station.name() + " Station")
                || cleaned.equalsIgnoreCase(station.name() + " Station GO")
                || cleaned.equalsIgnoreCase(station.name() + " GO Station")) {
                return station.name();
            }
        }
        return cleaned.replaceAll("(?i)\\s+(GO(\\s+Station|\\s+Centre)?|Station)$", "").trim();
    }

    private record Candidate(
        String kind,
        String tripId,
        String tripNumber,
        String lineId,
        String destination,
        LocalDate serviceDate,
        OffsetDateTime scheduledStartAt,
        OffsetDateTime updatedAt,
        boolean scheduleMatched,
        String title,
        String description,
        String cause,
        List<String> sourceSystems,
        List<AffectedStop> affectedStops
    ) {}

    private static final class Accumulator {
        private final String kind;
        private final String tripId;
        private final String tripNumber;
        private final String lineId;
        private final String destination;
        private final LocalDate serviceDate;
        private final OffsetDateTime scheduledStartAt;
        private boolean scheduleMatched;
        private String title;
        private String description;
        private String cause;
        private OffsetDateTime updatedAt;
        private final Set<String> sourceSystems = new LinkedHashSet<>();
        private final Map<String, AffectedStop> affectedStops = new LinkedHashMap<>();

        private Accumulator(Candidate candidate) {
            kind = candidate.kind();
            tripId = candidate.tripId();
            tripNumber = candidate.tripNumber();
            lineId = candidate.lineId();
            destination = candidate.destination();
            serviceDate = candidate.serviceDate();
            scheduledStartAt = candidate.scheduledStartAt();
            scheduleMatched = candidate.scheduleMatched();
            title = candidate.title();
            description = candidate.description();
            cause = candidate.cause();
            merge(candidate);
        }

        private void merge(Candidate candidate) {
            sourceSystems.addAll(candidate.sourceSystems());
            scheduleMatched = scheduleMatched || candidate.scheduleMatched();
            if (title.isBlank() && !candidate.title().isBlank()) title = candidate.title();
            if (description.isBlank() && !candidate.description().isBlank()) description = candidate.description();
            if (cause.isBlank() && !candidate.cause().isBlank()) cause = candidate.cause();
            if (updatedAt == null || candidate.updatedAt() != null && candidate.updatedAt().isAfter(updatedAt)) {
                updatedAt = candidate.updatedAt();
            }
            candidate.affectedStops().forEach(stop -> affectedStops.putIfAbsent(
                stop.stationId() + ":" + stop.kind(), stop
            ));
        }

        private TripChange response() {
            RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(lineId).orElse(null);
            String number = route == null ? "GO" : route.number();
            String name = route == null ? "GO Train" : route.name();
            return new TripChange(
                "regional-trip-change-" + serviceDate + "-" + tripId.replaceAll("[^A-Za-z0-9_-]", "-") + "-" + kind,
                kind, tripId, tripNumber, lineId, number, name, destination, serviceDate,
                scheduledStartAt, updatedAt, scheduleMatched, title, description, cause,
                List.copyOf(sourceSystems), List.copyOf(affectedStops.values())
            );
        }
    }
}
