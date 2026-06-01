package com.calebhabesh.linewatch.station;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stations")
@CrossOrigin(origins = {"http://localhost:3000", "http://localhost:3001"})
public class StationController {
    private final StationService stationService;

    public StationController(StationService stationService) {
        this.stationService = stationService;
    }

    @GetMapping
    public StationResponses.StationListResponse stations() {
        return stationService.stationSummaries();
    }

    @GetMapping("/{id}")
    public ResponseEntity<StationResponses.StationDetailResponse> station(@PathVariable String id) {
        try {
            return ResponseEntity.ok(stationService.stationDetail(id));
        } catch (StationNotFoundException exception) {
            return ResponseEntity.notFound().build();
        }
    }
}
