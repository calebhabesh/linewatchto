package com.calebhabesh.linewatch.map;

import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import com.calebhabesh.linewatch.station.StationEntity;
import com.calebhabesh.linewatch.station.StationRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/map")
public class MapController {

    private final StationRepository stationRepository;
    private final LineSegmentRepository lineSegmentRepository;

    public MapController(StationRepository stationRepository, LineSegmentRepository lineSegmentRepository) {
        this.stationRepository = stationRepository;
        this.lineSegmentRepository = lineSegmentRepository;
    }

    @GetMapping
    public MapResponse getMap() {
        List<StationDto> stations = stationRepository.findAllByOrderBySortOrderAscNameAsc().stream()
                .map(s -> new StationDto(s.getId(), s.getName(), s.getMapX(), s.getMapY(), s.isInterchange()))
                .collect(Collectors.toList());

        List<NetworkSegmentDto> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc().stream()
                .map(s -> new NetworkSegmentDto(s.getId(), s.getLineId(), 
                        "Segment " + s.getId(), // Will need better labeling strategy later
                        s.getSvgPath(), 
                        "clear", // Default to clear until alerts are mapped
                        null))
                .collect(Collectors.toList());

        return new MapResponse(stations, segments);
    }

    public record MapResponse(List<StationDto> stations, List<NetworkSegmentDto> segments) {}
    
    public record StationDto(String id, String name, int x, int y, boolean interchange) {}
    
    public record NetworkSegmentDto(String id, String lineId, String label, String pathD, String overlay, String alertId) {}
}
