package com.calebhabesh.linewatch.reliability;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reliability")
public class ReliabilityController {
    private final ReliabilityService service;

    public ReliabilityController(ReliabilityService service) {
        this.service = service;
    }

    @GetMapping("/lines")
    public ReliabilityResponses.ReliabilityResponse lines(
        @RequestParam(defaultValue = "ttc") String network
    ) {
        return service.lines(network);
    }

    @GetMapping("/stations/{stationId}")
    public ReliabilityResponses.ReliabilityResponse station(
        @PathVariable String stationId,
        @RequestParam(defaultValue = "ttc") String network
    ) {
        return service.station(network, stationId);
    }
}
