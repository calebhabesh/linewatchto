package com.calebhabesh.linewatch.push;

import java.util.concurrent.locks.ReentrantLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "linewatch.push.enabled", havingValue = "true")
public class PushNotificationJob {
    private static final Logger log = LoggerFactory.getLogger(PushNotificationJob.class);

    private final PushNotificationDispatchService dispatchService;
    private final PushEvaluationHealthService healthService;
    // The scheduler has several threads; an account is never evaluated twice at once.
    private final ReentrantLock evaluationLock = new ReentrantLock();

    public PushNotificationJob(PushNotificationDispatchService dispatchService, PushEvaluationHealthService healthService) {
        this.dispatchService = dispatchService;
        this.healthService = healthService;
    }

    @Scheduled(fixedDelayString = "${linewatch.push.evaluation-delay-ms:60000}")
    public void evaluateSavedCommuteNotifications() {
        evaluationLock.lock();
        try {
            healthService.record(dispatchService.evaluateSavedCommuteNotifications());
        } finally {
            evaluationLock.unlock();
        }
    }

    /** Evaluates an account seconds after a replacement endpoint registers, so catch-up reaches it while the app is open. */
    @Scheduled(fixedDelayString = "${linewatch.push.prompt-catch-up-delay-ms:2000}")
    public void evaluatePromptCatchUps() {
        // A full run in progress already covers every account; the next tick retries.
        if (!evaluationLock.tryLock()) return;
        try {
            for (String accountId : dispatchService.accountsDueForPromptCatchUp()) {
                try {
                    dispatchService.evaluateAccount(accountId);
                } catch (RuntimeException exception) {
                    log.warn("Prompt catch-up evaluation failed for account {}", accountId, exception);
                }
            }
        } finally {
            evaluationLock.unlock();
        }
    }
}
