package com.calebhabesh.linewatch.push;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "linewatch.push.enabled", havingValue = "true")
public class PushNotificationJob {
    private final PushNotificationDispatchService dispatchService;
    private final PushEvaluationHealthService healthService;

    public PushNotificationJob(PushNotificationDispatchService dispatchService, PushEvaluationHealthService healthService) {
        this.dispatchService = dispatchService;
        this.healthService = healthService;
    }

    @Scheduled(fixedDelayString = "${linewatch.push.evaluation-delay-ms:60000}")
    public void evaluateSavedCommuteNotifications() {
        healthService.record(dispatchService.evaluateSavedCommuteNotifications());
    }
}
