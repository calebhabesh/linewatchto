package com.calebhabesh.linewatch.alert;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/alert-history")
public class AlertHistoryController {
    private final AlertHistoryService historyService;

    public AlertHistoryController(AlertHistoryService historyService) {
        this.historyService = historyService;
    }

    @GetMapping
    public AlertHistoryResponses.AlertHistoryResponse getAlertHistory(
        @RequestParam(required = false, defaultValue = "ttc") String network,
        @RequestParam(required = false, defaultValue = "today") String period,
        @RequestParam(required = false, defaultValue = "5000") Integer limit
    ) {
        return historyService.history(network, period, limit);
    }
}
