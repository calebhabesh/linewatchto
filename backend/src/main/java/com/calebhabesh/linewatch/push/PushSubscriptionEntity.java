package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.AccountEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "push_subscriptions")
public class PushSubscriptionEntity {
    @Id
    private String id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id")
    private AccountEntity account;
    @Column(columnDefinition = "text")
    private String endpoint;
    @Column(name = "endpoint_hash")
    private String endpointHash;
    @Column(name = "p256dh_key", columnDefinition = "text")
    private String p256dhKey;
    @Column(name = "auth_secret", columnDefinition = "text")
    private String authSecret;
    @Column(name = "user_agent")
    private String userAgent;
    private boolean enabled = true;
    @Column(name = "commute_notifications_enabled")
    private boolean commuteNotificationsEnabled = true;
    @Column(name = "planned_closure_notifications_enabled")
    private boolean plannedClosureNotificationsEnabled = true;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "updated_at")
    private Instant updatedAt;
    @Column(name = "last_seen_at")
    private Instant lastSeenAt;
    @Column(name = "disabled_at")
    private Instant disabledAt;

    protected PushSubscriptionEntity() {}

    private PushSubscriptionEntity(
        String id,
        AccountEntity account,
        String endpoint,
        String endpointHash,
        String p256dhKey,
        String authSecret,
        String userAgent,
        Instant now
    ) {
        this.id = id;
        this.account = account;
        this.endpoint = endpoint;
        this.endpointHash = endpointHash;
        this.p256dhKey = p256dhKey;
        this.authSecret = authSecret;
        this.userAgent = userAgent;
        this.createdAt = now;
        this.updatedAt = now;
        this.lastSeenAt = now;
    }

    public static PushSubscriptionEntity create(
        String id,
        AccountEntity account,
        String endpoint,
        String endpointHash,
        String p256dhKey,
        String authSecret,
        String userAgent,
        Instant now
    ) {
        return new PushSubscriptionEntity(id, account, endpoint, endpointHash, p256dhKey, authSecret, userAgent, now);
    }

    public void refresh(String p256dhKey, String authSecret, String userAgent, Instant now) {
        this.p256dhKey = p256dhKey;
        this.authSecret = authSecret;
        this.userAgent = userAgent;
        this.enabled = true;
        this.disabledAt = null;
        this.updatedAt = now;
        this.lastSeenAt = now;
    }

    public void disable(Instant now) {
        this.enabled = false;
        this.disabledAt = now;
        this.updatedAt = now;
    }

    public void updatePreferences(boolean commuteNotificationsEnabled, boolean plannedClosureNotificationsEnabled, Instant now) {
        this.commuteNotificationsEnabled = commuteNotificationsEnabled;
        this.plannedClosureNotificationsEnabled = plannedClosureNotificationsEnabled;
        this.updatedAt = now;
        this.lastSeenAt = now;
    }

    public String getId() { return id; }
    public AccountEntity getAccount() { return account; }
    public String getEndpoint() { return endpoint; }
    public String getEndpointHash() { return endpointHash; }
    public String getP256dhKey() { return p256dhKey; }
    public String getAuthSecret() { return authSecret; }
    public String getUserAgent() { return userAgent; }
    public boolean isEnabled() { return enabled; }
    public boolean isCommuteNotificationsEnabled() { return commuteNotificationsEnabled; }
    public boolean isPlannedClosureNotificationsEnabled() { return plannedClosureNotificationsEnabled; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getLastSeenAt() { return lastSeenAt; }
    public Instant getDisabledAt() { return disabledAt; }
}
