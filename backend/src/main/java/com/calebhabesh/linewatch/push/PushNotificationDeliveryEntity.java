package com.calebhabesh.linewatch.push;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;

@Entity
@Table(name = "push_notification_deliveries")
public class PushNotificationDeliveryEntity {
    @Id
    private String id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_id")
    private PushNotificationEventEntity event;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "subscription_id")
    private PushSubscriptionEntity subscription;
    private String status;
    @Column(name = "http_status")
    private Integer httpStatus;
    private String message;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "displayed_at")
    private Instant displayedAt;

    protected PushNotificationDeliveryEntity() {}

    private PushNotificationDeliveryEntity(
        String id,
        PushNotificationEventEntity event,
        PushSubscriptionEntity subscription,
        PushDeliveryResult result,
        Instant now
    ) {
        this.id = id;
        this.event = event;
        this.subscription = subscription;
        this.status = result.status();
        this.httpStatus = result.httpStatus();
        this.message = result.message();
        this.createdAt = now;
    }

    public static PushNotificationDeliveryEntity create(
        String id,
        PushNotificationEventEntity event,
        PushSubscriptionEntity subscription,
        PushDeliveryResult result,
        Instant now
    ) {
        return new PushNotificationDeliveryEntity(id, event, subscription, result, now);
    }

    public boolean shouldRetryDelivery(Instant now, Duration retryDelay) {
        return shouldRetryDelivery(now, retryDelay, null, null);
    }

    public boolean shouldRetryDelivery(
        Instant now,
        Duration failedRetryDelay,
        Duration acceptedUndisplayedRetryDelay,
        Instant acceptedUndisplayedRetryUntil
    ) {
        if (displayedAt != null || "gone".equals(status)) {
            return false;
        }
        if ("accepted".equals(status)) {
            if (acceptedUndisplayedRetryDelay == null || acceptedUndisplayedRetryUntil == null) {
                return false;
            }
            if (now == null || !now.isBefore(acceptedUndisplayedRetryUntil)) {
                return false;
            }
            return retryDelayElapsed(now, acceptedUndisplayedRetryDelay);
        }
        return retryDelayElapsed(now, failedRetryDelay);
    }

    private boolean retryDelayElapsed(Instant now, Duration retryDelay) {
        if (createdAt == null || retryDelay == null || retryDelay.isZero() || retryDelay.isNegative()) {
            return true;
        }
        return !createdAt.plus(retryDelay).isAfter(now);
    }

    public void recordAttempt(PushDeliveryResult result, Instant now) {
        this.status = result.status();
        this.httpStatus = result.httpStatus();
        this.message = result.message();
        this.createdAt = now;
        this.displayedAt = null;
    }

    public void markDisplayed(Instant now) {
        this.displayedAt = now;
    }

    public String getId() { return id; }
    public PushNotificationEventEntity getEvent() { return event; }
    public PushSubscriptionEntity getSubscription() { return subscription; }
    public String getStatus() { return status; }
    public Integer getHttpStatus() { return httpStatus; }
    public String getMessage() { return message; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getDisplayedAt() { return displayedAt; }
}
