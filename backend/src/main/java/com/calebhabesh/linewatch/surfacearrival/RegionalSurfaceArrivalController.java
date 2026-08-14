package com.calebhabesh.linewatch.surfacearrival;

import com.calebhabesh.linewatch.station.StationNotFoundException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/regional/stations")
public class RegionalSurfaceArrivalController {
    private final RegionalSurfaceArrivalService service;

    public RegionalSurfaceArrivalController(RegionalSurfaceArrivalService service) {
        this.service = service;
    }

    @GetMapping("/{stationId}/surface-connections")
    public ResponseEntity<SurfaceArrivalResponses.SnapshotResponse> arrivals(@PathVariable String stationId) {
        try {
            return ResponseEntity.ok(service.arrivals(stationId));
        } catch (StationNotFoundException exception) {
            return ResponseEntity.notFound().build();
        }
    }
}
