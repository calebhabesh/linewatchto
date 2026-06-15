package com.calebhabesh.linewatch.accessibility;

import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.accessibility.AccessibilityOutageReadRepository.OutageRow;
import com.calebhabesh.linewatch.accessibility.AccessibilityOutageResponses.*;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class AccessibilityOutageService {

    private final AccessibilityOutageReadRepository repository;
    private final IngestionFreshness ingestionFreshness;
    private final Clock clock;

    public AccessibilityOutageService(
        AccessibilityOutageReadRepository repository,
        IngestionFreshness ingestionFreshness,
        Clock clock
    ) {
        this.repository = repository;
        this.ingestionFreshness = ingestionFreshness;
        this.clock = clock;
    }

    public AccessibilityOutagesResponse getAccessibilityOutages(String assetTypeFilter) {
        OffsetDateTime now = OffsetDateTime.now(clock);

        if (assetTypeFilter != null) {
            String lower = assetTypeFilter.toLowerCase();
            if (!lower.equals("elevator") && !lower.equals("escalator")) {
                throw new IllegalArgumentException("Invalid asset type: " + assetTypeFilter);
            }
        }

        if (!ingestionFreshness.isDashboardFresh()) {
            return new AccessibilityOutagesResponse(
                now,
                false,
                "TTC Live Alerts",
                List.of(),
                List.of()
            );
        }

        List<OutageRow> rows = repository.findActiveOutages(assetTypeFilter);

        // Group rows by line and station
        // We will build: Map<LineKey, Map<StationKey, List<OutageRow>>>
        Map<LineKey, Map<StationKey, List<OutageRow>>> hierarchical = new HashMap<>();

        for (OutageRow row : rows) {
            LineKey lk = new LineKey(
                row.lineId(),
                row.lineNumber(),
                row.lineName(),
                row.lineColor(),
                row.lineSortOrder()
            );
            StationKey sk = new StationKey(
                row.stationId(),
                row.stationName(),
                row.stationLineSortOrder()
            );

            hierarchical
                .computeIfAbsent(lk, k -> new HashMap<>())
                .computeIfAbsent(sk, k -> new ArrayList<>())
                .add(row);
        }

        // Build groups response
        List<LineGroup> groups = new ArrayList<>();
        for (Map.Entry<LineKey, Map<StationKey, List<OutageRow>>> lineEntry : hierarchical.entrySet()) {
            LineKey lk = lineEntry.getKey();
            List<StationGroup> stations = new ArrayList<>();

            for (Map.Entry<StationKey, List<OutageRow>> stationEntry : lineEntry.getValue().entrySet()) {
                StationKey sk = stationEntry.getKey();
                
                // Deduplicate outages within the same station-line (though DB unique constraint prevents duplication)
                Map<String, OutageDetail> dedupedOutages = new LinkedHashMap<>();
                for (OutageRow row : stationEntry.getValue()) {
                    dedupedOutages.putIfAbsent(row.id(), new OutageDetail(
                        row.id(),
                        row.assetType(),
                        row.title(),
                        row.description(),
                        row.cause(),
                        row.updatedAt(),
                        "TTC Live Alerts"
                    ));
                }

                List<OutageDetail> outageDetails = new ArrayList<>(dedupedOutages.values());
                // Sort outages by updatedAt desc, then id asc
                outageDetails.sort((a, b) -> {
                    int timeComp = b.updatedAt().compareTo(a.updatedAt());
                    if (timeComp != 0) return timeComp;
                    return a.id().compareTo(b.id());
                });

                stations.add(new StationGroup(
                    sk.id(),
                    sk.name(),
                    outageDetails.size(),
                    outageDetails
                ));
            }

            // Sort stations by stationLineSortOrder asc, then name asc
            stations.sort((a, b) -> {
                int sortOrderA = lineEntry.getValue().keySet().stream().filter(s -> s.id().equals(a.stationId())).findFirst().map(StationKey::sortOrder).orElse(0);
                int sortOrderB = lineEntry.getValue().keySet().stream().filter(s -> s.id().equals(b.stationId())).findFirst().map(StationKey::sortOrder).orElse(0);
                int orderComp = Integer.compare(sortOrderA, sortOrderB);
                if (orderComp != 0) return orderComp;
                return a.stationName().compareTo(b.stationName());
            });

            groups.add(new LineGroup(
                lk.id(),
                lk.number(),
                lk.name(),
                lk.color(),
                stations
            ));
        }

        // Sort LineGroups by lineSortOrder asc
        groups.sort(Comparator.comparingInt(lg -> {
            return hierarchical.keySet().stream().filter(lk -> lk.id().equals(lg.lineId())).findFirst().map(LineKey::sortOrder).orElse(0);
        }));

        // Build assetTypes summaries
        List<String> targetAssets = new ArrayList<>();
        if (assetTypeFilter == null) {
            targetAssets.add("elevator");
            targetAssets.add("escalator");
        } else {
            targetAssets.add(assetTypeFilter.toLowerCase());
        }

        List<AssetTypeSummary> assetTypes = new ArrayList<>();
        for (String asset : targetAssets) {
            List<LineSummary> lineSummaries = new ArrayList<>();
            int totalOutagesForAsset = 0;

            // Group by Line for this specific asset
            Map<LineKey, Set<String>> lineOutageIds = new HashMap<>();
            for (OutageRow row : rows) {
                if (row.assetType().equalsIgnoreCase(asset)) {
                    LineKey lk = new LineKey(
                        row.lineId(),
                        row.lineNumber(),
                        row.lineName(),
                        row.lineColor(),
                        row.lineSortOrder()
                    );
                    lineOutageIds.computeIfAbsent(lk, k -> new HashSet<>()).add(row.id());
                }
            }

            for (Map.Entry<LineKey, Set<String>> entry : lineOutageIds.entrySet()) {
                LineKey lk = entry.getKey();
                int count = entry.getValue().size();
                totalOutagesForAsset += count;
                lineSummaries.add(new LineSummary(
                    lk.id(),
                    lk.number(),
                    lk.name(),
                    lk.color(),
                    count
                ));
            }

            // Sort line summaries by lineSortOrder asc
            lineSummaries.sort(Comparator.comparingInt(LineSummary::count).reversed()
                .thenComparingInt(LineSummary::count)); // Wait, rule says: "Sort lines by line sort order: 1, 2, 4, 5, 6."
            // Ah! "Sort lines by line sort order: 1, 2, 4, 5, 6." Let's sort strictly by line sort order!
            lineSummaries.sort(Comparator.comparing(lg -> {
                return lineOutageIds.keySet().stream().filter(lk -> lk.id().equals(lg.lineId())).findFirst().map(LineKey::sortOrder).orElse(0);
            }));

            String label = asset.equalsIgnoreCase("elevator") ? "Elevator outages" : "Escalator outages";
            assetTypes.add(new AssetTypeSummary(
                asset,
                label,
                totalOutagesForAsset,
                lineSummaries
            ));
        }

        // Sort overview: elevator first, escalator second
        assetTypes.sort((a, b) -> {
            if (a.assetType().equals("elevator")) return -1;
            if (b.assetType().equals("elevator")) return 1;
            return 0;
        });

        return new AccessibilityOutagesResponse(
            now,
            true,
            "TTC Live Alerts",
            assetTypes,
            groups
        );
    }

    private record LineKey(String id, String number, String name, String color, int sortOrder) {
        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof LineKey lineKey)) return false;
            return id.equals(lineKey.id);
        }

        @Override
        public int hashCode() {
            return Objects.hash(id);
        }
    }

    private record StationKey(String id, String name, int sortOrder) {
        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof StationKey that)) return false;
            return id.equals(that.id);
        }

        @Override
        public int hashCode() {
            return Objects.hash(id);
        }
    }
}
