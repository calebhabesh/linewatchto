package com.calebhabesh.linewatch.push;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;

@Entity
@Table(name = "push_saved_commute_event_observations")
public class PushSavedCommuteEventObservationEntity {
    @Id
    private String id;

    @Column(name = "account_id")
    private String accountId;

    @Column(name = "commute_id")
    private String commuteId;

    @Column(name = "leg_id")
    private String legId;

    private String category;

    @Column(name = "line_id")
    private String lineId;

    @Column(name = "event_type")
    private String eventType;

    @Column(name = "notification_key")
    private String notificationKey;

    @Column(name = "source_incident_key")
    private String sourceIncidentKey;

    @Column(name = "update_fingerprint")
    private String updateFingerprint;

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

    @Column(name = "source_updated_at")
    private Instant sourceUpdatedAt;

    private String url;

    @Column(name = "observed_at")
    private Instant observedAt;

    @Column(name = "last_seen_at")
    private Instant lastSeenAt;

    @Column(name = "cleared_at")
    private Instant clearedAt;

    @Column(name = "delivery_allowed")
    private boolean deliveryAllowed;

    @Column(name = "baseline_suppressed")
    private boolean baselineSuppressed;

    protected PushSavedCommuteEventObservationEntity() {}

    public static String idFor(String accountId, String sourceIncidentKey) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String encoded = HexFormat.of().formatHex(
                digest.digest((accountId + "|" + sourceIncidentKey).getBytes(StandardCharsets.UTF_8))
            );
            return "saved_commute_obs_" + encoded.substring(0, 48);
        } catch (Exception ex) {
            throw new IllegalStateException("Could not build saved commute event observation id", ex);
        }
    }

    public static PushSavedCommuteEventObservationEntity create(
        String id,
        PushNotificationCandidate candidate,
        Instant now
    ) {
        return create(id, candidate, now, false);
    }

    public static PushSavedCommuteEventObservationEntity create(
        String id,
        PushNotificationCandidate candidate,
        Instant now,
        boolean baselineSuppressed
    ) {
        PushSavedCommuteEventObservationEntity entity = new PushSavedCommuteEventObservationEntity();
        entity.id = id;
        entity.applyCandidate(candidate);
        entity.baselineSuppressed = baselineSuppressed;
        entity.observedAt = now;
        entity.lastSeenAt = now;
        return entity;
    }

    public void refresh(PushNotificationCandidate candidate, Instant now) {
        applyCandidate(candidate);
        this.lastSeenAt = now;
    }

    private void applyCandidate(PushNotificationCandidate candidate) {
        this.accountId = candidate.accountId();
        this.commuteId = candidate.commuteId();
        this.legId = candidate.legId();
        this.category = candidate.category();
        this.lineId = candidate.lineId();
        this.eventType = candidate.eventType();
        this.notificationKey = candidate.notificationKey();
        this.sourceIncidentKey = candidate.sourceIncidentKey();
        this.updateFingerprint = candidate.updateFingerprint();
        this.notificationSubject = candidate.notificationSubject();
        this.eventLocation = candidate.eventLocation();
        this.displayDirection = candidate.displayDirection();
        this.scopeLabel = candidate.scopeLabel();
        this.sourceEventAt = candidate.sourceEventAt();
        this.sourceUpdatedAt = candidate.sourceUpdatedAt();
        this.url = candidate.url();
        this.deliveryAllowed = candidate.deliveryAllowed();
    }

    public void suppressBaseline() { this.baselineSuppressed = true; }

    public void clearBaselineSuppression() { this.baselineSuppressed = false; }

    public void markCleared(Instant now) {
        this.clearedAt = now;
    }

    public String getId() { return id; }
    public String getAccountId() { return accountId; }
    public String getCommuteId() { return commuteId; }
    public String getLegId() { return legId; }
    public String getCategory() { return category; }
    public String getLineId() { return lineId; }
    public String getEventType() { return eventType; }
    public String getNotificationKey() { return notificationKey; }
    public String getSourceIncidentKey() { return sourceIncidentKey; }
    public String getUpdateFingerprint() { return updateFingerprint; }
    public String getNotificationSubject() { return notificationSubject; }
    public String getEventLocation() { return eventLocation; }
    public String getDisplayDirection() { return displayDirection; }
    public String getScopeLabel() { return scopeLabel; }
    public Instant getSourceEventAt() { return sourceEventAt; }
    public Instant getSourceUpdatedAt() { return sourceUpdatedAt; }
    public String getUrl() { return url; }
    public Instant getObservedAt() { return observedAt; }
    public Instant getLastSeenAt() { return lastSeenAt; }
    public Instant getClearedAt() { return clearedAt; }
    public boolean isDeliveryAllowed() { return deliveryAllowed; }
    public boolean isBaselineSuppressed() { return baselineSuppressed; }
}
