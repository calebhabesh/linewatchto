package com.calebhabesh.linewatch.surfacearrival;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/surface/stops")
public class TtcSurfaceStopArrivalController {
    private final TtcSurfaceStopArrivalService service;

    public TtcSurfaceStopArrivalController(TtcSurfaceStopArrivalService service) {
        this.service = service;
    }

    @GetMapping("/{stopCode}/arrivals")
    public ResponseEntity<TtcSurfaceStopResponses.StopArrivalsResponse> arrivals(@PathVariable String stopCode) {
        return service.arrivals(stopCode)
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
