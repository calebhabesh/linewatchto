package com.calebhabesh.linewatch.map;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import com.calebhabesh.linewatch.station.StationRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.Comparator;
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

        Map<String, List<AlertDashboardService.SegmentImpact>> impacts =
                dashboardService.activeSegmentImpacts();

        List<NetworkSegmentDto> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc().stream()
                .map(s -> {
                    List<AlertDashboardService.SegmentImpact> segmentImpacts =
                            impacts.getOrDefault(s.getId(), List.of());
                    AlertDashboardService.SegmentImpact primaryImpact =
                            primaryImpact(segmentImpacts);

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

        List<StationNodeImpactDto> stationNodeImpacts = dashboardService
                .activeStationNodeImpacts()
                .stream()
                .map(impact -> new StationNodeImpactDto(
                        impact.stationId(),
                        impact.kind(),
                        impact.cardId(),
                        impact.title()
                ))
                .toList();

        return new MapResponse(stations, segments, stationNodeImpacts);
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

    private SegmentImpactDto toSegmentImpactDto(AlertDashboardService.SegmentImpact impact) {
        return new SegmentImpactDto(
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
        return "reduced-speed-zone".equals(impact.kind()) ? "delay" : impact.kind();
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
