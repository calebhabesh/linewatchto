package com.calebhabesh.linewatch.regional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
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
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class MetrolinxAlertNormalizer {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final DateTimeFormatter METROLINX_DATE_TIME =
        DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss", Locale.CANADA);
    private static final Set<String> GO_REST_SOURCES = Set.of(
        MetrolinxSourceSystem.GO_SERVICE_ALERTS,
        MetrolinxSourceSystem.GO_INFORMATION_ALERTS,
        MetrolinxSourceSystem.GO_MARKETING_ALERTS
    );
    private static final Set<String> NO_SERVICE_EFFECTS = Set.of("NO_SERVICE", "STOP_CLOSED");
    private static final Set<String> DELAY_EFFECTS = Set.of(
        "SIGNIFICANT_DELAYS", "REDUCED_SERVICE"
    );
    private static final Set<String> MODIFIED_SERVICE_EFFECTS = Set.of(
        "MODIFIED_SERVICE", "DETOUR", "NO_EFFECT", "OTHER_EFFECT", "UNKNOWN_EFFECT"
    );
    private static final List<String> NO_SERVICE_PHRASES = List.of(
        "no go train service", "no train service", "no rail service", "service suspended",
        "service suspension", "all trips cancelled", "all trains cancelled", "trains are not running",
        "trains not running", "line closed", "planned closure", "rail service is closed"
    );
    private static final List<String> DELAY_PHRASES = List.of(
        "delay", "delayed", "later than usual", "holding", "operating slowly"
    );
    private static final List<String> TRIP_CANCELLATION_PHRASES = List.of(
        "train cancellation", "train cancelled", "train canceled",
        "train has been cancelled", "train has been canceled",
        "trip cancelled", "trip canceled"
    );
    private static final List<String> SERVICE_ADJUSTMENT_PHRASES = List.of(
        "service adjusted", "service adjustment", "service change", "modified service",
        "modified trip", "schedule adjustment"
    );
    private static final List<String> PLANNED_PHRASES = List.of(
        "planned", "scheduled service change", "this weekend", "due to construction"
    );
    private static final Pattern REST_NUMERIC_ID = Pattern.compile("(?i)^M0*(\\d+)$");
    private static final Pattern NUMERIC_ID = Pattern.compile("^0*(\\d+)$");
    private static final Pattern MAXIMUM_DELAY = Pattern.compile(
        "(?:delays? (?:of )?(?:up to|approximately|about)|up to)\\s+(\\d{1,3})\\s+minutes?",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern RAIL_REPLACED_BY_BUS = Pattern.compile(
        "(?:go )?buses? (?:will )?(?:replace|replaces|are replacing) "
            + "(?:all |the |up express )?trains?"
            + "|(?:all |the |up express )?trains? (?:will be|are|is) replaced by (?:go )?buses?",
        Pattern.CASE_INSENSITIVE
    );

    private final ObjectMapper objectMapper;
    private final Clock clock;

    public MetrolinxAlertNormalizer(Clock clock) {
        this(new ObjectMapper(), clock);
    }

    @Autowired
    public MetrolinxAlertNormalizer(ObjectMapper objectMapper, Clock clock) {
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    public List<RegionalNormalizedAlert> normalize(MetrolinxFeed feed) {
        return normalize(feed, classify(feed));
    }

    public List<RegionalNormalizedAlert> normalize(
        MetrolinxFeed feed,
        List<RegionalAlertClassification> classifications
    ) {
        List<RegionalNormalizedAlert> alerts = new ArrayList<>();
        for (RegionalAlertClassification classification : classifications) {
            List<RegionalAlertClassification.Impact> impacts = classification.impacts().isEmpty()
                ? List.of(new RegionalAlertClassification.Impact("main", classification.serviceEffect(),
                    classification.scope(), classification.spanStationIds(), classification.activePeriodStart(),
                    classification.activePeriodEnd(), classification.activePeriodBasis(), "legacy", null))
                : classification.impacts();
            for (RegionalAlertClassification.Impact impact : impacts) {
                if (impact.endExclusive() != null && !impact.endExclusive().isAfter(OffsetDateTime.now(clock))) continue;
                String impactKind = dashboardImpactKind(impact);
                if (impactKind == null) continue;
                for (String lineId : classification.lineIds()) {
                    RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(lineId).orElse(null);
                    if (route == null) continue;
                    List<String> scopedStations = scopedStations(classification, impact, route);
                    if ("segment-span".equals(impact.scope()) && scopedStations.size() != 2) continue;
                    if ("listed-stations".equals(impact.scope()) && scopedStations.isEmpty()) continue;
                    alerts.add(normalized(classification, impact, route, impactKind, scopedStations, feed.sourceUpdatedAt()));
                }
            }
        }
        return List.copyOf(alerts);
    }

    /** Returns all deterministically bucketed rail events, including conservative non-dashboard buckets. */
    public List<RegionalAlertClassification> classify(MetrolinxFeed feed) {
        Map<String, List<Evidence>> grouped = new LinkedHashMap<>();
        for (MetrolinxFetchedRecord record : feed.records()) {
            Evidence evidence = evidence(record);
            if (evidence == null) continue;
            grouped.computeIfAbsent(evidence.canonicalEventId(), ignored -> new ArrayList<>()).add(evidence);
        }
        return grouped.values().stream().map(this::classifyEvent)
            .filter(classification -> !classification.lineIds().isEmpty())
            .toList();
    }

    private Evidence evidence(MetrolinxFetchedRecord record) {
        if (GO_REST_SOURCES.contains(record.sourceSystem())) return restEvidence(record);
        if (MetrolinxSourceSystem.GO_GTFS_ALERTS.equals(record.sourceSystem())) return gtfsEvidence(record, false);
        if (MetrolinxSourceSystem.UP_GTFS_ALERTS.equals(record.sourceSystem())) return gtfsEvidence(record, true);
        return null;
    }

    private Evidence restEvidence(MetrolinxFetchedRecord record) {
        JsonNode message = parse(record.rawPayload());
        List<String> lineIds = values(message.path("Lines"), "Code").stream()
            .map(RegionalNetworkCatalog::lineIdForSourceCode)
            .flatMap(java.util.Optional::stream)
            .distinct()
            .toList();
        List<String> stationIds = values(message.path("Stops"), "Code").stream()
            .map(RegionalNetworkCatalog::stationIdForStopCode)
            .flatMap(java.util.Optional::stream)
            .distinct()
            .toList();
        String title = text(message, "SubjectEnglish");
        String description = text(message, "BodyEnglish");
        String category = text(message, "Category");
        String subcategory = text(message, "SubCategory");
        List<String> tripNumbers = values(message.path("Trips"), "TripNumber").stream()
            .filter(value -> !value.isBlank())
            .distinct()
            .toList();
        return new Evidence(
            canonicalEventId(record, lineIds.equals(List.of("regional-up"))),
            record, lineIds, stationIds, tripNumbers,
            title, description, category, subcategory, "", "",
            null, null, parseMetrolinxDateTime(text(message, "PostedDateTime")), List.of()
        );
    }

    private Evidence gtfsEvidence(MetrolinxFetchedRecord record, boolean upExpress) {
        JsonNode entity = parse(record.rawPayload());
        JsonNode alert = entity.path("alert");
        if (entity.path("is_deleted").asBoolean(false) || !alert.isObject()) return null;
        List<JsonNode> informedEntities = elements(alert.path("informed_entity"));
        List<String> lineIds = upExpress
            ? List.of("regional-up")
            : informedEntities.stream()
                .map(node -> lineIdFromGtfsRoute(text(node, "route_id")))
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        List<String> stationIds = informedEntities.stream()
            .map(node -> text(node, "stop_id"))
            .map(RegionalNetworkCatalog::stationIdForStopCode)
            .flatMap(java.util.Optional::stream)
            .distinct()
            .toList();
        List<JsonNode> periods = elements(alert.path("active_period"));
        OffsetDateTime startsAt = periods.stream().map(period -> epoch(period.get("start")))
            .filter(java.util.Objects::nonNull).min(OffsetDateTime::compareTo).orElse(null);
        OffsetDateTime endsAt = periods.stream().map(period -> epoch(period.get("end")))
            .filter(java.util.Objects::nonNull).max(OffsetDateTime::compareTo).orElse(null);
        return new Evidence(
            canonicalEventId(record, upExpress), record, lineIds, stationIds, List.of(),
            translation(alert.path("header_text"), ""), translation(alert.path("description_text"), ""),
            "", "", text(alert, "effect").toUpperCase(Locale.CANADA),
            text(alert, "cause").toUpperCase(Locale.CANADA), startsAt, endsAt, null,
            periods.stream().map(period -> new RegionalAlertTextDateParser.DateRange(
                epoch(period.get("start")), epoch(period.get("end")), 0, 0))
                .filter(period -> period.start() != null && period.endExclusive() != null
                    && period.endExclusive().isAfter(period.start())).toList()
        );
    }

    private RegionalAlertClassification classifyEvent(List<Evidence> evidence) {
        List<Evidence> ordered = evidence.stream().sorted(Comparator.comparingInt(this::sourcePriority)).toList();
        Evidence primary = ordered.getFirst();
        String title = firstValue(ordered, Evidence::title, "Regional service update");
        String description = trimRiderBoilerplate(firstValue(ordered, Evidence::description, title));
        List<String> lineIds = ordered.stream().flatMap(value -> value.lineIds().stream()).distinct().toList();
        List<String> tripNumbers = ordered.stream().flatMap(value -> value.tripNumbers().stream()).distinct().toList();
        List<String> structuredStations = ordered.stream().flatMap(value -> value.stationIds().stream()).distinct().toList();
        OffsetDateTime sourceStartsAt = ordered.stream().map(Evidence::startsAt).filter(java.util.Objects::nonNull)
            .min(OffsetDateTime::compareTo).orElse(null);
        OffsetDateTime sourceEndsAt = ordered.stream().map(Evidence::endsAt).filter(java.util.Objects::nonNull)
            .max(OffsetDateTime::compareTo).orElse(null);
        OffsetDateTime publishedAt = ordered.stream().map(Evidence::publishedAt).filter(java.util.Objects::nonNull)
            .min(OffsetDateTime::compareTo).orElse(null);
        String searchable = ordered.stream()
            .map(value -> String.join(" ", value.category(), value.subcategory(), value.effect(), value.cause(),
                value.title(), trimRiderBoilerplate(value.description())))
            .reduce("", (left, right) -> left + " " + right)
            .toLowerCase(Locale.CANADA);
        List<RegionalAlertTextDateParser.DateRange> titleDates = RegionalAlertTextDateParser.ranges(title, publishedAt);
        List<RegionalAlertTextDateParser.DateRange> bodyDates = RegionalAlertTextDateParser.ranges(description, publishedAt);
        RegionalAlertTextDateParser.DateRange textDateRange = !titleDates.isEmpty() ? titleDates.getFirst()
            : bodyDates.size() == 1 ? bodyDates.getFirst() : null;
        boolean textOverridesSourcePeriod = textDateRange != null;
        OffsetDateTime startsAt = textOverridesSourcePeriod ? textDateRange.start() : sourceStartsAt;
        OffsetDateTime endsAt = textOverridesSourcePeriod ? textDateRange.endExclusive() : sourceEndsAt;
        String activePeriodBasis = textOverridesSourcePeriod ? "text-date-range"
            : sourceStartsAt != null || sourceEndsAt != null ? "source-active-period" : "unknown";
        Set<String> effects = ordered.stream().map(Evidence::effect).filter(value -> !value.isBlank()).collect(
            java.util.stream.Collectors.toCollection(LinkedHashSet::new));
        boolean structuredTripCancellation = ordered.stream().anyMatch(value ->
            "train cancellation".equals(value.subcategory().trim().toLowerCase(Locale.CANADA))
        );

        boolean scheduleAnnouncement = !structuredTripCancellation
            && RegionalScheduleAnnouncement.matches(title, description);
        String serviceEffect = scheduleAnnouncement ? "service-adjustment"
            : serviceEffect(searchable, effects, structuredTripCancellation);
        String operatingChange = "trip-cancellation".equals(serviceEffect)
            ? "cancelled-trip"
            : searchable.contains("reduced speed") ? "reduced-speed" : null;
        String timing = startsAt == null
            ? (containsAny(searchable, PLANNED_PHRASES) ? "planned" : "unknown")
            : (startsAt.isAfter(OffsetDateTime.now(clock)) ? "planned"
                : endsAt != null && !endsAt.isAfter(OffsetDateTime.now(clock)) ? "ended" : "current");
        String cause = classifiedCause(searchable, ordered);
        String replacementService = replacementService(searchable);
        Integer maximumDelayMinutes = maximumDelay(searchable);
        List<String> disruptedSpan = disruptedSpanStations(description, lineIds);
        String lowerDescription = description.toLowerCase(Locale.CANADA);
        boolean continuingServiceClause = lowerDescription.contains("trains run")
            || lowerDescription.contains("trains operate")
            || lowerDescription.contains("service continues");
        List<String> spanStations = scheduleAnnouncement || "trip-cancellation".equals(serviceEffect)
            ? List.of()
            : !disruptedSpan.isEmpty() ? disruptedSpan
                : "no-service".equals(serviceEffect) && continuingServiceClause ? List.of()
                    : spanStations(searchable, lineIds);
        String scope = scheduleAnnouncement ? "corridor"
            : scope(searchable, serviceEffect, lineIds, structuredStations, spanStations);
        if ("no-service".equals(serviceEffect) && continuingServiceClause
            && disruptedSpan.isEmpty()) scope = "unknown";
        Map<String, String> stationRoles = stationRoles(
            searchable, lineIds, serviceEffect, scope, replacementService, structuredStations
        );

        Map<String, List<String>> fieldSources = new LinkedHashMap<>();
        addSources(fieldSources, "lineIds", ordered, value -> !value.lineIds().isEmpty());
        addSources(fieldSources, "tripNumbers", ordered, value -> !value.tripNumbers().isEmpty());
        addSources(fieldSources, "stationIds", ordered, value -> !value.stationIds().isEmpty());
        if (textOverridesSourcePeriod) {
            addSources(fieldSources, "serviceDateRange", ordered,
                value -> value.title().equals(title) || value.description().equals(description));
        } else {
            addSources(fieldSources, "activePeriod", ordered,
                value -> value.startsAt() != null || value.endsAt() != null);
        }
        addSources(fieldSources, "title", ordered, value -> !value.title().isBlank() && value.title().equals(title));
        addSources(fieldSources, "description", ordered, value -> !value.description().isBlank() && value.description().equals(description));
        addSources(fieldSources, "classification", ordered, value -> true);

        List<RegionalAlertClassification.Impact> impacts = impacts(
            title, description, serviceEffect, scope, spanStations, structuredStations,
            startsAt, endsAt, activePeriodBasis, titleDates, bodyDates, ordered, publishedAt
        );
        return new RegionalAlertClassification(
            primary.canonicalEventId(),
            ordered.stream().map(value -> new RegionalAlertClassification.SourceReference(
                value.record().sourceSystem(), value.record().sourceId())).toList(),
            lineIds, tripNumbers, timing, serviceEffect, operatingChange, scope, cause, replacementService,
            maximumDelayMinutes, title, description, startsAt, endsAt, activePeriodBasis,
            sourceStartsAt, sourceEndsAt, publishedAt,
            structuredStations, spanStations, Map.copyOf(stationRoles), Map.copyOf(fieldSources),
            primary.record().rawPayload(), impacts
        );
    }

    private String serviceEffect(
        String searchable,
        Set<String> effects,
        boolean structuredTripCancellation
    ) {
        // The rider-alert category identifies a single scheduled trip even if a correlated
        // GTFS alert uses the broader NO_SERVICE effect for that same train.
        if (structuredTripCancellation) {
            return "trip-cancellation";
        }
        if (effects.stream().anyMatch(NO_SERVICE_EFFECTS::contains)
            || containsAny(searchable, NO_SERVICE_PHRASES)
            || RAIL_REPLACED_BY_BUS.matcher(searchable).find()) {
            return "no-service";
        }
        if (containsAny(searchable, TRIP_CANCELLATION_PHRASES)) {
            return "trip-cancellation";
        }
        if (searchable.contains("reduced speed") || effects.stream().anyMatch(DELAY_EFFECTS::contains)
            || containsAny(searchable, DELAY_PHRASES)) {
            return "delay";
        }
        if (effects.stream().anyMatch(MODIFIED_SERVICE_EFFECTS::contains)
            || containsAny(searchable, SERVICE_ADJUSTMENT_PHRASES)) {
            return "service-adjustment";
        }
        return "unknown";
    }

    private String scope(
        String searchable,
        String serviceEffect,
        List<String> lineIds,
        List<String> structuredStations,
        List<String> spanStations
    ) {
        if ("trip-cancellation".equals(serviceEffect)) return "scheduled-trip";
        boolean corridorLanguage = searchable.contains("entire corridor")
            || searchable.contains("across the corridor")
            || searchable.contains("full route")
            || searchable.matches("(?s).*no (?:go )?train service on (?:the )?.+ line.*")
            || searchable.matches("(?s).*no (?:go )?train service (?:across|along) (?:the )?.+ line.*")
            || spansFullRoute(lineIds, spanStations);
        if (corridorLanguage) return "corridor";
        if (spanStations.size() == 2) return "segment-span";
        if (!structuredStations.isEmpty()) return "listed-stations";
        if ("delay".equals(serviceEffect) && searchable.contains("corridor")) return "corridor";
        return "unknown";
    }

    private boolean spansFullRoute(List<String> lineIds, List<String> spanStations) {
        if (spanStations.size() != 2) return false;
        Set<String> endpoints = Set.copyOf(spanStations);
        return lineIds.stream()
            .map(RegionalNetworkCatalog::route)
            .flatMap(java.util.Optional::stream)
            .anyMatch(route -> endpoints.equals(Set.of(route.stationIds().getFirst(), route.stationIds().getLast())));
    }

    private List<String> spanStations(String searchable, List<String> lineIds) {
        if (!(searchable.contains(" between ") || searchable.contains(" from "))) return List.of();
        List<String> mentioned = new ArrayList<>();
        for (String lineId : lineIds) {
            RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(lineId).orElse(null);
            if (route == null) continue;
            route.stationIds().stream()
                .sorted(Comparator.comparingInt(String::length).reversed())
                .filter(stationId -> stationMentioned(searchable, stationId))
                .sorted(Comparator.comparingInt(stationId -> stationMentionIndex(searchable, stationId)))
                .forEach(stationId -> {
                    if (!mentioned.contains(stationId)) mentioned.add(stationId);
                });
        }
        return mentioned.size() >= 2 ? List.of(mentioned.getFirst(), mentioned.getLast()) : List.of();
    }

    private List<String> disruptedSpanStations(String description, List<String> lineIds) {
        for (String clause : description.toLowerCase(Locale.CANADA).split("[.;\\n]")) {
            if (!(clause.contains("no service") || clause.contains("no go train service")
                || clause.contains("no train service") || clause.contains("closed between"))) continue;
            // A positive-service clause can mention the same endpoints. Only bind stations
            // in the clause that states the disruption.
            if (clause.contains("trains run") || clause.contains("trains operate")) continue;
            List<String> mentioned = mentionedStations(clause, lineIds);
            if (mentioned.size() >= 2) return List.of(mentioned.getFirst(), mentioned.get(1));
        }
        return List.of();
    }

    private List<String> mentionedStations(String clause, List<String> lineIds) {
        List<String> mentioned = new ArrayList<>();
        for (String lineId : lineIds) {
            RegionalNetworkCatalog.route(lineId).ifPresent(route -> route.stationIds().stream()
                .filter(stationId -> stationMentioned(clause, stationId))
                .forEach(stationId -> {
                    if (!mentioned.contains(stationId)) mentioned.add(stationId);
                }));
        }
        mentioned.sort(Comparator.comparingInt(stationId -> stationMentionIndex(clause, stationId)));
        return mentioned;
    }

    private List<RegionalAlertClassification.Impact> impacts(
        String title, String description, String serviceEffect, String scope,
        List<String> spanStations, List<String> structuredStations,
        OffsetDateTime startsAt, OffsetDateTime endsAt, String basis,
        List<RegionalAlertTextDateParser.DateRange> titleDates,
        List<RegionalAlertTextDateParser.DateRange> bodyDates,
        List<Evidence> evidence, OffsetDateTime publishedAt
    ) {
        List<RegionalAlertClassification.Impact> result = new ArrayList<>();
        List<RegionalAlertTextDateParser.DateRange> windows = new ArrayList<>();
        if (!titleDates.isEmpty()) windows.add(titleDates.getFirst());
        else if (bodyDates.size() == 1) windows.add(bodyDates.getFirst());
        else if (!bodyDates.isEmpty() && bodyDates.stream().allMatch(range ->
            range.start().equals(bodyDates.getFirst().start())
                && range.endExclusive().equals(bodyDates.getFirst().endExclusive()))) windows.add(bodyDates.getFirst());
        if (windows.isEmpty() && bodyDates.isEmpty() && "source-active-period".equals(basis)) {
            evidence.stream().flatMap(item -> item.periods().stream()).distinct()
                .sorted(Comparator.comparing(RegionalAlertTextDateParser.DateRange::start))
                .forEach(windows::add);
        }
        if (windows.isEmpty() && bodyDates.isEmpty() && startsAt != null && endsAt != null) {
            windows.add(new RegionalAlertTextDateParser.DateRange(startsAt, endsAt, 0, 0));
        }
        List<String> stations = "segment-span".equals(scope) ? spanStations : structuredStations;
        int index = 0;
        for (var window : windows) {
            result.add(new RegionalAlertClassification.Impact(
                "window-" + index++, serviceEffect, scope, stations, window.start(),
                window.endExclusive(), basis, "explicit service window", null
            ));
        }
        if (windows.isEmpty() && bodyDates.isEmpty() && (startsAt != null || endsAt != null)
            && ("no-service".equals(serviceEffect) || "delay".equals(serviceEffect))) {
            result.add(new RegionalAlertClassification.Impact("partial-window", serviceEffect,
                scope, stations, startsAt, endsAt, basis, "partial source period",
                startsAt == null ? "Start timing not verified" : "End timing not verified"));
        }
        if (result.isEmpty() && ("no-service".equals(serviceEffect) || "delay".equals(serviceEffect))) {
            result.add(new RegionalAlertClassification.Impact("timing-unknown", serviceEffect,
                scope, stations, null, null, "unknown", "notice wording", "Timing not verified"));
        }
        // The relative phrase identifies a possible earlier effect, but contains no hour.
        if (description.toLowerCase(Locale.CANADA).matches("(?s).*\\blate[ -]evening tonight\\b.*")) {
            var publicationDate = publishedAt == null ? null
                : publishedAt.atZoneSameInstant(TORONTO_ZONE).toLocalDate();
            result.add(new RegionalAlertClassification.Impact("late-evening", serviceEffect,
                scope, stations, null, publicationDate == null ? null
                    : publicationDate.plusDays(1).atStartOfDay(TORONTO_ZONE).toOffsetDateTime(),
                "relative-imprecise", "late-evening tonight",
                publishedAt == null ? "Publication time unavailable; timing uncertain"
                    : "Earlier start on " + publicationDate + "; exact time unknown"));
        }
        // A separate timetable clause is retained as linked classification evidence. It
        // remains a Service Notice and cannot extend the closure or create an overlay.
        for (var date : bodyDates) {
            boolean covered = windows.stream().anyMatch(window -> !date.start().isBefore(window.start())
                && !date.endExclusive().isAfter(window.endExclusive()));
            if (covered) continue;
            String nearby = description.substring(Math.max(0, date.from() - 70),
                Math.min(description.length(), date.to() + 110)).toLowerCase(Locale.CANADA);
            if (nearby.matches("(?s).*(?:schedule|timetable|adjust|resume|return).*")) {
                result.add(new RegionalAlertClassification.Impact("timetable-" + index++,
                    "service-adjustment", "corridor", List.of(), date.start(), date.endExclusive(),
                    "text-date-range", "timetable clause", null));
            } else {
                result.add(new RegionalAlertClassification.Impact("unresolved-" + index++,
                    serviceEffect, "unknown", List.of(), date.start(), date.endExclusive(),
                    "text-date-range", "unbound date clause", "Scope and effect uncertain"));
            }
        }
        return List.copyOf(result);
    }

    private boolean stationMentioned(String searchable, String stationId) {
        String name = RegionalNetworkCatalog.station(stationId).map(station -> station.name()).orElse(stationId);
        return stationPhraseIndex(searchable, name) >= 0
            || stationPhraseIndex(searchable, stationId.replace('-', ' ')) >= 0;
    }

    private int stationMentionIndex(String searchable, String stationId) {
        String name = RegionalNetworkCatalog.station(stationId).map(station -> station.name()).orElse(stationId);
        int nameIndex = stationPhraseIndex(searchable, name);
        int idIndex = stationPhraseIndex(searchable, stationId.replace('-', ' '));
        if (nameIndex < 0) return idIndex;
        return idIndex < 0 ? nameIndex : Math.min(nameIndex, idIndex);
    }

    private int stationPhraseIndex(String searchable, String phrase) {
        if (searchable == null || phrase == null || phrase.isBlank()) return -1;
        Matcher matcher = Pattern.compile(
            "(?<![\\p{L}\\p{N}])" + Pattern.quote(phrase.trim()) + "(?![\\p{L}\\p{N}])",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
        ).matcher(searchable);
        return matcher.find() ? matcher.start() : -1;
    }

    private RegionalNormalizedAlert normalized(
        RegionalAlertClassification classification,
        RegionalAlertClassification.Impact impact,
        RegionalNetworkCatalog.Route route,
        String impactKind,
        List<String> stationIds,
        OffsetDateTime sourceUpdatedAt
    ) {
        RegionalAlertClassification.SourceReference primary = classification.sources().getFirst();
        return new RegionalNormalizedAlert(
            "regional-" + safeId(classification.canonicalEventId()) + "-" + route.number().toLowerCase(Locale.CANADA)
                + ("window-0".equals(impact.id()) ? "" : "-" + impact.id()),
            primary.sourceSystem(), primary.sourceId(), route.id(), impactKind,
            EnglishClockTextFormatter.toTwelveHourClock(classification.title().trim()),
            "advisory".equals(impactKind)
                ? firstNonBlank(impact.uncertainty(), "Service timing or scope unverified")
                    + ". " + EnglishClockTextFormatter.toTwelveHourClock(classification.description().trim())
                : EnglishClockTextFormatter.toTwelveHourClock(classification.description().trim()),
            firstNonBlank(humanize(classification.cause()), "Metrolinx service update"),
            impact.start(), impact.endExclusive(), sourceUpdatedAt,
            stationIds, "advisory".equals(impactKind) || "unknown".equals(impact.scope())
                ? List.of() : RegionalNetworkCatalog.segmentIds(route.id(), stationIds),
            impact.basis(),
            classification.primaryRawPayload(), classification.replacementService(),
            classification.maximumDelayMinutes(), classification.publishedAt()
        );
    }

    private List<String> scopedStations(
        RegionalAlertClassification classification,
        RegionalAlertClassification.Impact impact,
        RegionalNetworkCatalog.Route route
    ) {
        List<String> candidates = switch (impact.scope()) {
            case "corridor" -> List.of();
            case "segment-span", "listed-stations" -> impact.stationIds();
            default -> List.of();
        };
        return List.copyOf(new LinkedHashSet<>(candidates.stream().filter(route.stationIds()::contains).toList()));
    }

    private Map<String, String> stationRoles(
        String searchable,
        List<String> lineIds,
        String serviceEffect,
        String scope,
        String replacementService,
        List<String> structuredStations
    ) {
        Map<String, String> roles = new LinkedHashMap<>();
        String structuredRole = "corridor".equals(scope) && "no-service".equals(serviceEffect)
            && replacementService != null ? "replacement-served" : "affected";
        structuredStations.forEach(stationId -> roles.put(stationId, structuredRole));
        if (replacementService == null) return roles;

        int marker = searchable.indexOf("not serve");
        if (marker < 0) marker = searchable.indexOf("except");
        if (marker < 0) return roles;
        String exclusionText = searchable.substring(marker);
        for (String lineId : lineIds) {
            RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(lineId).orElse(null);
            if (route == null) continue;
            route.stationIds().stream()
                .filter(stationId -> stationMentioned(exclusionText, stationId))
                .forEach(stationId -> roles.put(stationId, "replacement-excluded"));
        }
        return roles;
    }

    private String dashboardImpactKind(RegionalAlertClassification.Impact impact) {
        if ("service-adjustment".equals(impact.serviceEffect())
            || "trip-cancellation".equals(impact.serviceEffect())) return null;
        if (impact.uncertainty() != null || "unknown".equals(impact.scope())) return "advisory";
        if ("no-service".equals(impact.serviceEffect())) return "planned-closure";
        if ("delay".equals(impact.serviceEffect())) return "delay";
        return null;
    }

    private String canonicalEventId(MetrolinxFetchedRecord record, boolean upExpress) {
        Matcher rest = REST_NUMERIC_ID.matcher(record.sourceId());
        Matcher numeric = NUMERIC_ID.matcher(record.sourceId());
        String id;
        if (rest.matches()) id = rest.group(1);
        else if ((MetrolinxSourceSystem.GO_GTFS_ALERTS.equals(record.sourceSystem())
            || MetrolinxSourceSystem.UP_GTFS_ALERTS.equals(record.sourceSystem())) && numeric.matches()) {
            id = numeric.group(1);
        }
        else id = sourceAbbreviation(record.sourceSystem()) + "-" + safeId(record.sourceId());
        return (upExpress ? "up-" : "go-") + id;
    }

    private int sourcePriority(Evidence evidence) {
        return switch (evidence.record().sourceSystem()) {
            case MetrolinxSourceSystem.GO_SERVICE_ALERTS -> 0;
            case MetrolinxSourceSystem.GO_INFORMATION_ALERTS -> 1;
            case MetrolinxSourceSystem.GO_MARKETING_ALERTS -> 2;
            case MetrolinxSourceSystem.GO_GTFS_ALERTS, MetrolinxSourceSystem.UP_GTFS_ALERTS -> 3;
            default -> 0;
        };
    }

    private String sourceCause(List<Evidence> evidence) {
        return evidence.stream().map(Evidence::cause).filter(value -> !value.isBlank())
            .map(this::humanize).findFirst()
            .orElseGet(() -> evidence.stream().map(Evidence::subcategory).filter(value -> !value.isBlank())
                .findFirst().orElse(""));
    }

    private String classifiedCause(String searchable, List<Evidence> evidence) {
        if (searchable.contains("crew constraint")) return "crew constraints";
        if (searchable.contains("operational issue")) return "operational issue";
        if (searchable.contains("track condition")) return "track conditions";
        if (searchable.contains("construction")
            || evidence.stream().anyMatch(value -> "CONSTRUCTION".equals(value.cause()))) {
            return "construction";
        }
        return sourceCause(evidence);
    }

    private String trimRiderBoilerplate(String value) {
        if (value == null || value.isBlank()) return value == null ? "" : value.trim();
        String lower = value.toLowerCase(Locale.CANADA);
        int cutoff = lower.indexOf("subscribe to on the go alerts");
        if (cutoff < 0) cutoff = lower.indexOf("sign up for on the go alerts");
        return (cutoff < 0 ? value : value.substring(0, cutoff)).trim();
    }

    private String replacementService(String searchable) {
        if (searchable.contains("go buses replace") || searchable.contains("go bus service will replace")
            || searchable.contains("go buses will replace")) return "go-bus";
        if (searchable.contains("buses replace trains") || searchable.contains("bus service replaces train")) return "bus";
        return null;
    }

    private Integer maximumDelay(String searchable) {
        Matcher matcher = MAXIMUM_DELAY.matcher(searchable);
        return matcher.find() ? Integer.valueOf(matcher.group(1)) : null;
    }

    private String lineIdFromGtfsRoute(String routeId) {
        if (routeId == null || routeId.isBlank()) return null;
        String[] candidates = routeId.trim().toUpperCase(Locale.CANADA).split("[-_:]");
        for (int index = candidates.length - 1; index >= 0; index--) {
            String lineId = RegionalNetworkCatalog.lineIdForSourceCode(candidates[index]).orElse(null);
            if (lineId != null) return lineId;
        }
        return RegionalNetworkCatalog.lineIdForSourceCode(routeId).orElse(null);
    }

    private void addSources(
        Map<String, List<String>> target,
        String field,
        List<Evidence> evidence,
        java.util.function.Predicate<Evidence> predicate
    ) {
        List<String> sources = evidence.stream().filter(predicate)
            .map(value -> value.record().sourceSystem() + ":" + value.record().sourceId()).toList();
        if (!sources.isEmpty()) target.put(field, sources);
    }

    private String firstValue(
        List<Evidence> evidence,
        java.util.function.Function<Evidence, String> getter,
        String fallback
    ) {
        return evidence.stream().map(getter).filter(value -> value != null && !value.isBlank()).findFirst().orElse(fallback);
    }

    private boolean containsAny(String searchable, List<String> phrases) {
        return phrases.stream().anyMatch(searchable::contains);
    }

    private JsonNode parse(String rawPayload) {
        try {
            return objectMapper.readTree(rawPayload);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Unable to parse Metrolinx alert record", exception);
        }
    }

    private List<String> values(JsonNode array, String field) {
        return elements(array).stream().map(node -> text(node, field)).filter(value -> !value.isBlank()).toList();
    }

    private List<JsonNode> elements(JsonNode array) {
        if (array == null || !array.isArray()) return List.of();
        List<JsonNode> values = new ArrayList<>();
        array.forEach(values::add);
        return List.copyOf(values);
    }

    private String translation(JsonNode translatedString, String fallback) {
        List<JsonNode> translations = elements(translatedString.path("translation"));
        return translations.stream().filter(node -> "en".equalsIgnoreCase(text(node, "language")))
            .map(node -> text(node, "text")).filter(value -> !value.isBlank()).findFirst()
            .orElseGet(() -> translations.stream().map(node -> text(node, "text"))
                .filter(value -> !value.isBlank()).findFirst().orElse(fallback));
    }

    private OffsetDateTime parseMetrolinxDateTime(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            LocalDateTime local = LocalDateTime.parse(value.trim(), METROLINX_DATE_TIME);
            List<ZoneOffset> offsets = TORONTO_ZONE.getRules().getValidOffsets(local);
            return offsets.size() == 1 ? OffsetDateTime.of(local, offsets.getFirst()) : null;
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    private OffsetDateTime epoch(JsonNode value) {
        if (value == null || value.isNull() || !value.canConvertToLong()) return null;
        long seconds = value.asLong();
        return seconds <= 0 ? null : OffsetDateTime.ofInstant(Instant.ofEpochSecond(seconds), ZoneOffset.UTC);
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? "" : value.asText("").trim();
    }

    private String humanize(String value) {
        if (value == null || value.isBlank()) return "";
        String lower = value.toLowerCase(Locale.CANADA).replace('_', ' ');
        return Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
    }

    private String firstNonBlank(String first, String fallback) {
        return first == null || first.isBlank() ? fallback : first;
    }

    private String sourceAbbreviation(String sourceSystem) {
        return switch (sourceSystem) {
            case MetrolinxSourceSystem.GO_SERVICE_ALERTS -> "service";
            case MetrolinxSourceSystem.GO_INFORMATION_ALERTS -> "information";
            case MetrolinxSourceSystem.GO_MARKETING_ALERTS -> "marketing";
            case MetrolinxSourceSystem.GO_GTFS_ALERTS -> "gtfs";
            case MetrolinxSourceSystem.UP_GTFS_ALERTS -> "gtfs";
            default -> "source";
        };
    }

    private String safeId(String sourceId) {
        String sanitized = sourceId == null ? "unknown" : sourceId.replaceAll("[^A-Za-z0-9_-]", "-");
        return sanitized.isBlank() ? "unknown" : sanitized;
    }

    private record Evidence(
        String canonicalEventId,
        MetrolinxFetchedRecord record,
        List<String> lineIds,
        List<String> stationIds,
        List<String> tripNumbers,
        String title,
        String description,
        String category,
        String subcategory,
        String effect,
        String cause,
        OffsetDateTime startsAt,
        OffsetDateTime endsAt,
        OffsetDateTime publishedAt,
        List<RegionalAlertTextDateParser.DateRange> periods
    ) {}
}
