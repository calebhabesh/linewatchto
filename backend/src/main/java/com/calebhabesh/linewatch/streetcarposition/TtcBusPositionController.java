package com.calebhabesh.linewatch.streetcarposition;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Live bus positions (plan 13, S8). The Map View asks only for the area it shows ({@code bbox}). */
@RestController
@RequestMapping("/api/surface/buses")
public class TtcBusPositionController {
    private final TtcBusPositionService service;

    public TtcBusPositionController(TtcBusPositionService service) {
        this.service = service;
    }

    @GetMapping("/positions")
    public ResponseEntity<BusPositionResponses.PositionsResponse> positions(
        @RequestParam(name = "bbox", required = false) String bbox
    ) {
        BusPositionResponses.Bounds bounds;
        try {
            bounds = bbox == null || bbox.isBlank() ? null : BusPositionResponses.Bounds.parse(bbox);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid bbox");
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.positions(bounds));
    }
}
