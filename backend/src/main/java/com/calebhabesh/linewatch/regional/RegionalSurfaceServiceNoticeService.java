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
    private static final String SOURCE = "Metrolinx GO information + marketing alerts";
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

        List<NoticeDetail> all = repository.findActiveRecords(now.minus(properties.getMaxDashboardAge())).stream()
            .map(this::normalize)
            .filter(java.util.Objects::nonNull)
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
            String title = text(message, "SubjectEnglish");
            String description = text(message, "BodyEnglish");
            if (title.isBlank() && description.isBlank()) return null;
            List<String> routes = values(message.path("Lines"), "Code");
            List<StopDetail> stops = elements(message.path("Stops")).stream()
                .map(stop -> new StopDetail(text(stop, "Code"), firstNonBlank(text(stop, "Name"), text(stop, "Code"))))
                .filter(stop -> !stop.stopId().isBlank() || !stop.stopName().isBlank())
                .toList();
            String sourceId = firstNonBlank(text(message, "Code"), record.sourceId());
            String searchable = String.join(" ", title, description, text(message, "SubCategory")).toLowerCase(Locale.CANADA);
            OffsetDateTime updatedAt = parseTime(text(message, "PostedDateTime"), record.lastSeenAt());
            return new NoticeDetail(
                "regional-notice-" + safeId(sourceId), classify(searchable), "GO / UP", routes,
                firstNonBlank(title, "Metrolinx notice"), description,
                stops.stream().map(StopDetail::stopName).filter(value -> !value.isBlank()).distinct().reduce((a, b) -> a + " to " + b).orElse(""),
                stops.stream().map(StopDetail::stopId).filter(value -> !value.isBlank()).toList(), stops,
                null, firstNonBlank(text(message, "SubCategory"), text(message, "Category")),
                null, null, updatedAt, null, SOURCE
            );
        } catch (Exception ignored) {
            return null;
        }
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

    private String safeId(String value) {
        return value == null ? "unknown" : value.replaceAll("[^A-Za-z0-9_-]", "-");
    }
}
