package com.calebhabesh.linewatch.push;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "linewatch.push.enabled", havingValue = "true")
public class PushNotificationJob {
    private final PushNotificationDispatchService dispatchService;

    public PushNotificationJob(PushNotificationDispatchService dispatchService) {
        this.dispatchService = dispatchService;
    }

    @Scheduled(fixedDelayString = "${linewatch.push.evaluation-delay-ms:60000}")
    public void evaluateSavedCommuteNotifications() {
        dispatchService.evaluateSavedCommuteNotifications();
    }
}
