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
@Table(name = "push_line_subscriptions")
public class PushLineSubscriptionEntity {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id")
    private AccountEntity account;

    @Column(name = "line_id")
    private String lineId;

    private boolean enabled;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    protected PushLineSubscriptionEntity() {}

    public static String idFor(String accountId, String lineId) {
        return accountId + ":" + lineId;
    }

    public static PushLineSubscriptionEntity create(AccountEntity account, String lineId, boolean enabled, Instant now) {
        PushLineSubscriptionEntity entity = new PushLineSubscriptionEntity();
        entity.id = idFor(account.getId(), lineId);
        entity.account = account;
        entity.lineId = lineId;
        entity.enabled = enabled;
        entity.createdAt = now;
        entity.updatedAt = now;
        return entity;
    }

    public void setEnabled(boolean enabled, Instant now) {
        this.enabled = enabled;
        this.updatedAt = now;
    }

    // Getters
    public String getId() { return id; }
    public AccountEntity getAccount() { return account; }
    public String getLineId() { return lineId; }
    public boolean isEnabled() { return enabled; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
