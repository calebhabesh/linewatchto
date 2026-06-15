package com.calebhabesh.linewatch.surface;

import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.surface.SurfaceServiceNoticeResponses.*;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.OffsetDateTime;
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

        List<SurfaceServiceNotice> activeNotices = repository.findActiveNotices();

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
        int finalLimit = 100;
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
            .map(n -> new NoticeDetail(
                n.id(),
                n.category(),
                n.routeType(),
                n.routeIds(),
                n.title(),
                n.description(),
                getNoticeLocation(n),
                n.stops().stream().map(SurfaceServiceNotice.StopDetail::stopId).collect(Collectors.toList()),
                displayDirection(n),
                displayCause(n),
                n.activePeriodStart(),
                n.activePeriodEnd(),
                n.sourceUpdatedAt(),
                n.url(),
                "TTC Live Alerts + GTFS-RT"
            ))
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

    private String getNoticeLocation(SurfaceServiceNotice notice) {
        if (notice.stops() != null && !notice.stops().isEmpty()) {
            return notice.stops().stream()
                .map(SurfaceServiceNotice.StopDetail::stopName)
                .filter(Objects::nonNull)
                .filter(name -> !name.isBlank())
                .distinct()
                .collect(Collectors.joining(", "));
        }
        return "";
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
