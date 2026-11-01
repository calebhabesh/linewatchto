package com.calebhabesh.linewatch.push;

import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class PushSubscriptionLifecycleService {
    static final String WORKER_STAGE_EVENT = "worker-stage";

    private final PushSubscriptionLifecycleEventRepository repository;
    public PushSubscriptionLifecycleService(PushSubscriptionLifecycleEventRepository repository) { this.repository = repository; }

    public void record(PushSubscriptionEntity subscription, String eventType, String reason, Instant now) {
        record(subscription, eventType, reason, null, null, now);
    }

    /** Records a registration with the previous endpoint hash and the client facts (browser major, display mode). */
    public void record(
        PushSubscriptionEntity subscription,
        String eventType,
        String reason,
        String previousEndpointHash,
        String detail,
        Instant now
    ) {
        repository.save(PushSubscriptionLifecycleEventEntity.create(nextId(),
            subscription.getAccount().getId(), subscription.getId(), subscription.getEndpointHash(), eventType, reason, now)
            .withDetails(previousEndpointHash, subscription.getBrowserMajorVersion(), subscription.getDisplayMode(), detail));
    }

    /** A service-worker stage report (pushsubscriptionchange, subscription check, periodic sync). */
    public void recordWorkerStage(
        String accountId,
        PushSubscriptionEntity subscription,
        String endpointHash,
        String stage,
        String detail,
        Instant now
    ) {
        repository.save(PushSubscriptionLifecycleEventEntity.create(nextId(), accountId,
            subscription == null ? null : subscription.getId(), endpointHash, WORKER_STAGE_EVENT, stage, now)
            .withDetails(null,
                subscription == null ? null : subscription.getBrowserMajorVersion(),
                subscription == null ? null : subscription.getDisplayMode(),
                detail));
    }

    public long recentWorkerStageCount(String accountId, Instant since) {
        return repository.countByAccountIdAndEventTypeAndOccurredAtAfter(accountId, WORKER_STAGE_EVENT, since);
    }

    private static String nextId() {
        return "push_lifecycle_" + UUID.randomUUID().toString().replace("-", "");
    }
}
