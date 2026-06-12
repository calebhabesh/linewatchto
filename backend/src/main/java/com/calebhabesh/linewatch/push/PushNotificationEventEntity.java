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
    private String category;
    @Column(name = "dedupe_key")
    private String dedupeKey;
    private String title;
    private String body;
    private String url;
    @Column(name = "created_at")
    private Instant createdAt;

    protected PushNotificationEventEntity() {}

    private PushNotificationEventEntity(String id, PushNotificationCandidate candidate, Instant now) {
        this.id = id;
        this.accountId = candidate.accountId();
        this.commuteId = candidate.commuteId();
        this.legId = candidate.legId();
        this.category = candidate.category();
        this.dedupeKey = candidate.dedupeKey();
        this.title = candidate.title();
        this.body = candidate.body();
        this.url = candidate.url();
        this.createdAt = now;
    }

    public static PushNotificationEventEntity create(String id, PushNotificationCandidate candidate, Instant now) {
        return new PushNotificationEventEntity(id, candidate, now);
    }

    public String getId() { return id; }
    public String getAccountId() { return accountId; }
    public String getCommuteId() { return commuteId; }
    public String getLegId() { return legId; }
    public String getCategory() { return category; }
    public String getDedupeKey() { return dedupeKey; }
    public String getTitle() { return title; }
    public String getBody() { return body; }
    public String getUrl() { return url; }
    public Instant getCreatedAt() { return createdAt; }
}
