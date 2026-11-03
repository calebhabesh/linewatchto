package com.calebhabesh.linewatch.streetcarposition;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/surface/streetcars")
public class TtcStreetcarPositionController {
    private final TtcStreetcarPositionService service;

    public TtcStreetcarPositionController(TtcStreetcarPositionService service) {
        this.service = service;
    }

    @GetMapping("/positions")
    public ResponseEntity<StreetcarPositionResponses.PositionsResponse> positions() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.positions());
    }
}
