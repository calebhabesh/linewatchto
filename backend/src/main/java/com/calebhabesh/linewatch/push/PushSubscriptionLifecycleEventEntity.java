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
    private String previousEndpointHash;
    private Integer browserMajorVersion;
    private String displayMode;
    private String detail;
    protected PushSubscriptionLifecycleEventEntity() {}
    static PushSubscriptionLifecycleEventEntity create(String id, String accountId, String subscriptionId, String endpointHash, String eventType, String reason, Instant now) {
        PushSubscriptionLifecycleEventEntity event = new PushSubscriptionLifecycleEventEntity();
        event.id = id; event.accountId = accountId; event.subscriptionId = subscriptionId; event.endpointHash = endpointHash;
        event.eventType = eventType; event.reason = reason; event.occurredAt = now; return event;
    }
    PushSubscriptionLifecycleEventEntity withDetails(String previousEndpointHash, Integer browserMajorVersion, String displayMode, String detail) {
        this.previousEndpointHash = previousEndpointHash; this.browserMajorVersion = browserMajorVersion;
        this.displayMode = displayMode; this.detail = detail; return this;
    }
    public String getId() { return id; }
    public String getAccountId() { return accountId; }
    public String getSubscriptionId() { return subscriptionId; }
    public String getEndpointHash() { return endpointHash; }
    public String getEventType() { return eventType; }
    public String getReason() { return reason; }
    public Instant getOccurredAt() { return occurredAt; }
    public String getPreviousEndpointHash() { return previousEndpointHash; }
    public Integer getBrowserMajorVersion() { return browserMajorVersion; }
    public String getDisplayMode() { return displayMode; }
    public String getDetail() { return detail; }
}
