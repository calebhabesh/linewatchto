package com.calebhabesh.linewatch.push;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "push_notification_client_events")
public class PushNotificationClientEventEntity {
    @Id
    private String id;
    @Column(name = "account_id")
    private String accountId;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "subscription_id")
    private PushSubscriptionEntity subscription;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "delivery_id")
    private PushNotificationDeliveryEntity delivery;
    @Column(name = "endpoint_hash")
    private String endpointHash;
    @Column(name = "notification_key")
    private String notificationKey;
    @Column(name = "notification_state")
    private String notificationState;
    private String stage;
    private String message;
    @Column(name = "occurred_at")
    private Instant occurredAt;
    @Column(name = "created_at")
    private Instant createdAt;

    protected PushNotificationClientEventEntity() {}

    private PushNotificationClientEventEntity(
        String id,
        String accountId,
        PushSubscriptionEntity subscription,
        PushNotificationDeliveryEntity delivery,
        String endpointHash,
        String notificationKey,
        String notificationState,
        String stage,
        String message,
        Instant occurredAt,
        Instant createdAt
    ) {
        this.id = id;
        this.accountId = accountId;
        this.subscription = subscription;
        this.delivery = delivery;
        this.endpointHash = endpointHash;
        this.notificationKey = notificationKey;
        this.notificationState = notificationState;
        this.stage = stage;
        this.message = message;
        this.occurredAt = occurredAt;
        this.createdAt = createdAt;
    }

    public static PushNotificationClientEventEntity create(
        String id,
        String accountId,
        PushSubscriptionEntity subscription,
        PushNotificationDeliveryEntity delivery,
        String endpointHash,
        String notificationKey,
        String notificationState,
        String stage,
        String message,
        Instant occurredAt,
        Instant createdAt
    ) {
        return new PushNotificationClientEventEntity(
            id,
            accountId,
            subscription,
            delivery,
            endpointHash,
            notificationKey,
            notificationState,
            stage,
            message,
            occurredAt,
            createdAt
        );
    }

    public String getId() { return id; }
    public String getAccountId() { return accountId; }
    public PushSubscriptionEntity getSubscription() { return subscription; }
    public PushNotificationDeliveryEntity getDelivery() { return delivery; }
    public String getEndpointHash() { return endpointHash; }
    public String getNotificationKey() { return notificationKey; }
    public String getNotificationState() { return notificationState; }
    public String getStage() { return stage; }
    public String getMessage() { return message; }
    public Instant getOccurredAt() { return occurredAt; }
    public Instant getCreatedAt() { return createdAt; }
}
