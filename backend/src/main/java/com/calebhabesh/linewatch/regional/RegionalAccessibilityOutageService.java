package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.accessibility.AccessibilityOutageResponses.AccessibilityOutagesResponse;
import com.calebhabesh.linewatch.accessibility.AccessibilityOutageResponses.AssetTypeSummary;
import com.calebhabesh.linewatch.accessibility.AccessibilityOutageResponses.LineGroup;
import com.calebhabesh.linewatch.accessibility.AccessibilityOutageResponses.LineSummary;
import com.calebhabesh.linewatch.accessibility.AccessibilityOutageResponses.OutageDetail;
import com.calebhabesh.linewatch.accessibility.AccessibilityOutageResponses.StationGroup;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class RegionalAccessibilityOutageService {
    private static final String SOURCE = "Metrolinx Open API";

    private final RegionalAccessibilityOutageReadRepository repository;
    private final RegionalAccessibilityOutageNormalizer normalizer;
    private final RegionalIngestionFreshness freshness;
    private final Clock clock;

    public RegionalAccessibilityOutageService(
        RegionalAccessibilityOutageReadRepository repository,
        RegionalAccessibilityOutageNormalizer normalizer,
        RegionalIngestionFreshness freshness,
        Clock clock
    ) {
        this.repository = repository;
        this.normalizer = normalizer;
        this.freshness = freshness;
        this.clock = clock;
    }

    public AccessibilityOutagesResponse getAccessibilityOutages(String assetTypeFilter) {
        String asset = validateAsset(assetTypeFilter);
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (!freshness.isFresh()) {
            return new AccessibilityOutagesResponse(now, false, SOURCE, List.of(), List.of());
        }

        List<RegionalAccessibilityOutage> normalized = normalizer.normalize(repository.findActiveGoAmenityRecords());
        List<RegionalAccessibilityOutage> current = currentOutages(normalized).stream()
            .filter(outage -> asset == null || asset.equals(outage.assetType()))
            .toList();

        return new AccessibilityOutagesResponse(
            now,
            true,
            SOURCE,
            summaries(current, asset),
            groups(current)
        );
    }

    private List<RegionalAccessibilityOutage> currentOutages(List<RegionalAccessibilityOutage> outages) {
        return outages.stream()
            .filter(outage -> !outage.restoration())
            .toList();
    }

    private List<LineGroup> groups(List<RegionalAccessibilityOutage> outages) {
        List<LineGroup> groups = new ArrayList<>();
        for (RegionalNetworkCatalog.Route route : RegionalNetworkCatalog.routes()) {
            List<StationGroup> stations = new ArrayList<>();
            for (String stationId : route.stationIds()) {
                Map<String, OutageDetail> details = new LinkedHashMap<>();
                outages.stream()
                    .filter(outage -> outage.lineIds().contains(route.id()) && outage.stationIds().contains(stationId))
                    .sorted(Comparator.comparing(RegionalAccessibilityOutage::updatedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                    .forEach(outage -> details.putIfAbsent(outage.id(), detail(outage)));
                if (!details.isEmpty()) {
                    String stationName = RegionalNetworkCatalog.station(stationId)
                        .map(station -> station.name()).orElse(stationId);
                    stations.add(new StationGroup(stationId, stationName, details.size(), List.copyOf(details.values())));
                }
            }
            if (!stations.isEmpty()) {
                groups.add(new LineGroup(route.id(), route.number(), route.name(), route.color(), List.copyOf(stations)));
            }
        }
        return List.copyOf(groups);
    }

    private List<AssetTypeSummary> summaries(List<RegionalAccessibilityOutage> outages, String assetFilter) {
        List<String> assets = assetFilter == null ? List.of("elevator", "escalator") : List.of(assetFilter);
        return assets.stream().map(asset -> {
            List<LineSummary> lines = new ArrayList<>();
            int total = 0;
            for (RegionalNetworkCatalog.Route route : RegionalNetworkCatalog.routes()) {
                long count = outages.stream()
                    .filter(outage -> asset.equals(outage.assetType()))
                    .filter(outage -> outage.lineIds().contains(route.id()))
                    .flatMap(outage -> outage.stationIds().stream()
                        .filter(route.stationIds()::contains)
                        .map(stationId -> outage.id() + ":" + stationId))
                    .distinct()
                    .count();
                if (count > 0) {
                    lines.add(new LineSummary(route.id(), route.number(), route.name(), route.color(), Math.toIntExact(count)));
                    total += Math.toIntExact(count);
                }
            }
            return new AssetTypeSummary(
                asset,
                "elevator".equals(asset) ? "Elevator outages" : "Escalator outages",
                total,
                List.copyOf(lines)
            );
        }).toList();
    }

    private OutageDetail detail(RegionalAccessibilityOutage outage) {
        return new OutageDetail(
            outage.id(), outage.assetType(), outage.title(), outage.description(), outage.cause(), outage.updatedAt(), SOURCE
        );
    }

    private String validateAsset(String assetTypeFilter) {
        if (assetTypeFilter == null) return null;
        String asset = assetTypeFilter.toLowerCase(java.util.Locale.CANADA);
        if (!"elevator".equals(asset) && !"escalator".equals(asset)) {
            throw new IllegalArgumentException("Invalid asset type: " + assetTypeFilter);
        }
        return asset;
    }
}
