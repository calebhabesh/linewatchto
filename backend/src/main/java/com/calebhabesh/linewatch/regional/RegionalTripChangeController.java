package com.calebhabesh.linewatch.regional;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/regional/trip-changes")
public class RegionalTripChangeController {
    private final RegionalTripChangeService service;

    public RegionalTripChangeController(RegionalTripChangeService service) {
        this.service = service;
    }

    @GetMapping
    public RegionalTripChangeResponses.Response tripChanges(
        @RequestParam(required = false) String stationId,
        @RequestParam(required = false) String query,
        @RequestParam(required = false) Integer limit
    ) {
        return service.get(stationId, query, limit);
    }
}
