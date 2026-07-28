package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.station.StationNotFoundException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/regional/stations")
public class RegionalArrivalController {
    private final RegionalArrivalService service;

    public RegionalArrivalController(RegionalArrivalService service) {
        this.service = service;
    }

    @GetMapping("/{stationId}/arrivals")
    public ResponseEntity<RegionalArrivalResponses.SnapshotResponse> arrivals(
        @PathVariable String stationId
    ) {
        try {
            return ResponseEntity.ok(service.arrivals(stationId));
        } catch (StationNotFoundException exception) {
            return ResponseEntity.notFound().build();
        }
    }
}
