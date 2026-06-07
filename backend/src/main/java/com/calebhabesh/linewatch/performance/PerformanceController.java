package com.calebhabesh.linewatch.performance;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/performance")
public class PerformanceController {
    private final TtcPerformanceService service;

    public PerformanceController(TtcPerformanceService service) {
        this.service = service;
    }

    @GetMapping
    public TtcPerformanceResponses.SnapshotResponse performance() {
        return service.current();
    }
}
