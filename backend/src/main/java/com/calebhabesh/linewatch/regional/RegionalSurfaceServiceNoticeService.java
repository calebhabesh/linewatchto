package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.regional.RegionalSurfaceServiceNoticeReadRepository.SourceRecord;
import com.calebhabesh.linewatch.surface.SurfaceServiceNoticeResponses.CategorySummary;
import com.calebhabesh.linewatch.surface.SurfaceServiceNoticeResponses.NoticeDetail;
import com.calebhabesh.linewatch.surface.SurfaceServiceNoticeResponses.StopDetail;
import com.calebhabesh.linewatch.surface.SurfaceServiceNoticeResponses.SurfaceServiceNoticesResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class RegionalSurfaceServiceNoticeService {
    private static final String SOURCE = "Metrolinx GO service notices";
    private static final List<String> CATEGORIES = List.of("service-change", "bypass", "detour", "no-service", "notice");
    private static final DateTimeFormatter SOURCE_TIME = DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss", Locale.CANADA);
    private static final ZoneId TORONTO = ZoneId.of("America/Toronto");

    private final RegionalSurfaceServiceNoticeReadRepository repository;
    private final RegionalIngestionFreshness freshness;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final MetrolinxProperties properties;

    public RegionalSurfaceServiceNoticeService(
        RegionalSurfaceServiceNoticeReadRepository repository,
        RegionalIngestionFreshness freshness,
        ObjectMapper objectMapper,
        Clock clock,
        MetrolinxProperties properties
    ) {
        this.repository = repository;
        this.freshness = freshness;
        this.objectMapper = objectMapper;
        this.clock = clock;
        this.properties = properties;
    }

    public SurfaceServiceNoticesResponse getSurfaceNotices(String categoryFilter, String query, Integer limit) {
        String category = validateCategory(categoryFilter);
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (!freshness.isFresh()) {
            return new SurfaceServiceNoticesResponse(now, false, SOURCE, List.of(), List.of());
        }

        Map<String, NoticeDetail> unique = new LinkedHashMap<>();
        repository.findActiveRecords(now.minus(properties.getMaxDashboardAge())).stream()
            .sorted(java.util.Comparator.comparingInt(record ->
                MetrolinxSourceSystem.GO_GTFS_ALERTS.equals(record.sourceSystem()) ? 1 : 0))
            .map(this::normalize)
            .filter(java.util.Objects::nonNull)
            .forEach(notice -> unique.putIfAbsent(notice.id(), notice));
        List<NoticeDetail> all = unique.values().stream()
            .sorted((left, right) -> compareTimes(right.updatedAt(), left.updatedAt()))
            .toList();
        Map<String, Integer> counts = new LinkedHashMap<>();
        CATEGORIES.forEach(value -> counts.put(value, 0));
        all.forEach(notice -> counts.computeIfPresent(notice.category(), (key, value) -> value + 1));
        List<CategorySummary> summaries = counts.entrySet().stream()
            .map(entry -> new CategorySummary(entry.getKey(), label(entry.getKey()), entry.getValue()))
            .toList();

        String search = query == null ? "" : query.trim().toLowerCase(Locale.CANADA);
        int resultLimit = limit == null ? 100 : Math.max(0, Math.min(limit, 250));
        List<NoticeDetail> notices = all.stream()
            .filter(notice -> category == null || category.equals(notice.category()))
            .filter(notice -> search.isBlank() || matches(notice, search))
            .limit(resultLimit)
            .toList();
        return new SurfaceServiceNoticesResponse(now, true, SOURCE, summaries, notices);
    }

    private NoticeDetail normalize(SourceRecord record) {
        try {
            JsonNode message = objectMapper.readTree(record.rawPayload());
            if (MetrolinxSourceSystem.GO_GTFS_ALERTS.equals(record.sourceSystem())) {
                return normalizeGtfsNotice(record, message);
            }
            String title = text(message, "SubjectEnglish");
            String description = text(message, "BodyEnglish");
            if (title.isBlank() && description.isBlank()) return null;
            if (MetrolinxSourceSystem.GO_SERVICE_ALERTS.equals(record.sourceSystem())
                && !RegionalScheduleAnnouncement.matches(title, description)) return null;
            List<String> routes = values(message.path("Lines"), "Code").stream()
                .map(this::canonicalRouteCode)
                .distinct()
                .toList();
            List<StopDetail> stops = elements(message.path("Stops")).stream()
                .map(stop -> {
                    String code = text(stop, "Code");
                    return new StopDetail(code, riderFacingStopName(code, text(stop, "Name")));
                })
                .filter(stop -> !stop.stopId().isBlank() || !stop.stopName().isBlank())
                .toList();
            String sourceId = firstNonBlank(text(message, "Code"), record.sourceId());
            boolean schedule = RegionalScheduleAnnouncement.matches(title, description);
            String searchable = String.join(" ", title, description, text(message, "SubCategory")).toLowerCase(Locale.CANADA);
            OffsetDateTime updatedAt = parseTime(text(message, "PostedDateTime"), record.lastSeenAt());
            return new NoticeDetail(
                "regional-notice-" + safeId(schedule ? noticeId(sourceId) : sourceId), schedule ? "service-change" : classify(searchable), "GO / UP", routes,
                EnglishClockTextFormatter.toTwelveHourClock(firstNonBlank(title, "Metrolinx notice")),
                EnglishClockTextFormatter.toTwelveHourClock(description),
                stops.stream().map(StopDetail::stopName).filter(value -> !value.isBlank()).distinct().reduce((a, b) -> a + " to " + b).orElse(""),
                stops.stream().map(StopDetail::stopId).filter(value -> !value.isBlank()).toList(), stops,
                null, firstNonBlank(text(message, "SubCategory"), text(message, "Category")),
                null, null, updatedAt, null, SOURCE
            );
        } catch (Exception ignored) {
            return null;
        }
    }

    private NoticeDetail normalizeGtfsNotice(SourceRecord record, JsonNode entity) {
        JsonNode alert = entity.path("alert");
        if (entity.path("is_deleted").asBoolean(false) || !alert.isObject()) return null;
        String title = translation(alert.path("header_text"), "GO service notice");
        String description = translation(alert.path("description_text"), title);
        boolean schedule = RegionalScheduleAnnouncement.matches(title, description)
            && elements(alert.path("informed_entity")).stream()
                .anyMatch(node -> railRouteCode(text(node, "route_id")) != null);
        List<String> routes = elements(alert.path("informed_entity")).stream()
            .map(node -> schedule ? railRouteCode(text(node, "route_id")) : busRouteId(text(node, "route_id")))
            .filter(java.util.Objects::nonNull)
            .distinct()
            .toList();
        if (routes.isEmpty()) return null;

        List<JsonNode> periods = elements(alert.path("active_period"));
        OffsetDateTime startsAt = periods.stream().map(period -> epoch(period.get("start")))
            .filter(java.util.Objects::nonNull).min(OffsetDateTime::compareTo).orElse(null);
        OffsetDateTime endsAt = periods.stream().map(period -> epoch(period.get("end")))
            .filter(java.util.Objects::nonNull).max(OffsetDateTime::compareTo).orElse(null);
        if (endsAt != null && !endsAt.isAfter(OffsetDateTime.now(clock))) return null;

        String effect = text(alert, "effect");
        String cause = firstNonBlank(humanize(text(alert, "cause")), humanize(effect));
        String searchable = String.join(" ", title, description, effect, cause).toLowerCase(Locale.CANADA);
        return new NoticeDetail(
            "regional-notice-" + safeId(schedule ? noticeId(record.sourceId()) : record.sourceId()), schedule ? "service-change" : classify(searchable), schedule ? "GO / UP" : "GO Bus", routes,
            EnglishClockTextFormatter.toTwelveHourClock(title),
            EnglishClockTextFormatter.toTwelveHourClock(description),
            "", List.of(), List.of(), null, cause,
            startsAt, endsAt, record.lastSeenAt(), null, SOURCE
        );
    }

    private String validateCategory(String value) {
        if (value == null || value.isBlank()) return null;
        String category = value.toLowerCase(Locale.CANADA);
        if (!Set.copyOf(CATEGORIES).contains(category)) throw new IllegalArgumentException("Invalid category: " + value);
        return category;
    }

    private String classify(String value) {
        if (value.contains("no train service") || value.contains("no bus service") || value.contains("trains not running")) return "no-service";
        if (value.contains("bypass")) return "bypass";
        if (value.contains("detour")) return "detour";
        if (value.contains("construction") || value.contains("service change") || value.contains("service adjustment") || value.contains("closed")) return "service-change";
        return "notice";
    }

    private boolean matches(NoticeDetail notice, String query) {
        return fields(notice).stream().filter(java.util.Objects::nonNull)
            .anyMatch(value -> value.toLowerCase(Locale.CANADA).contains(query));
    }

    private List<String> fields(NoticeDetail notice) {
        List<String> fields = new ArrayList<>(List.of(notice.title(), notice.description(), notice.location()));
        fields.addAll(notice.routeIds());
        notice.stops().forEach(stop -> { fields.add(stop.stopId()); fields.add(stop.stopName()); });
        return fields;
    }

    private int compareTimes(OffsetDateTime left, OffsetDateTime right) {
        if (left == null && right == null) return 0;
        if (left == null) return 1;
        if (right == null) return -1;
        return left.compareTo(right);
    }

    private String label(String category) {
        return switch (category) {
            case "service-change" -> "Service changes";
            case "bypass" -> "Bypasses";
            case "detour" -> "Detours";
            case "no-service" -> "No service";
            default -> "Notices";
        };
    }

    private OffsetDateTime parseTime(String value, OffsetDateTime fallback) {
        try {
            return value.isBlank() ? fallback : LocalDateTime.parse(value, SOURCE_TIME).atZone(TORONTO).toOffsetDateTime();
        } catch (DateTimeParseException ignored) {
            return fallback;
        }
    }

    private List<String> values(JsonNode array, String field) {
        return elements(array).stream().map(node -> text(node, field)).filter(value -> !value.isBlank()).distinct().toList();
    }

    private List<JsonNode> elements(JsonNode array) {
        if (array == null || !array.isArray()) return List.of();
        List<JsonNode> values = new ArrayList<>();
        array.forEach(values::add);
        return values;
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? "" : value.asText("").trim();
    }

    private String firstNonBlank(String first, String fallback) {
        return first == null || first.isBlank() ? fallback : first;
    }

    private String noticeId(String sourceId) {
        var matcher = java.util.regex.Pattern.compile("(?i)^M0*(\\d+)$").matcher(sourceId);
        return matcher.matches() ? matcher.group(1) : sourceId;
    }

    private String railRouteCode(String sourceRouteId) {
        String[] parts = sourceRouteId.toUpperCase(Locale.CANADA).split("[-_:]");
        String code = parts[parts.length - 1];
        return RegionalNetworkCatalog.lineIdForSourceCode(code)
            .flatMap(RegionalNetworkCatalog::route).map(RegionalNetworkCatalog.Route::number).orElse(null);
    }

    private String canonicalRouteCode(String sourceCode) {
        return RegionalNetworkCatalog.lineIdForSourceCode(sourceCode)
            .flatMap(RegionalNetworkCatalog::route)
            .map(RegionalNetworkCatalog.Route::number)
            .orElse(sourceCode);
    }

    private String busRouteId(String sourceRouteId) {
        if (sourceRouteId == null || sourceRouteId.isBlank()) return null;
        java.util.regex.Matcher matcher = java.util.regex.Pattern
            .compile("(?:^|[-_:])(\\d{1,3}[A-Za-z]?)$")
            .matcher(sourceRouteId.trim());
        return matcher.find() ? matcher.group(1).toUpperCase(Locale.CANADA) : null;
    }

    private OffsetDateTime epoch(JsonNode value) {
        if (value == null || !value.canConvertToLong()) return null;
        return OffsetDateTime.ofInstant(java.time.Instant.ofEpochSecond(value.asLong()), java.time.ZoneOffset.UTC);
    }

    private String translation(JsonNode translated, String fallback) {
        List<JsonNode> translations = elements(translated.path("translation"));
        return translations.stream()
            .filter(value -> "en".equalsIgnoreCase(text(value, "language")))
            .map(value -> text(value, "text"))
            .filter(value -> !value.isBlank())
            .findFirst()
            .orElseGet(() -> translations.stream().map(value -> text(value, "text"))
                .filter(value -> !value.isBlank()).findFirst().orElse(fallback));
    }

    private String humanize(String value) {
        if (value == null || value.isBlank()) return "";
        String normalized = value.trim().replace('_', ' ').toLowerCase(Locale.CANADA);
        return normalized.substring(0, 1).toUpperCase(Locale.CANADA) + normalized.substring(1);
    }

    private String riderFacingStopName(String stopCode, String sourceName) {
        if (sourceName != null && !sourceName.isBlank() && !sourceName.equalsIgnoreCase(stopCode)) {
            return sourceName;
        }
        return RegionalNetworkCatalog.stationIdForStopCode(stopCode)
            .flatMap(RegionalNetworkCatalog::station)
            .map(station -> station.name() + " GO")
            .orElse(firstNonBlank(sourceName, stopCode));
    }

    private String safeId(String value) {
        return value == null ? "unknown" : value.replaceAll("[^A-Za-z0-9_-]", "-");
    }
}
