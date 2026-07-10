package com.calebhabesh.linewatch.push;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "push_subscription_lifecycle_events")
public class PushSubscriptionLifecycleEventEntity {
    @Id private String id;
    private String accountId;
    private String subscriptionId;
    private String endpointHash;
    private String eventType;
    private String reason;
    private Instant occurredAt;
    protected PushSubscriptionLifecycleEventEntity() {}
    static PushSubscriptionLifecycleEventEntity create(String id, String accountId, String subscriptionId, String endpointHash, String eventType, String reason, Instant now) {
        PushSubscriptionLifecycleEventEntity event = new PushSubscriptionLifecycleEventEntity();
        event.id = id; event.accountId = accountId; event.subscriptionId = subscriptionId; event.endpointHash = endpointHash;
        event.eventType = eventType; event.reason = reason; event.occurredAt = now; return event;
    }
}
