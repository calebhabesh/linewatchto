package com.calebhabesh.linewatch.surfacearrival;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/regional/bus-stops")
public class GoBusStopDepartureController {
    private final GoBusStopDepartureService service;

    public GoBusStopDepartureController(GoBusStopDepartureService service) {
        this.service = service;
    }

    @GetMapping("/{stopCode}/departures")
    public ResponseEntity<GoBusStopResponses.StopDeparturesResponse> departures(@PathVariable String stopCode) {
        return service.departures(stopCode)
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
