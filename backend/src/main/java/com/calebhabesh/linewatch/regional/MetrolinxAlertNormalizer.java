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
            if (classification.activePeriodEnd() != null
                && !classification.activePeriodEnd().isAfter(OffsetDateTime.now(clock))) continue;
            String impactKind = dashboardImpactKind(classification);
            if (impactKind == null || "unknown".equals(classification.scope())) continue;
            for (String lineId : classification.lineIds()) {
                RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(lineId).orElse(null);
                if (route == null) continue;
                List<String> scopedStations = scopedStations(classification, route);
                if ("segment-span".equals(classification.scope()) && scopedStations.size() != 2) continue;
                if ("listed-stations".equals(classification.scope()) && scopedStations.isEmpty()) continue;
                alerts.add(normalized(classification, route, impactKind, scopedStations, feed.sourceUpdatedAt()));
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
        return new Evidence(
            canonicalEventId(record), record, lineIds, stationIds,
            title, description, category, subcategory, "", "",
            null, null, parseMetrolinxDateTime(text(message, "PostedDateTime"))
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
            canonicalEventId(record), record, lineIds, stationIds,
            translation(alert.path("header_text"), ""), translation(alert.path("description_text"), ""),
            "", "", text(alert, "effect").toUpperCase(Locale.CANADA),
            text(alert, "cause").toUpperCase(Locale.CANADA), startsAt, endsAt, null
        );
    }

    private RegionalAlertClassification classifyEvent(List<Evidence> evidence) {
        List<Evidence> ordered = evidence.stream().sorted(Comparator.comparingInt(this::sourcePriority)).toList();
        Evidence primary = ordered.getFirst();
        String title = firstValue(ordered, Evidence::title, "Regional service update");
        String description = firstValue(ordered, Evidence::description, title);
        List<String> lineIds = ordered.stream().flatMap(value -> value.lineIds().stream()).distinct().toList();
        List<String> structuredStations = ordered.stream().flatMap(value -> value.stationIds().stream()).distinct().toList();
        OffsetDateTime sourceStartsAt = ordered.stream().map(Evidence::startsAt).filter(java.util.Objects::nonNull)
            .min(OffsetDateTime::compareTo).orElse(null);
        OffsetDateTime sourceEndsAt = ordered.stream().map(Evidence::endsAt).filter(java.util.Objects::nonNull)
            .max(OffsetDateTime::compareTo).orElse(null);
        OffsetDateTime publishedAt = ordered.stream().map(Evidence::publishedAt).filter(java.util.Objects::nonNull)
            .min(OffsetDateTime::compareTo).orElse(null);
        String searchable = ordered.stream()
            .map(value -> String.join(" ", value.category(), value.subcategory(), value.effect(), value.cause(),
                value.title(), value.description()))
            .reduce("", (left, right) -> left + " " + right)
            .toLowerCase(Locale.CANADA);
        RegionalAlertTextDateParser.DateRange textDateRange = RegionalAlertTextDateParser.parse(
            title + " " + description, publishedAt, clock
        );
        boolean textOverridesSourcePeriod = textDateRange != null && (
            sourceStartsAt == null || !sourceStartsAt.atZoneSameInstant(TORONTO_ZONE).toLocalDate()
                .equals(textDateRange.start().atZoneSameInstant(TORONTO_ZONE).toLocalDate())
        );
        OffsetDateTime startsAt = textOverridesSourcePeriod ? textDateRange.start() : sourceStartsAt;
        OffsetDateTime endsAt = textOverridesSourcePeriod ? textDateRange.endExclusive() : sourceEndsAt;
        String activePeriodBasis = textOverridesSourcePeriod ? "text-date-range"
            : sourceStartsAt != null || sourceEndsAt != null ? "source-active-period" : "unknown";
        Set<String> effects = ordered.stream().map(Evidence::effect).filter(value -> !value.isBlank()).collect(
            java.util.stream.Collectors.toCollection(LinkedHashSet::new));

        String serviceEffect = serviceEffect(searchable, effects);
        String operatingChange = searchable.contains("reduced speed") ? "reduced-speed" : null;
        String timing = startsAt == null
            ? (containsAny(searchable, PLANNED_PHRASES) ? "planned" : "current")
            : (startsAt.isAfter(OffsetDateTime.now(clock)) ? "planned" : "current");
        String cause = searchable.contains("construction") || ordered.stream().anyMatch(value -> "CONSTRUCTION".equals(value.cause()))
            ? "construction" : sourceCause(ordered);
        String replacementService = replacementService(searchable);
        Integer maximumDelayMinutes = maximumDelay(searchable);
        List<String> spanStations = spanStations(searchable, lineIds);
        String scope = scope(searchable, serviceEffect, structuredStations, spanStations);
        Map<String, String> stationRoles = stationRoles(
            searchable, lineIds, serviceEffect, scope, replacementService, structuredStations
        );

        Map<String, List<String>> fieldSources = new LinkedHashMap<>();
        addSources(fieldSources, "lineIds", ordered, value -> !value.lineIds().isEmpty());
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

        return new RegionalAlertClassification(
            primary.canonicalEventId(),
            ordered.stream().map(value -> new RegionalAlertClassification.SourceReference(
                value.record().sourceSystem(), value.record().sourceId())).toList(),
            lineIds, timing, serviceEffect, operatingChange, scope, cause, replacementService,
            maximumDelayMinutes, title, description, startsAt, endsAt, activePeriodBasis,
            sourceStartsAt, sourceEndsAt, publishedAt,
            structuredStations, spanStations, Map.copyOf(stationRoles), Map.copyOf(fieldSources),
            primary.record().rawPayload()
        );
    }

    private String serviceEffect(String searchable, Set<String> effects) {
        if (effects.stream().anyMatch(NO_SERVICE_EFFECTS::contains) || containsAny(searchable, NO_SERVICE_PHRASES)) {
            return "no-service";
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
        List<String> structuredStations,
        List<String> spanStations
    ) {
        boolean corridorLanguage = searchable.contains("entire corridor")
            || searchable.contains("across the corridor")
            || searchable.contains("full route")
            || searchable.matches("(?s).*no (?:go )?train service on (?:the )?.+ line.*")
            || searchable.matches("(?s).*no (?:go )?train service (?:across|along) (?:the )?.+ line.*");
        if (corridorLanguage) return "corridor";
        if (spanStations.size() == 2) return "segment-span";
        if (!structuredStations.isEmpty()) return "listed-stations";
        if ("delay".equals(serviceEffect) && searchable.contains("corridor")) return "corridor";
        return "unknown";
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
        RegionalNetworkCatalog.Route route,
        String impactKind,
        List<String> stationIds,
        OffsetDateTime sourceUpdatedAt
    ) {
        RegionalAlertClassification.SourceReference primary = classification.sources().getFirst();
        return new RegionalNormalizedAlert(
            "regional-" + safeId(classification.canonicalEventId()) + "-" + route.number().toLowerCase(Locale.CANADA),
            primary.sourceSystem(), primary.sourceId(), route.id(), impactKind,
            EnglishClockTextFormatter.toTwelveHourClock(classification.title().trim()),
            EnglishClockTextFormatter.toTwelveHourClock(classification.description().trim()),
            firstNonBlank(humanize(classification.cause()), "Metrolinx service update"),
            classification.activePeriodStart(), classification.activePeriodEnd(), sourceUpdatedAt,
            stationIds, RegionalNetworkCatalog.segmentIds(route.id(), stationIds),
            classification.activePeriodBasis(),
            classification.primaryRawPayload()
        );
    }

    private List<String> scopedStations(
        RegionalAlertClassification classification,
        RegionalNetworkCatalog.Route route
    ) {
        List<String> candidates = switch (classification.scope()) {
            case "corridor" -> List.of();
            case "segment-span" -> classification.spanStationIds();
            case "listed-stations" -> classification.stationIds();
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

    private String dashboardImpactKind(RegionalAlertClassification classification) {
        if ("no-service".equals(classification.serviceEffect())) {
            return "planned".equals(classification.timing()) ? "planned-closure" : "suspension";
        }
        if ("delay".equals(classification.serviceEffect()) && "current".equals(classification.timing())) {
            return "delay";
        }
        return null;
    }

    private String canonicalEventId(MetrolinxFetchedRecord record) {
        Matcher rest = REST_NUMERIC_ID.matcher(record.sourceId());
        Matcher numeric = NUMERIC_ID.matcher(record.sourceId());
        String id;
        if (rest.matches()) id = rest.group(1);
        else if (MetrolinxSourceSystem.GO_GTFS_ALERTS.equals(record.sourceSystem()) && numeric.matches()) id = numeric.group(1);
        else id = sourceAbbreviation(record.sourceSystem()) + "-" + safeId(record.sourceId());
        return (MetrolinxSourceSystem.UP_GTFS_ALERTS.equals(record.sourceSystem()) ? "up-" : "go-") + id;
    }

    private int sourcePriority(Evidence evidence) {
        return switch (evidence.record().sourceSystem()) {
            case MetrolinxSourceSystem.GO_SERVICE_ALERTS -> 0;
            case MetrolinxSourceSystem.GO_INFORMATION_ALERTS -> 1;
            case MetrolinxSourceSystem.GO_MARKETING_ALERTS -> 2;
            case MetrolinxSourceSystem.GO_GTFS_ALERTS -> 3;
            default -> 0;
        };
    }

    private String sourceCause(List<Evidence> evidence) {
        return evidence.stream().map(Evidence::cause).filter(value -> !value.isBlank())
            .map(this::humanize).findFirst()
            .orElseGet(() -> evidence.stream().map(Evidence::subcategory).filter(value -> !value.isBlank())
                .findFirst().orElse(""));
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
            return LocalDateTime.parse(value.trim(), METROLINX_DATE_TIME).atZone(TORONTO_ZONE).toOffsetDateTime();
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
        String title,
        String description,
        String category,
        String subcategory,
        String effect,
        String cause,
        OffsetDateTime startsAt,
        OffsetDateTime endsAt,
        OffsetDateTime publishedAt
    ) {}
}
