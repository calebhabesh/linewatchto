package com.calebhabesh.linewatch.map;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import com.calebhabesh.linewatch.station.StationRepository;
import java.util.List;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/map")
public class MapController {

    private final MapDashboardService mapDashboardService;

    @Autowired
    public MapController(MapDashboardService mapDashboardService) {
        this.mapDashboardService = Objects.requireNonNull(mapDashboardService, "mapDashboardService must not be null");
    }

    public MapController(
        StationRepository stationRepository,
        LineSegmentRepository lineSegmentRepository,
        AlertDashboardService dashboardService,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties,
        IngestionFreshness ingestionFreshness,
        IngestionRunStore ingestionRunStore
    ) {
        this(new MapDashboardService(
            stationRepository,
            lineSegmentRepository,
            dashboardService,
            cache,
            cacheProperties,
            ingestionFreshness,
            ingestionRunStore
        ));
    }

    @GetMapping
    public MapResponse getMap() {
        return mapDashboardService.getMap();
    }

    public record MapResponse(
        List<StationDto> stations,
        List<NetworkSegmentDto> segments,
        List<StationNodeImpactDto> stationNodeImpacts
    ) {}

    public record StationDto(String id, String name, int x, int y, boolean interchange) {}

    public record SegmentImpactDto(
        String kind,
        String cardId,
        String travelDirection,
        List<String> sourceAlertIds
    ) {}

    public record StationNodeImpactDto(
        String stationId,
        String kind,
        String cardId,
        String title
    ) {}

    public record NetworkSegmentDto(
        String id,
        String lineId,
        String label,
        String stationAId,
        String stationBId,
        String stationAAnchorId,
        String stationBAnchorId,
        String guidePathId,
        boolean guidePathReversed,
        String pathD,
        List<SegmentImpactDto> impacts,
        String overlay,
        String travelDirection,
        List<String> sourceAlertIds,
        List<String> reducedSpeedZoneIds,
        String alertId
    ) {}
}
