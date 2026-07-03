package com.calebhabesh.linewatch.train;

import com.calebhabesh.linewatch.arrival.live.EstimatedTrainMarker;
import com.calebhabesh.linewatch.arrival.live.EstimatedTrainMarkerSnapshot;
import com.calebhabesh.linewatch.arrival.live.GtfsRtSubwayTrainMarkerService;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/trains")
public class TrainController {
    private final GtfsRtSubwayTrainMarkerService markerService;

    public TrainController(GtfsRtSubwayTrainMarkerService markerService) {
        this.markerService = markerService;
    }

    @GetMapping
    public TrainResponse trains() {
        EstimatedTrainMarkerSnapshot snapshot = markerService.estimatedMarkers();
        return new TrainResponse(
            snapshot.fresh(),
            snapshot.source(),
            snapshot.message(),
            snapshot.disclaimer(),
            snapshot.feedCreatedAt(),
            snapshot.generatedAt(),
            snapshot.markers().stream().map(TrainMarkerResponse::from).toList()
        );
    }

    public record TrainResponse(
        boolean fresh,
        String source,
        String message,
        String disclaimer,
        OffsetDateTime feedCreatedAt,
        OffsetDateTime generatedAt,
        List<TrainMarkerResponse> markers
    ) {}

    public record TrainMarkerResponse(
        String id,
        String lineId,
        String direction,
        String travelDirection,
        String segmentId,
        String fromStationId,
        String toStationId,
        String nextStationId,
        double progress,
        int segmentTravelSeconds,
        OffsetDateTime predictedAt,
        String vehicleId,
        String tripId,
        OffsetDateTime feedCreatedAt,
        OffsetDateTime updatedAt
    ) {
        static TrainMarkerResponse from(EstimatedTrainMarker marker) {
            return new TrainMarkerResponse(
                marker.id(),
                marker.lineId(),
                marker.direction(),
                marker.travelDirection(),
                marker.segmentId(),
                marker.fromStationId(),
                marker.toStationId(),
                marker.nextStationId(),
                marker.progress(),
                marker.segmentTravelSeconds(),
                marker.predictedAt(),
                marker.vehicleId(),
                marker.tripId(),
                marker.feedCreatedAt(),
                marker.updatedAt()
            );
        }
    }
}
