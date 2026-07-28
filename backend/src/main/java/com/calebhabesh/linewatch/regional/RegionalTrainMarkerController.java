package com.calebhabesh.linewatch.regional;

import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/regional/trains")
public class RegionalTrainMarkerController {
    private final RegionalTrainMarkerService service;

    public RegionalTrainMarkerController(RegionalTrainMarkerService service) { this.service = service; }

    @GetMapping
    public Response trains() {
        RegionalTrainMarkerService.Snapshot snapshot = service.markers();
        return new Response(snapshot.fresh(), snapshot.availability(), snapshot.source(), snapshot.message(),
            snapshot.disclaimer(), snapshot.feedCreatedAt(), snapshot.generatedAt(),
            snapshot.markers().stream().map(Marker::from).toList());
    }

    public record Response(boolean fresh, String availability, String source, String message, String disclaimer,
                           OffsetDateTime feedCreatedAt, OffsetDateTime generatedAt, List<Marker> markers) {}
    public record Marker(String id, String lineId, String direction, String travelDirection, String segmentId,
                         String fromStationId, String toStationId, String nextStationId, double progress,
                         int segmentTravelSeconds, OffsetDateTime predictedAt, String vehicleId, String tripId,
                         OffsetDateTime feedCreatedAt, OffsetDateTime updatedAt) {
        static Marker from(RegionalTrainMarkerRecord marker) {
            return new Marker(marker.id(), marker.lineId(), marker.direction(), marker.travelDirection(), marker.segmentId(),
                marker.fromStationId(), marker.toStationId(), marker.nextStationId(), marker.progress(), 0,
                marker.updatedAt(), marker.vehicleId(), marker.tripId(), marker.updatedAt(), marker.updatedAt());
        }
    }
}
