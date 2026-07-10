package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.ingestion.TtcAlertIngestionSucceededEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "linewatch.push.enabled", havingValue = "true")
public class PushNotificationIngestionListener {
    private static final Logger log = LoggerFactory.getLogger(PushNotificationIngestionListener.class);

    private final PushNotificationDispatchService dispatchService;
    private final PushEvaluationHealthService healthService;

    public PushNotificationIngestionListener(
        PushNotificationDispatchService dispatchService,
        PushEvaluationHealthService healthService
    ) {
        this.dispatchService = dispatchService;
        this.healthService = healthService;
    }

    @EventListener
    public void onTtcAlertIngestionSucceeded(TtcAlertIngestionSucceededEvent event) {
        try {
            healthService.record(dispatchService.evaluateSavedCommuteNotifications());
        } catch (RuntimeException exception) {
            log.warn("Push notification evaluation failed after TTC alert ingestion run {}", event.runId(), exception);
        }
    }
}
