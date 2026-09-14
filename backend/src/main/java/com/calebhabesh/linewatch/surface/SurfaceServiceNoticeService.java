package com.calebhabesh.linewatch.surface;

import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.surface.SurfaceServiceNoticeResponses.*;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class SurfaceServiceNoticeService {

    private final SurfaceServiceNoticeReadRepository repository;
    private final IngestionFreshness ingestionFreshness;
    private final Clock clock;

    public SurfaceServiceNoticeService(
        SurfaceServiceNoticeReadRepository repository,
        IngestionFreshness ingestionFreshness,
        Clock clock
    ) {
        this.repository = repository;
        this.ingestionFreshness = ingestionFreshness;
        this.clock = clock;
    }

    public SurfaceServiceNoticesResponse getSurfaceNotices(String categoryFilter, String query, Integer limit) {
        OffsetDateTime now = OffsetDateTime.now(clock);

        if (categoryFilter != null) {
            String lower = categoryFilter.toLowerCase();
            if (!Set.of("service-change", "bypass", "detour", "no-service", "notice").contains(lower)) {
                throw new IllegalArgumentException("Invalid category: " + categoryFilter);
            }
        }

        if (!ingestionFreshness.isDashboardFresh()) {
            return new SurfaceServiceNoticesResponse(
                now,
                false,
                "TTC Live Alerts + GTFS-RT",
                List.of(),
                List.of()
            );
        }

        List<SurfaceServiceNotice> activeNotices = synthesizeDisplayNotices(repository.findActiveNotices());

        // Calculate Category Summaries (unfiltered count)
        Map<String, Integer> categoryCounts = new LinkedHashMap<>();
        for (String cat : List.of("service-change", "bypass", "detour", "no-service", "notice")) {
            categoryCounts.put(cat, 0);
        }
        for (SurfaceServiceNotice notice : activeNotices) {
            String cat = notice.category().toLowerCase();
            categoryCounts.put(cat, categoryCounts.getOrDefault(cat, 0) + 1);
        }

        List<CategorySummary> summaries = new ArrayList<>();
        for (Map.Entry<String, Integer> entry : categoryCounts.entrySet()) {
            summaries.add(new CategorySummary(
                entry.getKey(),
                getCategoryLabel(entry.getKey()),
                entry.getValue()
            ));
        }

        // Apply category filter if requested
        List<SurfaceServiceNotice> filtered = activeNotices;
        if (categoryFilter != null) {
            String lowerCat = categoryFilter.toLowerCase();
            filtered = filtered.stream()
                .filter(n -> n.category().equalsIgnoreCase(lowerCat))
                .collect(Collectors.toList());
        }

        // Setup limit
        // Unfiltered dashboard reads must contain every notice for local route filtering and offline search.
        int finalLimit = Integer.MAX_VALUE;
        if (limit != null) {
            finalLimit = Math.min(limit, 250);
        }

        List<SurfaceServiceNotice> sortedResults;
        if (query != null && !query.isBlank()) {
            String lowerQuery = query.toLowerCase().trim();

            // Partition into route matches vs text matches
            List<SurfaceServiceNotice> routeMatches = new ArrayList<>();
            List<SurfaceServiceNotice> textMatches = new ArrayList<>();

            for (SurfaceServiceNotice notice : filtered) {
                if (isRouteMatch(notice, lowerQuery)) {
                    routeMatches.add(notice);
                } else if (isTextMatch(notice, lowerQuery)) {
                    textMatches.add(notice);
                }
            }

            // Sort both lists
            routeMatches.sort(this::compareNotices);
            textMatches.sort(this::compareNotices);

            sortedResults = new ArrayList<>();
            sortedResults.addAll(routeMatches);
            sortedResults.addAll(textMatches);
        } else {
            sortedResults = new ArrayList<>(filtered);
            sortedResults.sort(this::compareNotices);
        }

        // Map to response details and limit
        List<NoticeDetail> details = sortedResults.stream()
            .limit(finalLimit)
            .map(this::toNoticeDetail)
            .collect(Collectors.toList());

        return new SurfaceServiceNoticesResponse(
            now,
            true,
            "TTC Live Alerts + GTFS-RT",
            summaries,
            details
        );
    }

    private boolean isRouteMatch(SurfaceServiceNotice notice, String query) {
        if (notice.routeIds() == null) return false;
        for (String routeId : notice.routeIds()) {
            if (routeId.toLowerCase().startsWith(query)) {
                return true;
            }
        }
        return false;
    }

    private boolean isTextMatch(SurfaceServiceNotice notice, String query) {
        if (notice.title() != null && notice.title().toLowerCase().contains(query)) {
            return true;
        }
        if (notice.description() != null && notice.description().toLowerCase().contains(query)) {
            return true;
        }
        if (notice.headerText() != null && notice.headerText().toLowerCase().contains(query)) {
            return true;
        }
        if (getNoticeLocation(notice).toLowerCase().contains(query)) {
            return true;
        }
        if (notice.stops() != null) {
            for (SurfaceServiceNotice.StopDetail stop : notice.stops()) {
                if (stop.stopId().toLowerCase().contains(query) ||
                    (stop.stopName() != null && stop.stopName().toLowerCase().contains(query))) {
                    return true;
                }
            }
        }
        return false;
    }

    private int compareNotices(SurfaceServiceNotice a, SurfaceServiceNotice b) {
        // 1. Category rank
        int rankA = getCategoryRank(a.category());
        int rankB = getCategoryRank(b.category());
        int categoryComp = Integer.compare(rankA, rankB);
        if (categoryComp != 0) return categoryComp;

        // 2. Route numeric order
        int routeA = getLowestRouteNumber(a);
        int routeB = getLowestRouteNumber(b);
        int routeComp = Integer.compare(routeA, routeB);
        if (routeComp != 0) return routeComp;

        // 3. Source updated desc
        OffsetDateTime timeA = a.sourceUpdatedAt();
        OffsetDateTime timeB = b.sourceUpdatedAt();
        if (timeA == null && timeB == null) return a.id().compareTo(b.id());
        if (timeA == null) return 1;
        if (timeB == null) return -1;
        return timeB.compareTo(timeA);
    }

    private int getCategoryRank(String category) {
        if (category == null) return 6;
        return switch (category.toLowerCase()) {
            case "bypass" -> 1;
            case "no-service" -> 2;
            case "detour" -> 3;
            case "service-change" -> 4;
            case "notice" -> 5;
            default -> 6;
        };
    }

    private int getLowestRouteNumber(SurfaceServiceNotice notice) {
        if (notice.routeIds() == null || notice.routeIds().isEmpty()) {
            return Integer.MAX_VALUE;
        }
        int lowest = Integer.MAX_VALUE;
        for (String r : notice.routeIds()) {
            int parsed = parseRouteNumber(r);
            if (parsed < lowest) {
                lowest = parsed;
            }
        }
        return lowest;
    }

    private int parseRouteNumber(String routeId) {
        if (routeId == null || routeId.isBlank()) {
            return Integer.MAX_VALUE;
        }
        StringBuilder sb = new StringBuilder();
        for (char c : routeId.toCharArray()) {
            if (Character.isDigit(c)) {
                sb.append(c);
            } else {
                break; // Stop at first non-digit, e.g. 509A -> 509
            }
        }
        if (sb.length() > 0) {
            try {
                return Integer.parseInt(sb.toString());
            } catch (NumberFormatException e) {
                return Integer.MAX_VALUE;
            }
        }
        return Integer.MAX_VALUE;
    }

    private String getCategoryLabel(String category) {
        return switch (category.toLowerCase()) {
            case "service-change" -> "Service changes";
            case "bypass" -> "Bypasses";
            case "detour" -> "Detours";
            case "no-service" -> "No service";
            case "notice" -> "Notices";
            default -> category;
        };
    }

    private NoticeDetail toNoticeDetail(SurfaceServiceNotice notice) {
        List<SurfaceServiceNotice.StopDetail> displayStops = displayStops(notice);
        return new NoticeDetail(
            notice.id(),
            notice.category(),
            notice.routeType(),
            notice.routeIds(),
            notice.title(),
            notice.description(),
            getNoticeLocation(notice, displayStops),
            displayStops.stream().map(SurfaceServiceNotice.StopDetail::stopId).collect(Collectors.toList()),
            displayStops.stream()
                .map(stop -> new StopDetail(stop.stopId(), stop.stopName()))
                .collect(Collectors.toList()),
            displayDirection(notice),
            displayCause(notice),
            notice.activePeriodStart(),
            notice.activePeriodEnd(),
            notice.sourceUpdatedAt(),
            notice.url(),
            "TTC Live Alerts + GTFS-RT",
            false
        );
    }

    private List<SurfaceServiceNotice> synthesizeDisplayNotices(List<SurfaceServiceNotice> notices) {
        if (notices == null || notices.isEmpty()) {
            return List.of();
        }

        Map<NoticeMergeKey, List<SurfaceServiceNotice>> grouped = new LinkedHashMap<>();
        for (SurfaceServiceNotice notice : notices) {
            grouped.computeIfAbsent(NoticeMergeKey.from(notice), key -> new ArrayList<>()).add(notice);
        }

        List<SurfaceServiceNotice> synthesized = new ArrayList<>();
        for (List<SurfaceServiceNotice> group : grouped.values()) {
            synthesized.addAll(mergeStopIdAndNameVariants(group));
        }
        return synthesized.stream()
            .map(this::withPreciseRouteIds)
            .toList();
    }

    private SurfaceServiceNotice withPreciseRouteIds(SurfaceServiceNotice notice) {
        if (notice.routeIds() == null || notice.routeIds().isEmpty()) {
            return notice;
        }

        List<String> preciseRouteIds = SurfaceRouteLabeler.preciseRouteIds(
            notice.routeIds(),
            notice.title(),
            notice.headerText(),
            notice.description(),
            notice.url()
        );
        if (Objects.equals(preciseRouteIds, notice.routeIds())) {
            return notice;
        }

        return new SurfaceServiceNotice(
            notice.id(),
            notice.sourceId(),
            notice.category(),
            notice.routeType(),
            notice.title(),
            notice.description(),
            notice.headerText(),
            notice.url(),
            notice.effect(),
            notice.effectDescription(),
            notice.direction(),
            notice.cause(),
            notice.causeDescription(),
            notice.activePeriodStart(),
            notice.activePeriodEnd(),
            notice.sourceUpdatedAt(),
            notice.active(),
            notice.rawPayload(),
            preciseRouteIds,
            notice.stops()
        );
    }

    private List<SurfaceServiceNotice> mergeStopIdAndNameVariants(List<SurfaceServiceNotice> group) {
        if (group.size() < 2) {
            return group;
        }

        List<SurfaceServiceNotice> remaining = new ArrayList<>(group);
        List<SurfaceServiceNotice> synthesized = new ArrayList<>();

        boolean mergedPair;
        do {
            mergedPair = false;
            for (SurfaceServiceNotice numericNotice : new ArrayList<>(remaining)) {
                if (!hasOnlyNumericStops(numericNotice)) {
                    continue;
                }

                List<SurfaceServiceNotice> candidates = remaining.stream()
                    .filter(candidate -> candidate != numericNotice)
                    .filter(candidate -> canMergeStopIdAndNameVariants(numericNotice, candidate))
                    .toList();

                if (candidates.size() == 1) {
                    SurfaceServiceNotice namedNotice = candidates.getFirst();
                    synthesized.add(mergeStopIdAndNameVariant(numericNotice, namedNotice));
                    remaining.remove(numericNotice);
                    remaining.remove(namedNotice);
                    mergedPair = true;
                    break;
                }
            }
        } while (mergedPair);

        synthesized.addAll(remaining);
        return synthesized;
    }

    private boolean canMergeStopIdAndNameVariants(
        SurfaceServiceNotice numericNotice,
        SurfaceServiceNotice namedNotice
    ) {
        return hasMeaningfulStopNames(namedNotice)
            && directionsAreCompatible(List.of(numericNotice, namedNotice))
            && stopShapesAreCompatible(numericNotice, namedNotice)
            && !pairStopIdsWithNames(numericNotice.stops(), namedNotice.stops()).isEmpty();
    }

    private SurfaceServiceNotice mergeStopIdAndNameVariant(
        SurfaceServiceNotice numericNotice,
        SurfaceServiceNotice namedNotice
    ) {
        List<SurfaceServiceNotice.StopDetail> pairedStops = pairStopIdsWithNames(numericNotice.stops(), namedNotice.stops());

        OffsetDateTime sourceUpdatedAt = latest(List.of(numericNotice.sourceUpdatedAt(), namedNotice.sourceUpdatedAt()));
        String causeDescription = preferredCauseDescription(namedNotice, numericNotice);

        return new SurfaceServiceNotice(
            namedNotice.id(),
            namedNotice.sourceId(),
            namedNotice.category(),
            firstNonBlank(namedNotice.routeType(), numericNotice.routeType()),
            firstNonBlank(namedNotice.title(), numericNotice.title()),
            orEmpty(firstNonBlank(namedNotice.description(), numericNotice.description())),
            orEmpty(firstNonBlank(namedNotice.headerText(), numericNotice.headerText())),
            orEmpty(firstNonBlank(namedNotice.url(), numericNotice.url())),
            firstNonBlank(namedNotice.effect(), numericNotice.effect()),
            firstNonBlank(namedNotice.effectDescription(), numericNotice.effectDescription()),
            firstNonBlank(namedNotice.direction(), numericNotice.direction()),
            firstNonBlank(namedNotice.cause(), numericNotice.cause()),
            causeDescription,
            firstNonNull(namedNotice.activePeriodStart(), numericNotice.activePeriodStart()),
            firstNonNull(namedNotice.activePeriodEnd(), numericNotice.activePeriodEnd()),
            sourceUpdatedAt,
            namedNotice.active() || numericNotice.active(),
            firstNonBlank(namedNotice.rawPayload(), numericNotice.rawPayload(), "{}"),
            namedNotice.routeIds() != null && !namedNotice.routeIds().isEmpty() ? namedNotice.routeIds() : numericNotice.routeIds(),
            pairedStops
        );
    }

    private boolean stopShapesAreCompatible(SurfaceServiceNotice numericNotice, SurfaceServiceNotice namedNotice) {
        int numericStopCount = numericStopIds(numericNotice.stops()).size();
        int namedStopCount = meaningfulStopNames(namedNotice.stops()).size();
        if (numericStopCount == 0 || namedStopCount == 0) {
            return false;
        }
        if (numericStopCount == 1) {
            return namedStopCount == 1;
        }
        return namedStopCount >= 2;
    }

    private boolean directionsAreCompatible(List<SurfaceServiceNotice> notices) {
        Set<String> directions = new HashSet<>();
        for (SurfaceServiceNotice notice : notices) {
            String direction = notice.direction();
            if (direction != null && !direction.isBlank()) {
                directions.add(direction.trim().toLowerCase());
            }
        }
        return directions.size() <= 1;
    }

    private boolean hasOnlyNumericStops(SurfaceServiceNotice notice) {
        if (notice.stops() == null || notice.stops().isEmpty()) {
            return false;
        }
        return notice.stops().stream().allMatch(stop ->
            isNumeric(stop.stopId())
                && (stop.stopName() == null || stop.stopName().isBlank() || stop.stopName().equals(stop.stopId()))
        );
    }

    private boolean hasMeaningfulStopNames(SurfaceServiceNotice notice) {
        if (notice.stops() == null || notice.stops().isEmpty()) {
            return false;
        }
        return notice.stops().stream().anyMatch(stop -> hasMeaningfulStopName(stop.stopName()));
    }

    private boolean hasMeaningfulStopName(String value) {
        return value != null && !value.isBlank() && !isNumeric(value);
    }

    private boolean isNumeric(String value) {
        return value != null && value.matches("\\d+");
    }

    private List<SurfaceServiceNotice.StopDetail> pairStopIdsWithNames(
        List<SurfaceServiceNotice.StopDetail> numericStops,
        List<SurfaceServiceNotice.StopDetail> namedStops
    ) {
        List<String> numericStopIds = numericStopIds(numericStops);
        List<String> stopNames = meaningfulStopNames(namedStops);

        if (numericStopIds.isEmpty() || stopNames.isEmpty()) {
            return List.of();
        }

        if (numericStopIds.size() == stopNames.size()) {
            List<SurfaceServiceNotice.StopDetail> paired = new ArrayList<>();
            for (int i = 0; i < numericStopIds.size(); i++) {
                paired.add(new SurfaceServiceNotice.StopDetail(numericStopIds.get(i), stopNames.get(i)));
            }
            return paired;
        }

        if (stopNames.size() == 1) {
            return List.of(new SurfaceServiceNotice.StopDetail(numericStopIds.getFirst(), stopNames.getFirst()));
        }

        return List.of(
            new SurfaceServiceNotice.StopDetail(numericStopIds.getFirst(), stopNames.getFirst()),
            new SurfaceServiceNotice.StopDetail(numericStopIds.getLast(), stopNames.getLast())
        );
    }

    private List<String> numericStopIds(List<SurfaceServiceNotice.StopDetail> stops) {
        if (stops == null) {
            return List.of();
        }
        return stops.stream()
            .map(SurfaceServiceNotice.StopDetail::stopId)
            .filter(this::isNumeric)
            .toList();
    }

    private List<String> meaningfulStopNames(List<SurfaceServiceNotice.StopDetail> stops) {
        if (stops == null) {
            return List.of();
        }
        return stops.stream()
            .map(SurfaceServiceNotice.StopDetail::stopName)
            .filter(this::hasMeaningfulStopName)
            .distinct()
            .toList();
    }

    private List<SurfaceServiceNotice.StopDetail> displayStops(SurfaceServiceNotice notice) {
        if (notice.stops() == null || notice.stops().isEmpty()) {
            return List.of();
        }

        if (notice.stops().size() <= 2) {
            return notice.stops();
        }

        return List.of(notice.stops().getFirst(), notice.stops().getLast());
    }

    private String getNoticeLocation(SurfaceServiceNotice notice, List<SurfaceServiceNotice.StopDetail> displayStops) {
        if (displayStops == null || displayStops.isEmpty()) {
            return "";
        }

        List<String> stopNames = displayStops.stream()
            .map(this::displayStopName)
            .filter(name -> !name.isBlank())
            .distinct()
            .toList();

        if (stopNames.isEmpty()) {
            return "";
        }
        if (stopNames.size() == 1) {
            return stopNames.getFirst();
        }
        if (shouldUseEndpointLocation(notice)) {
            return stopNames.getFirst() + " to " + stopNames.getLast();
        }
        return String.join(", ", stopNames);
    }

    private boolean shouldUseEndpointLocation(SurfaceServiceNotice notice) {
        return notice.stops() != null
            && (notice.stops().size() > 2 || "no-service".equalsIgnoreCase(notice.category()));
    }

    private String displayStopName(SurfaceServiceNotice.StopDetail stop) {
        if (hasMeaningfulStopName(stop.stopName())) {
            return stop.stopName().trim();
        }
        if (isNumeric(stop.stopId())) {
            return "Stop " + stop.stopId();
        }
        return stop.stopId() == null ? "" : stop.stopId().trim();
    }

    private String getNoticeLocation(SurfaceServiceNotice notice) {
        return getNoticeLocation(notice, displayStops(notice));
    }

    private OffsetDateTime latest(List<OffsetDateTime> values) {
        OffsetDateTime latest = null;
        for (OffsetDateTime value : values) {
            if (value != null && (latest == null || value.isAfter(latest))) {
                latest = value;
            }
        }
        return latest;
    }

    private String preferredCauseDescription(SurfaceServiceNotice preferred, SurfaceServiceNotice fallback) {
        String preferredCause = preferred.causeDescription();
        if (preferredCause != null && !preferredCause.isBlank() && !isGenericCause(preferredCause)) {
            return preferredCause;
        }

        String fallbackCause = fallback.causeDescription();
        if (fallbackCause != null && !fallbackCause.isBlank() && !isGenericCause(fallbackCause)) {
            return fallbackCause;
        }

        return firstNonBlank(preferred.causeDescription(), fallback.causeDescription());
    }

    private boolean isGenericCause(String value) {
        String lower = value.trim().toLowerCase();
        return lower.equals("other cause") || lower.equals("other cause.");
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private OffsetDateTime firstNonNull(OffsetDateTime... values) {
        for (OffsetDateTime value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private String orEmpty(String value) {
        return value == null ? "" : value;
    }

    private record NoticeMergeKey(
        String category,
        String routeType,
        String routeIds,
        String effect,
        OffsetDateTime activePeriodStart,
        OffsetDateTime activePeriodEnd
    ) {
        static NoticeMergeKey from(SurfaceServiceNotice notice) {
            return new NoticeMergeKey(
                normalize(notice.category()),
                normalize(notice.routeType()),
                normalizeRouteIds(notice.routeIds()),
                normalize(notice.effect()),
                normalizeTime(notice.activePeriodStart()),
                normalizeTime(notice.activePeriodEnd())
            );
        }

        private static String normalize(String value) {
            return value == null ? "" : value.trim().toLowerCase();
        }

        private static String normalizeRouteIds(List<String> routeIds) {
            if (routeIds == null || routeIds.isEmpty()) {
                return "";
            }
            return routeIds.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(routeId -> !routeId.isEmpty())
                .sorted()
                .collect(Collectors.joining("/"));
        }

        private static OffsetDateTime normalizeTime(OffsetDateTime value) {
            return value == null ? null : value.truncatedTo(ChronoUnit.SECONDS);
        }
    }

    private String displayDirection(SurfaceServiceNotice notice) {
        if (notice.direction() != null && !notice.direction().isBlank()) {
            return notice.direction();
        }
        return null;
    }

    private String displayCause(SurfaceServiceNotice notice) {
        if (notice.causeDescription() != null && !notice.causeDescription().isBlank()) {
            return notice.causeDescription();
        }
        if (notice.cause() != null && !notice.cause().isBlank()) {
            return notice.cause();
        }
        return null;
    }
}
