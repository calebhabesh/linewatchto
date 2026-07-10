package com.calebhabesh.linewatch.push;

import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class PushSubscriptionLifecycleService {
    private final PushSubscriptionLifecycleEventRepository repository;
    public PushSubscriptionLifecycleService(PushSubscriptionLifecycleEventRepository repository) { this.repository = repository; }
    public void record(PushSubscriptionEntity subscription, String eventType, String reason, Instant now) {
        repository.save(PushSubscriptionLifecycleEventEntity.create("push_lifecycle_" + UUID.randomUUID().toString().replace("-", ""),
            subscription.getAccount().getId(), subscription.getId(), subscription.getEndpointHash(), eventType, reason, now));
    }
}
