package com.calebhabesh.linewatch.gobusposition;

import com.calebhabesh.linewatch.streetcarposition.BusPositionResponses.Bounds;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Live GO bus positions (plan 13, S9). The GO/UP Map View asks only for the area it shows. */
@RestController
@RequestMapping("/api/regional/buses")
public class GoBusPositionController {
    private final GoBusPositionService service;

    public GoBusPositionController(GoBusPositionService service) {
        this.service = service;
    }

    @GetMapping("/positions")
    public ResponseEntity<GoBusPositionResponses.PositionsResponse> positions(
        @RequestParam(name = "bbox", required = false) String bbox
    ) {
        Bounds bounds;
        try {
            bounds = bbox == null || bbox.isBlank() ? null : Bounds.parse(bbox);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid bbox");
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.positions(bounds));
    }
}
