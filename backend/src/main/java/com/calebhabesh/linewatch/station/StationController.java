package com.calebhabesh.linewatch.station;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stations")
public class StationController {
    private final StationService stationService;

    public StationController(StationService stationService) {
        this.stationService = stationService;
    }

    @GetMapping
    public StationResponses.StationListResponse stations(
        @RequestParam(required = false) Boolean wheelchair,
        @RequestParam(required = false) Boolean elevator,
        @RequestParam(required = false) Boolean washroom,
        @RequestParam(required = false) Boolean parking,
        @RequestParam(required = false) String lineId,
        @RequestParam(required = false) String query
    ) {
        if (wheelchair == null && elevator == null && washroom == null && parking == null && lineId == null && query == null) {
            return stationService.stationSummaries();
        }
        return stationService.stationSummaries(wheelchair, elevator, washroom, parking, lineId, query);
    }

    public StationResponses.StationListResponse stations() {
        return stations(null, null, null, null, null, null);
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
