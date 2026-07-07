package com.calebhabesh.linewatch.push;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "push_notification_events")
public class PushNotificationEventEntity {
    @Id
    private String id;
    @Column(name = "account_id")
    private String accountId;
    @Column(name = "commute_id")
    private String commuteId;
    @Column(name = "leg_id")
    private String legId;
    @Column(name = "line_id")
    private String lineId;
    @Column(name = "event_type")
    private String eventType;
    @Column(name = "reminder_bucket")
    private String reminderBucket;
    private String category;
    @Column(name = "notification_key")
    private String notificationKey;
    @Column(name = "source_incident_key")
    private String sourceIncidentKey;
    @Column(name = "notification_state")
    private String notificationState;
    @Column(name = "dedupe_key")
    private String dedupeKey;
    private String title;
    private String body;
    @Column(name = "notification_subject")
    private String notificationSubject;
    @Column(name = "event_location")
    private String eventLocation;
    @Column(name = "display_direction")
    private String displayDirection;
    @Column(name = "scope_label")
    private String scopeLabel;
    @Column(name = "source_event_at")
    private Instant sourceEventAt;
    private String url;
    @Column(name = "created_at")
    private Instant createdAt;

    protected PushNotificationEventEntity() {}

    private PushNotificationEventEntity(String id, PushNotificationCandidate candidate, Instant now) {
        this(id, candidate, candidate.notification(), now);
    }

    private PushNotificationEventEntity(
        String id,
        PushNotificationCandidate candidate,
        FormattedPushNotification notification,
        Instant now
    ) {
        this.id = id;
        this.accountId = candidate.accountId();
        this.commuteId = candidate.commuteId();
        this.legId = candidate.legId();
        this.lineId = candidate.lineId();
        this.eventType = candidate.eventType();
        this.reminderBucket = candidate.reminderBucket();
        this.category = candidate.category();
        this.notificationKey = candidate.notificationKey();
        this.sourceIncidentKey = candidate.sourceIncidentKey();
        this.notificationState = "ACTIVE";
        this.dedupeKey = candidate.dedupeKey();
        this.title = notification.title();
        this.body = notification.body();
        this.notificationSubject = notification.notificationSubject();
        this.eventLocation = notification.eventLocation();
        this.displayDirection = notification.displayDirection();
        this.scopeLabel = notification.scopeLabel();
        this.sourceEventAt = notification.sourceEventAt();
        this.url = candidate.url();
        this.createdAt = now;
    }

    public static PushNotificationEventEntity create(String id, PushNotificationCandidate candidate, Instant now) {
        return new PushNotificationEventEntity(id, candidate, now);
    }

    public static PushNotificationEventEntity create(
        String id,
        PushNotificationCandidate candidate,
        Instant sourceEventAt,
        PushNotificationFormatter formatter,
        Instant now
    ) {
        FormattedPushNotification notification = candidate.notification();
        if (sourceEventAt != null && !sourceEventAt.equals(candidate.sourceEventAt())) {
            notification = formatter.withSourceEventAt(notification, sourceEventAt);
        }
        return new PushNotificationEventEntity(id, candidate, notification, now);
    }

    public static PushNotificationEventEntity cleared(
        String id,
        PushNotificationEventEntity activeEvent,
        Instant now,
        PushNotificationFormatter formatter
    ) {
        return cleared(id, activeEvent, now, now, formatter);
    }

    public static PushNotificationEventEntity cleared(
        String id,
        PushNotificationEventEntity activeEvent,
        Instant clearedAt,
        Instant now,
        PushNotificationFormatter formatter
    ) {
        FormattedPushNotification notification = formatter.formatCleared(
            activeEvent.notificationSubject,
            activeEvent.eventLocation,
            activeEvent.displayDirection,
            activeEvent.scopeLabel,
            clearedAt
        );

        PushNotificationEventEntity event = new PushNotificationEventEntity();
        event.id = id;
        event.accountId = activeEvent.accountId;
        event.commuteId = activeEvent.commuteId;
        event.legId = activeEvent.legId;
        event.lineId = activeEvent.lineId;
        event.category = activeEvent.category;
        event.notificationKey = activeEvent.notificationKey;
        event.sourceIncidentKey = activeEvent.sourceIncidentKey;
        event.notificationState = "CLEARED";
        event.dedupeKey = activeEvent.dedupeKey + "|cleared";
        event.eventType = "service-restored";
        event.reminderBucket = "on-change";
        event.title = notification.title();
        event.body = notification.body();
        event.notificationSubject = notification.notificationSubject();
        event.eventLocation = notification.eventLocation();
        event.displayDirection = notification.displayDirection();
        event.scopeLabel = notification.scopeLabel();
        event.sourceEventAt = notification.sourceEventAt();
        event.url = "/";
        event.createdAt = now;
        return event;
    }

    public static PushNotificationEventEntity clearedFromObservation(
        String id,
        PushLineEventObservationEntity observation,
        Instant now,
        PushNotificationFormatter formatter
    ) {
        return clearedFromObservation(id, observation, now, now, formatter);
    }

    public static PushNotificationEventEntity clearedFromObservation(
        String id,
        PushLineEventObservationEntity observation,
        Instant clearedAt,
        Instant now,
        PushNotificationFormatter formatter
    ) {
        FormattedPushNotification notification = formatter.formatCleared(
            observation.getNotificationSubject(),
            observation.getEventLocation(),
            observation.getDisplayDirection(),
            observation.getScopeLabel(),
            clearedAt
        );

        PushNotificationEventEntity event = new PushNotificationEventEntity();
        event.id = id;
        event.accountId = observation.getAccountId();
        event.commuteId = null;
        event.legId = null;
        event.lineId = observation.getLineId();
        event.category = "line-current";
        event.notificationKey = observation.getNotificationKey();
        event.sourceIncidentKey = observation.getSourceIncidentKey();
        event.notificationState = "CLEARED";
        event.dedupeKey = observation.getAccountId()
            + "|line|"
            + observation.getLineId()
            + "|"
            + observation.getEventType()
            + "|on-change|"
            + observation.getNotificationKey()
            + "|cleared";
        event.eventType = "service-restored";
        event.reminderBucket = "on-change";
        event.title = notification.title();
        event.body = notification.body();
        event.notificationSubject = notification.notificationSubject();
        event.eventLocation = notification.eventLocation();
        event.displayDirection = notification.displayDirection();
        event.scopeLabel = notification.scopeLabel();
        event.sourceEventAt = notification.sourceEventAt();
        event.url = "/";
        event.createdAt = now;
        return event;
    }

    public String getId() { return id; }
    public String getAccountId() { return accountId; }
    public String getCommuteId() { return commuteId; }
    public String getLegId() { return legId; }
    public String getLineId() { return lineId; }
    public String getEventType() { return eventType; }
    public String getReminderBucket() { return reminderBucket; }
    public String getCategory() { return category; }
    public String getNotificationKey() { return notificationKey; }
    public String getSourceIncidentKey() { return sourceIncidentKey; }
    public String getNotificationState() { return notificationState; }
    public String getDedupeKey() { return dedupeKey; }
    public String getTitle() { return title; }
    public String getBody() { return body; }
    public String getNotificationSubject() { return notificationSubject; }
    public String getEventLocation() { return eventLocation; }
    public String getDisplayDirection() { return displayDirection; }
    public String getScopeLabel() { return scopeLabel; }
    public Instant getSourceEventAt() { return sourceEventAt; }
    public String getUrl() { return url; }
    public Instant getCreatedAt() { return createdAt; }
}
