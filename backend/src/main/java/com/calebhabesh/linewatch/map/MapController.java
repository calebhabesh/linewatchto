package com.calebhabesh.linewatch.map;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import com.calebhabesh.linewatch.station.StationRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/map")
public class MapController {

    private final StationRepository stationRepository;
    private final LineSegmentRepository lineSegmentRepository;
    private final AlertDashboardService dashboardService;

    public MapController(
        StationRepository stationRepository,
        LineSegmentRepository lineSegmentRepository,
        AlertDashboardService dashboardService
    ) {
        this.stationRepository = stationRepository;
        this.lineSegmentRepository = lineSegmentRepository;
        this.dashboardService = dashboardService;
    }

    @GetMapping
    public MapResponse getMap() {
        List<StationDto> stations = stationRepository.findAllByOrderBySortOrderAscNameAsc().stream()
                .map(s -> new StationDto(s.getId(), s.getName(), s.getMapX(), s.getMapY(), s.isInterchange()))
                .collect(Collectors.toList());

        Map<String, AlertDashboardService.SegmentImpact> impacts =
                dashboardService.activeSegmentImpacts();

        List<NetworkSegmentDto> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc().stream()
                .map(s -> {
                    AlertDashboardService.SegmentImpact impact = impacts.get(s.getId());

                    return new NetworkSegmentDto(
                        s.getId(),
                        s.getLineId(),
                        "Segment " + s.getId(),
                        s.getStationAId(),
                        s.getStationBId(),
                        s.getStationAAnchorId(),
                        s.getStationBAnchorId(),
                        s.getGuidePathId(),
                        s.isGuidePathReversed(),
                        java.util.Objects.requireNonNullElse(s.getSvgPath(), ""),
                        impact == null ? "clear" : impact.overlay(),
                        impact == null ? "bidirectional" : impact.travelDirection(),
                        impact == null ? List.of() : impact.sourceAlertIds(),
                        impact == null ? List.of() : impact.reducedSpeedZoneIds(),
                        impact == null ? null : impact.alertId()
                    );
                })
                .collect(Collectors.toList());

        return new MapResponse(stations, segments);
    }

    public record MapResponse(List<StationDto> stations, List<NetworkSegmentDto> segments) {}

    public record StationDto(String id, String name, int x, int y, boolean interchange) {}

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
        String overlay,
        String travelDirection,
        List<String> sourceAlertIds,
        List<String> reducedSpeedZoneIds,
        String alertId
    ) {}
}
