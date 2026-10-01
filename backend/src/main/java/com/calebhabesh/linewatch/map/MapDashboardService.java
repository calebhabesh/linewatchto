package com.calebhabesh.linewatch.map;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.alert.TtcDashboardReadModel;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import com.calebhabesh.linewatch.station.StationRepository;
import tools.jackson.core.type.TypeReference;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class MapDashboardService {

    private final StationRepository stationRepository;
    private final LineSegmentRepository lineSegmentRepository;
    private final AlertDashboardService dashboardService;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;
    private final IngestionFreshness ingestionFreshness;
    private final IngestionRunStore ingestionRunStore;

    public MapDashboardService(
        StationRepository stationRepository,
        LineSegmentRepository lineSegmentRepository,
        AlertDashboardService dashboardService,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties,
        IngestionFreshness ingestionFreshness,
        IngestionRunStore ingestionRunStore
    ) {
        this.stationRepository = Objects.requireNonNull(stationRepository, "stationRepository must not be null");
        this.lineSegmentRepository = Objects.requireNonNull(lineSegmentRepository, "lineSegmentRepository must not be null");
        this.dashboardService = Objects.requireNonNull(dashboardService, "dashboardService must not be null");
        this.cache = Objects.requireNonNull(cache, "cache must not be null");
        this.cacheProperties = Objects.requireNonNull(cacheProperties, "cacheProperties must not be null");
        this.ingestionFreshness = Objects.requireNonNull(ingestionFreshness, "ingestionFreshness must not be null");
        this.ingestionRunStore = Objects.requireNonNull(ingestionRunStore, "ingestionRunStore must not be null");
    }

    public MapController.MapResponse getMap() {
        return getMap((Supplier<TtcDashboardReadModel>) null);
    }

    public MapController.MapResponse getMap(Supplier<TtcDashboardReadModel> readModelSupplier) {
        Duration ttl = ingestionFreshness.remainingFreshness(ingestionRunStore.findLatestSuccessful())
            .map(remaining -> remaining.compareTo(cacheProperties.getMapTtl()) < 0 ? remaining : cacheProperties.getMapTtl())
            .orElse(cacheProperties.getMapTtl());
        return cache.getOrCompute(
            "map",
            new TypeReference<MapController.MapResponse>() {},
            ttl,
            () -> buildMap(readModelSupplier != null ? readModelSupplier.get() : null)
        );
    }

    public MapController.MapResponse buildMap() {
        return buildMap(null);
    }

    public MapController.MapResponse buildMap(TtcDashboardReadModel readModel) {
        List<MapController.StationDto> stations = stationRepository.findAllByOrderBySortOrderAscNameAsc().stream()
                .map(s -> new MapController.StationDto(s.getId(), s.getName(), s.getMapX(), s.getMapY(), s.isInterchange()))
                .collect(Collectors.toList());

        Map<String, List<AlertDashboardService.SegmentImpact>> impacts = readModel != null
                ? readModel.segmentImpacts()
                : dashboardService.activeSegmentImpacts();

        List<LineSegmentEntity> segmentsList = readModel != null
                ? readModel.segments()
                : lineSegmentRepository.findAllByOrderBySortOrderAsc();

        List<MapController.NetworkSegmentDto> segments = segmentsList.stream()
                .map(s -> {
                    List<AlertDashboardService.SegmentImpact> segmentImpacts =
                            impacts.getOrDefault(s.getId(), List.of());
                    AlertDashboardService.SegmentImpact primaryImpact =
                            primaryImpact(segmentImpacts);

                    return new MapController.NetworkSegmentDto(
                        s.getId(),
                        s.getLineId(),
                        "Segment " + s.getId(),
                        s.getStationAId(),
                        s.getStationBId(),
                        s.getStationAAnchorId(),
                        s.getStationBAnchorId(),
                        s.getGuidePathId(),
                        s.isGuidePathReversed(),
                        Objects.requireNonNullElse(s.getSvgPath(), ""),
                        segmentImpacts.stream()
                            .map(this::toSegmentImpactDto)
                            .toList(),
                        scalarOverlay(primaryImpact),
                        primaryImpact == null ? "bidirectional" : primaryImpact.travelDirection(),
                        primaryImpact == null ? List.of() : primaryImpact.sourceAlertIds(),
                        reducedSpeedZoneIds(primaryImpact),
                        scalarAlertId(primaryImpact)
                    );
                })
                .collect(Collectors.toList());

        List<MapController.StationNodeImpactDto> stationNodeImpacts = (readModel != null
                ? readModel.stationNodeImpacts()
                : dashboardService.activeStationNodeImpacts())
                .stream()
                .map(impact -> new MapController.StationNodeImpactDto(
                        impact.stationId(),
                        impact.kind(),
                        impact.cardId(),
                        impact.title()
                ))
                .toList();

        return new MapController.MapResponse(stations, segments, stationNodeImpacts);
    }

    private AlertDashboardService.SegmentImpact primaryImpact(
        List<AlertDashboardService.SegmentImpact> impacts
    ) {
        return impacts.stream()
            .max(Comparator.comparingInt(this::impactPriority))
            .orElse(null);
    }

    private int impactPriority(AlertDashboardService.SegmentImpact impact) {
        return switch (impact.kind()) {
            case "reduced-speed-zone" -> 1;
            case "delay" -> 2;
            case "planned-closure" -> 3;
            case "suspension" -> 4;
            default -> 0;
        };
    }

    private MapController.SegmentImpactDto toSegmentImpactDto(AlertDashboardService.SegmentImpact impact) {
        return new MapController.SegmentImpactDto(
            impact.kind(),
            impact.cardId(),
            impact.travelDirection(),
            impact.sourceAlertIds()
        );
    }

    private String scalarOverlay(AlertDashboardService.SegmentImpact impact) {
        if (impact == null) {
            return "clear";
        }
        return switch (impact.kind()) {
            case "reduced-speed-zone" -> "delay";
            case "planned-closure" -> "suspension";
            default -> impact.kind();
        };
    }

    private List<String> reducedSpeedZoneIds(AlertDashboardService.SegmentImpact impact) {
        if (impact == null || !"reduced-speed-zone".equals(impact.kind()) || impact.cardId() == null) {
            return List.of();
        }
        return List.of(impact.cardId());
    }

    private String scalarAlertId(AlertDashboardService.SegmentImpact impact) {
        if (impact == null || "reduced-speed-zone".equals(impact.kind())) {
            return null;
        }
        return impact.cardId();
    }
}
