package com.calebhabesh.linewatch.alert;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/alerts")
public class AlertController {

    private final AlertDashboardService dashboardService;

    public AlertController(AlertDashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @GetMapping
    public Object getAlerts(@RequestParam(required = false) String type) {
        if ("planned".equals(type)) {
            return dashboardService.plannedClosures();
        }
        if ("slowdown".equals(type)) {
            return dashboardService.reducedSpeedZones();
        }

        return dashboardService.activeAlerts();
    }
}
