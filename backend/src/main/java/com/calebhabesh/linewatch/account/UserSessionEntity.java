package com.calebhabesh.linewatch.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "user_sessions")
public class UserSessionEntity {
    @Id
    private String id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id")
    private AccountEntity account;
    @Column(name = "token_hash")
    private String tokenHash;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "expires_at")
    private Instant expiresAt;

    protected UserSessionEntity() {}

    private UserSessionEntity(String id, AccountEntity account, String tokenHash, Instant createdAt, Instant expiresAt) {
        this.id = id;
        this.account = account;
        this.tokenHash = tokenHash;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    public static UserSessionEntity create(String id, AccountEntity account, String tokenHash, Instant createdAt, Instant expiresAt) {
        return new UserSessionEntity(id, account, tokenHash, createdAt, expiresAt);
    }

    public String getId() { return id; }
    public AccountEntity getAccount() { return account; }
    public String getTokenHash() { return tokenHash; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getExpiresAt() { return expiresAt; }
}
